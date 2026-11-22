import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessList, atomic, database, derivePassword, flagsToPermissions, hash, matchesPassword, ownerOf, snapshot, token, uuid } from "@/lib/store";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookie = "spisak_session";
const month = 30 * 86400;
const day = 86400000;
const name = z.string().trim().min(1).max(100);
const detail = z.string().trim().max(200);
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const scope = z.enum(["list", "folder"]);
const identifier = z.uuid();
const permissions = z.object({ add: z.boolean(), edit: z.boolean(), remove: z.boolean() });
const flags = (p: z.infer<typeof permissions>) => Number(p.add) | (Number(p.edit) << 1) | (Number(p.remove) << 2);
const commands = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["register", "login"]), email, password: z.string().min(8).max(128) }),
  z.object({ action: z.literal("logout") }),
  z.object({ action: z.literal("createFolder"), name }),
  z.object({ action: z.literal("createList"), name, folderId: identifier.nullable() }),
  z.object({ action: z.literal("rename"), scope, id: identifier, name }),
  z.object({ action: z.literal("add"), listId: identifier, name, quantity: detail, note: detail }),
  z.object({ action: z.literal("edit"), listId: identifier, id: identifier, name, quantity: detail, note: detail }),
  z.object({ action: z.literal("remove"), listId: identifier, id: identifier }),
  z.object({ action: z.literal("check"), listId: identifier, id: identifier, checked: z.boolean(), changeId: z.string().min(8).max(80).optional() }),
  z.object({ action: z.literal("invite"), scope, id: identifier, permissions }),
  z.object({ action: z.literal("accept"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  z.object({ action: z.literal("members"), scope, id: identifier }),
  z.object({ action: z.literal("grant"), scope, id: identifier, userId: identifier, permissions }),
  z.object({ action: z.literal("revoke"), scope, id: identifier, userId: identifier })
]);

function session(req: NextRequest): User | undefined {
  const value = req.cookies.get(cookie)?.value;
  if (!value) return;
  const row = database().prepare(`
    SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.key = ? AND s.expires > ?
  `).get(hash(value), Date.now());
  if (row) return { id: String(row.id), email: String(row.email) };
}

const reply = (data: object, status = 200, headers?: HeadersInit) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
const fail = (message: string, status: number) => reply({ error: message }, status);

export function GET(req: NextRequest) {
  const user = session(req);
  if (!user) return fail("Prijavi se za pristup spiskovima.", 401);
  const data = snapshot(user);
  const etag = '"' + hash(JSON.stringify(data)) + '"';
  if (req.headers.get("If-None-Match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-store" } });
  }
  return reply(data, 200, { ETag: etag });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const expectedOrigin = process.env.SPISAK_ORIGIN;
  if (origin && (expectedOrigin ? origin !== expectedOrigin : new URL(origin).host !== host)) {
    return fail("Zahtev nije dozvoljen.", 403);
  }
  if (!req.headers.get("content-type")?.startsWith("application/json")) return fail("Očekivan je JSON zahtev.", 415);
  const raw = await req.text();
  if (raw.length > 4096) return fail("Zahtev je predugačak.", 413);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return fail("Neispravan JSON zahtev.", 400); }
  const valid = commands.safeParse(parsed);
  if (!valid.success) return fail("Proveri unete podatke. Lozinka mora imati najmanje 8 znakova.", 400);
  const cmd = valid.data;
  const db = database();

  if (cmd.action === "login" || cmd.action === "register") {
    const now = Date.now();
    const key = hash(cmd.email);
    db.prepare("DELETE FROM auth_attempts WHERE start < ?").run(now - 15 * 60_000);
    const attempts = db.prepare(`
      INSERT INTO auth_attempts VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count
    `).get(key, now);
    if (Number(attempts?.count) > 12) return fail("Previše pokušaja. Pokušaj ponovo kasnije.", 429);
    const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(cmd.email);
    let userId: string;
    if (cmd.action === "register") {
      userId = uuid();
      const inserted = db.prepare("INSERT OR IGNORE INTO users VALUES (?, ?, ?)").run(userId, cmd.email, derivePassword(cmd.password));
      if (!inserted.changes) return fail("Taj mejl je već registrovan.", 409);
    } else {
      const stored = existing ? String(existing.password) : `${"0".repeat(32)}:${"0".repeat(128)}`;
      if (!matchesPassword(cmd.password, stored) || !existing) return fail("Mejl ili lozinka nisu ispravni.", 401);
      userId = String(existing.id);
    }
    db.prepare("DELETE FROM auth_attempts WHERE key = ?").run(key);
    db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
    const sessionToken = token();
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hash(sessionToken), userId, now + month * 1000);
    const response = reply(snapshot({ id: userId, email: cmd.email }));
    response.cookies.set(cookie, sessionToken, { httpOnly: true, sameSite: "lax", secure: (origin ?? expectedOrigin ?? req.url).startsWith("https:"), path: "/", maxAge: month });
    return response;
  }

  if (cmd.action === "logout") {
    const value = req.cookies.get(cookie)?.value;
    if (value) db.prepare("DELETE FROM sessions WHERE key = ?").run(hash(value));
    const response = reply({ ok: true });
    response.cookies.delete(cookie);
    return response;
  }

  const user = session(req);
  if (!user) return fail("Prijavi se za pristup spiskovima.", 401);

  return atomic(() => {
    if (cmd.action === "createFolder") {
      const id = uuid();
      db.prepare("INSERT INTO folders VALUES (?, ?, ?)").run(id, user.id, cmd.name);
      return reply({ id });
    }
    if (cmd.action === "createList") {
      if (cmd.folderId && ownerOf("folder", cmd.folderId) !== user.id) return fail("Folder nije dostupan za dodavanje spiska.", 403);
      const id = uuid();
      db.prepare("INSERT INTO lists VALUES (?, ?, ?, ?)").run(id, user.id, cmd.folderId, cmd.name);
      return reply({ id });
    }
    if (cmd.action === "accept") {
      const key = hash(cmd.token);
      const entry = db.prepare("SELECT * FROM invites WHERE key = ?").get(key);
      if (!entry) return fail("Poziv nije pronađen.", 404);
      const targetScope = entry.scope === "list" ? "list" : "folder";
      const target = String(entry.target_id);
      const owner = ownerOf(targetScope, target);
      if (!owner) return fail("Spisak ili folder više nije dostupan.", 404);
      if (owner === user.id) return reply({ id: target, scope: targetScope });
      if (entry.accepted_by === user.id) {
        const stillGranted = db.prepare("SELECT 1 FROM grants WHERE scope = ? AND target_id = ? AND user_id = ?").get(targetScope, target, user.id);
        return stillGranted ? reply({ id: target, scope: targetScope }) : fail("Pristup je ukinut.", 403);
      }
      if (entry.accepted_by || Number(entry.expires) < Date.now()) return fail("Poziv je iskorišćen ili je istekao.", 410);
      db.prepare("INSERT INTO grants VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").run(targetScope, target, user.id, Number(entry.flags));
      db.prepare("UPDATE invites SET accepted_by = ? WHERE key = ?").run(user.id, key);
      return reply({ id: target, scope: targetScope });
    }
    if ("scope" in cmd) {
      if (ownerOf(cmd.scope, cmd.id) !== user.id) return fail("Ovom opcijom upravlja vlasnik.", 403);
      if (cmd.action === "rename") {
        const table = cmd.scope === "list" ? "lists" : "folders";
        db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(cmd.name, cmd.id);
      }
      if (cmd.action === "invite") {
        const linkToken = token();
        db.prepare("DELETE FROM invites WHERE expires < ?").run(Date.now());
        db.prepare("INSERT INTO invites VALUES (?, ?, ?, ?, ?, NULL)").run(hash(linkToken), cmd.scope, cmd.id, flags(cmd.permissions), Date.now() + 7 * day);
        return reply({ token: linkToken });
      }
      if (cmd.action === "members") {
        const rows = db.prepare(`
          SELECT u.id, u.email, g.flags FROM grants g JOIN users u ON u.id = g.user_id
          WHERE g.scope = ? AND g.target_id = ? ORDER BY u.email
        `).all(cmd.scope, cmd.id);
        return reply({ members: rows.map(row => ({ id: row.id, email: row.email, permissions: flagsToPermissions(Number(row.flags)) })) });
      }
      if (cmd.action === "grant") {
        db.prepare("UPDATE grants SET flags = ? WHERE scope = ? AND target_id = ? AND user_id = ?").run(flags(cmd.permissions), cmd.scope, cmd.id, cmd.userId);
      }
      if (cmd.action === "revoke") {
        db.prepare("DELETE FROM grants WHERE scope = ? AND target_id = ? AND user_id = ?").run(cmd.scope, cmd.id, cmd.userId);
      }
      return reply({ ok: true });
    }
    if ("listId" in cmd) {
      if (cmd.action === "check" && cmd.changeId) {
        const recorded = db.prepare("SELECT 1 FROM check_receipts WHERE user_id = ? AND change_id = ?").get(user.id, cmd.changeId);
        if (recorded) return reply({ ok: true });
      }
      const access = accessList(user.id, cmd.listId);
      if (!access) return fail("Spisak nije dostupan.", 403);
      if (cmd.action !== "check" && !access.permissions[cmd.action]) return fail("Nemaš dozvolu za ovu izmenu.", 403);
      if (cmd.action === "add") {
        const id = uuid();
        db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, 0)").run(id, cmd.listId, cmd.name, cmd.quantity, cmd.note);
        return reply({ id });
      }
      const item = db.prepare("SELECT id FROM items WHERE id = ? AND list_id = ?").get(cmd.id, cmd.listId);
      if (!item) return fail("Namirnica više nije na spisku.", 404);
      if (cmd.action === "check") {
        db.prepare("UPDATE items SET checked = ? WHERE id = ?").run(Number(cmd.checked), cmd.id);
        if (cmd.changeId) {
          db.prepare("DELETE FROM check_receipts WHERE created < ?").run(Date.now() - 30 * day);
          db.prepare("INSERT INTO check_receipts VALUES (?, ?, ?)").run(user.id, cmd.changeId, Date.now());
        }
      }
      if (cmd.action === "edit") db.prepare("UPDATE items SET name = ?, quantity = ?, note = ? WHERE id = ?").run(cmd.name, cmd.quantity, cmd.note, cmd.id);
      if (cmd.action === "remove") db.prepare("DELETE FROM items WHERE id = ?").run(cmd.id);
    }
    return reply({ ok: true });
  });
}

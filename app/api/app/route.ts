import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { execute, first, allRows, accessList, atomic, database, derivePassword, flagsToPermissions, hash, matchesPassword, ownerOf, snapshot, token, uuid } from "@/lib/store";
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

async function session(req: NextRequest): Promise<User | undefined> {
  const value = req.cookies.get(cookie)?.value;
  if (!value) return;
  const db = await database();
  const row = await first(db, `
    SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.key = ? AND s.expires > ?
  `, hash(value), Date.now());
  if (row) return { id: String(row.id), email: String(row.email) };
}

const reply = (data: object, status = 200, headers?: HeadersInit) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
const fail = (message: string, status: number) => reply({ error: message }, status);

export async function GET(req: NextRequest) {
  const user = await session(req);
  if (!user) return fail("Prijavi se za pristup spiskovima.", 401);
  const data = await snapshot(await database(), user);
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


  if (cmd.action === "login" || cmd.action === "register") {
    return atomic(async db => {
      const now = Date.now();
      const key = hash(cmd.email);
      await execute(db, "DELETE FROM auth_attempts WHERE start < ?", now - 15 * 60_000);
      const attempts = await first(db, `
        INSERT INTO auth_attempts VALUES (?, ?, 1)
        ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count
      `, key, now);
      if (Number(attempts?.count) > 12) return fail("Previše pokušaja. Pokušaj ponovo kasnije.", 429);
      const existing = await first(db, "SELECT * FROM users WHERE email = ?", cmd.email);
      let userId: string;
      if (cmd.action === "register") {
        userId = uuid();
        const inserted = await execute(db, "INSERT OR IGNORE INTO users VALUES (?, ?, ?)", userId, cmd.email, derivePassword(cmd.password));
        if (!inserted.rowsAffected) return fail("Taj mejl je već registrovan.", 409);
      } else {
        const stored = existing ? String(existing.password) : `${"0".repeat(32)}:${"0".repeat(128)}`;
        if (!matchesPassword(cmd.password, stored) || !existing) return fail("Mejl ili lozinka nisu ispravni.", 401);
        userId = String(existing.id);
      }
      await execute(db, "DELETE FROM auth_attempts WHERE key = ?", key);
      await execute(db, "DELETE FROM sessions WHERE expires <= ?", now);
      const sessionToken = token();
      await execute(db, "INSERT INTO sessions VALUES (?, ?, ?)", hash(sessionToken), userId, now + month * 1000);
      const response = reply(await snapshot(db, { id: userId, email: cmd.email }));
      response.cookies.set(cookie, sessionToken, { httpOnly: true, sameSite: "lax", secure: (origin ?? expectedOrigin ?? req.url).startsWith("https:"), path: "/", maxAge: month });
      return response;
    });
  }

  if (cmd.action === "logout") {
    const value = req.cookies.get(cookie)?.value;
    const db = await database();
    if (value) await execute(db, "DELETE FROM sessions WHERE key = ?", hash(value));
    const response = reply({ ok: true });
    response.cookies.delete(cookie);
    return response;
  }

  const user = await session(req);
  if (!user) return fail("Prijavi se za pristup spiskovima.", 401);

  const metadata = z.object({
    operationId: z.string().min(8).max(80), entityId: identifier, accountId: identifier
  }).safeParse(parsed);
  const op = metadata.success ? metadata.data : null;
  if (op && op.accountId !== user.id) return fail("Nalog je promenjen.", 403);
  return atomic(async db => {
    if (op && await first(db, "SELECT 1 FROM check_receipts WHERE user_id = ? AND change_id = ?", user.id, op.operationId)) {
      return reply({ id: op.entityId });
    }
    const apply = async () => {
      if (cmd.action === "createFolder") {
        const id = op?.entityId ?? uuid();
        await execute(db, "INSERT INTO folders VALUES (?, ?, ?)", id, user.id, cmd.name);
        return reply({ id });
      }
      if (cmd.action === "createList") {
        if (cmd.folderId && await ownerOf(db, "folder", cmd.folderId) !== user.id) return fail("Folder nije dostupan za dodavanje spiska.", 403);
        const id = op?.entityId ?? uuid();
        await execute(db, "INSERT INTO lists VALUES (?, ?, ?, ?)", id, user.id, cmd.folderId, cmd.name);
        return reply({ id });
      }
      if (cmd.action === "accept") {
        const key = hash(cmd.token);
        const entry = await first(db, "SELECT * FROM invites WHERE key = ?", key);
        if (!entry) return fail("Poziv nije pronađen.", 404);
        const targetScope = entry.scope === "list" ? "list" : "folder";
        const target = String(entry.target_id);
        const owner = await ownerOf(db, targetScope, target);
        if (!owner) return fail("Spisak ili folder više nije dostupan.", 404);
        if (owner === user.id) return reply({ id: target, scope: targetScope });
        if (entry.accepted_by === user.id) {
          const stillGranted = await first(db, "SELECT 1 FROM grants WHERE scope = ? AND target_id = ? AND user_id = ?", targetScope, target, user.id);
          return stillGranted ? reply({ id: target, scope: targetScope }) : fail("Pristup je ukinut.", 403);
        }
        if (entry.accepted_by || Number(entry.expires) < Date.now()) return fail("Poziv je iskorišćen ili je istekao.", 410);
        await execute(db, "INSERT INTO grants VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", targetScope, target, user.id, Number(entry.flags));
        await execute(db, "UPDATE invites SET accepted_by = ? WHERE key = ?", user.id, key);
        return reply({ id: target, scope: targetScope });
      }
      if ("scope" in cmd) {
        if (await ownerOf(db, cmd.scope, cmd.id) !== user.id) return fail("Ovom opcijom upravlja vlasnik.", 403);
        if (cmd.action === "rename") {
          const table = cmd.scope === "list" ? "lists" : "folders";
          await execute(db, `UPDATE ${table} SET name = ? WHERE id = ?`, cmd.name, cmd.id);
        }
        if (cmd.action === "invite") {
          const linkToken = token();
          await execute(db, "DELETE FROM invites WHERE expires < ?", Date.now());
          await execute(db, "INSERT INTO invites VALUES (?, ?, ?, ?, ?, NULL)", hash(linkToken), cmd.scope, cmd.id, flags(cmd.permissions), Date.now() + 7 * day);
          return reply({ token: linkToken });
        }
        if (cmd.action === "members") {
          const rows = await allRows(db, `
            SELECT u.id, u.email, g.flags FROM grants g JOIN users u ON u.id = g.user_id
            WHERE g.scope = ? AND g.target_id = ? ORDER BY u.email
          `, cmd.scope, cmd.id);
          return reply({ members: rows.map(row => ({ id: row.id, email: row.email, permissions: flagsToPermissions(Number(row.flags)) })) });
        }
        if (cmd.action === "grant") {
          await execute(db, "UPDATE grants SET flags = ? WHERE scope = ? AND target_id = ? AND user_id = ?", flags(cmd.permissions), cmd.scope, cmd.id, cmd.userId);
        }
        if (cmd.action === "revoke") {
          await execute(db, "DELETE FROM grants WHERE scope = ? AND target_id = ? AND user_id = ?", cmd.scope, cmd.id, cmd.userId);
        }
        return reply({ ok: true });
      }
      if ("listId" in cmd) {
        if (cmd.action === "check" && cmd.changeId) {
          const recorded = await first(db, "SELECT 1 FROM check_receipts WHERE user_id = ? AND change_id = ?", user.id, cmd.changeId);
          if (recorded) return reply({ ok: true });
        }
        const access = await accessList(db, user.id, cmd.listId);
        if (!access) return fail("Spisak nije dostupan.", 403);
        if (cmd.action !== "check" && !access.permissions[cmd.action]) return fail("Nemaš dozvolu za ovu izmenu.", 403);
        if (cmd.action === "add") {
          const id = op?.entityId ?? uuid();
          await execute(db, "INSERT INTO items VALUES (?, ?, ?, ?, ?, 0)", id, cmd.listId, cmd.name, cmd.quantity, cmd.note);
          return reply({ id });
        }
        const item = await first(db, "SELECT id FROM items WHERE id = ? AND list_id = ?", cmd.id, cmd.listId);
        if (!item) return fail("Namirnica više nije na spisku.", 404);
        if (cmd.action === "check") {
          await execute(db, "UPDATE items SET checked = ? WHERE id = ?", Number(cmd.checked), cmd.id);
          if (cmd.changeId) {
            await execute(db, "DELETE FROM check_receipts WHERE created < ?", Date.now() - 30 * day);
            await execute(db, "INSERT INTO check_receipts VALUES (?, ?, ?)", user.id, cmd.changeId, Date.now());
          }
        }
        if (cmd.action === "edit") await execute(db, "UPDATE items SET name = ?, quantity = ?, note = ? WHERE id = ?", cmd.name, cmd.quantity, cmd.note, cmd.id);
        if (cmd.action === "remove") await execute(db, "DELETE FROM items WHERE id = ?", cmd.id);
      }
      return reply({ ok: true });
    };
    const response = await apply();
    if (op && response.ok) {
      await execute(db, "INSERT OR IGNORE INTO check_receipts VALUES (?, ?, ?)", user.id, op.operationId, Date.now());
    }
    return response;
  });
}

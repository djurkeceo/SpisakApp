import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server.js";
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "next/server") specifier = "next/server.js";
  if (specifier.startsWith("@/")) specifier = new URL("../" + specifier.slice(2) + ".ts", import.meta.url).href;
  return next(specifier, context);
}});
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.SPISAK_DB_PATH = ":memory:";
const { GET, POST } = await import("../app/api/app/route.ts");
const { database } = await import("../lib/store.ts");
async function command(cookie, action, payload = {}, expected = 200) {
  const response = await POST(new NextRequest("http://localhost:3000/api/app", {
    method: "POST", headers: { "Content-Type": "application/json", cookie, host: "localhost:3000", origin: "http://localhost:3000" },
    body: JSON.stringify({ action, ...payload })
  }));
  const json = await response.json();
  assert.equal(response.status, expected, JSON.stringify(json));
  return { ...json, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function read(cookie) { return (await GET(new NextRequest("http://localhost:3000/api/app", { headers: { cookie } }))).json(); }
try {
  const a = await command("", "register", { email: "a@example.com", password: "demo-password" });
  const b = await command("", "register", { email: "b@example.com", password: "demo-password" });
  const c = await command("", "register", { email: "c@example.com", password: "demo-password" });
  const login = await command("", "login", { email: "a@example.com", password: "demo-password" });
  assert.equal((await read(login.cookie)).user.id, a.user.id);
  const folder = await command(a.cookie, "createFolder", { name: "Dom" });
  const list = await command(a.cookie, "createList", { name: "Nabavka", folderId: folder.id });
  const fields = { listId: list.id, name: "Mleko", quantity: "2 l", note: "" };
  const item = await command(a.cookie, "add", fields);
  assert.equal((await read(b.cookie)).lists.length, 0);
  const invite = await command(a.cookie, "invite", { scope: "folder", id: folder.id, permissions: { add: false, edit: false, remove: false } });
  await command(b.cookie, "accept", { token: invite.token });
  await command(c.cookie, "accept", { token: invite.token }, 410);
  await command(b.cookie, "edit", { ...fields, id: item.id }, 403);
  await command(a.cookie, "edit", { ...fields, id: item.id, quantity: "3 l" });
  const mark = { listId: list.id, id: item.id, checked: true, changeId: "offline-change-1" };
  await command(b.cookie, "check", mark);
  const bought = (await read(a.cookie)).items[0];
  assert.equal(bought.checked, true);
  assert.equal(bought.quantity, "3 l");
  await command(a.cookie, "check", { ...mark, checked: false });
  await command(b.cookie, "check", mark);
  assert.equal((await read(a.cookie)).items[0].checked, false);
  await command(a.cookie, "grant", { scope: "folder", id: folder.id, userId: b.user.id, permissions: { add: true, edit: false, remove: false } });
  await command(b.cookie, "add", { ...fields, name: "Jaja" });
  await command(a.cookie, "createList", { name: "Sutra", folderId: folder.id });
  assert.equal((await read(b.cookie)).lists.length, 2);
  await command(a.cookie, "revoke", { scope: "folder", id: folder.id, userId: b.user.id });
  assert.equal((await read(b.cookie)).lists.length, 0);
  await command(b.cookie, "accept", { token: invite.token }, 403);
  console.log("API proverio registraciju, pozive, dozvole, deljenje foldera, čekiranje, ponovljenu isporuku i ukidanje pristupa.");
} finally {
  (await database()).close();
}
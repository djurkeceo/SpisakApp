import assert from "node:assert/strict";
import { test, after } from "node:test";
import { execute, accessList, atomic, database, derivePassword, matchesPassword, snapshot } from "../lib/store.ts";

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.SPISAK_DB_PATH = ":memory:";
const db = await database();
const owner = { id: "owner", email: "owner@example.com" };
const guest = { id: "guest", email: "guest@example.com" };

for (const user of [owner, guest]) await execute(db, "INSERT INTO users VALUES (?, ?, ?)", user.id, user.email, "unused");
await execute(db, "INSERT INTO folders VALUES (?, ?, ?)", "folder", owner.id, "Domaćinstvo");
await execute(db, "INSERT INTO lists VALUES (?, ?, ?, ?)", "list", owner.id, "folder", "Spisak");
await execute(db, "INSERT INTO lists VALUES (?, ?, ?, ?)", "private", owner.id, null, "Privatni spisak");
await execute(db, "INSERT INTO items VALUES (?, ?, ?, ?, ?, 0)", "milk", "list", "Mleko", "2 l", "Bez laktoze");

after(() => {
  db.close();
});

test("Deljenje foldera obuhvata nove spiskove, a direktna dozvola ima prednost", async () => {
  assert.equal((await accessList(db, guest.id, "list")), undefined);
  await execute(db, "INSERT INTO grants VALUES (?, ?, ?, ?)", "folder", "folder", guest.id, 3);
  await execute(db, "INSERT INTO lists VALUES (?, ?, ?, ?)", "next", owner.id, "folder", "Sledeća nabavka");
  assert.deepEqual((await accessList(db, guest.id, "next"))?.permissions, { add: true, edit: true, remove: false });
  await execute(db, "INSERT INTO grants VALUES (?, ?, ?, ?)", "list", "list", guest.id, 0);
  assert.deepEqual((await accessList(db, guest.id, "list"))?.permissions, { add: false, edit: false, remove: false });
  assert.deepEqual((await snapshot(db, guest)).lists.map(list => list.id), ["list", "next"]);
  assert.deepEqual((await snapshot(db, guest)).items.map(item => item.name), ["Mleko"]);
  assert.equal((await accessList(db, guest.id, "private")), undefined);
});

test("Čekiranje čuva novu količinu i napomenu, a neuspešna transakcija se poništava", async () => {
  await execute(db, "UPDATE items SET quantity = ?, note = ? WHERE id = ?", "3 l", "Punomasno", "milk");
  await execute(db, "UPDATE items SET checked = ? WHERE id = ?", 1, "milk");
  await assert.rejects(atomic(async db => {
    await execute(db, "UPDATE items SET checked = 0 WHERE id = ?", "milk");
    throw new Error("prekid");
  }), /prekid/);
  assert.deepEqual((await snapshot(db, owner)).items[0], {
    id: "milk", listId: "list", name: "Mleko", quantity: "3 l", note: "Punomasno", checked: true
  });
});

test("Lozinke koriste nasumične soli i proveravaju se uz ispravnu vrednost", async () => {
  const first = derivePassword("sigurna-lozinka");
  assert.notEqual(first, derivePassword("sigurna-lozinka"));
  assert.equal(matchesPassword("sigurna-lozinka", first), true);
  assert.equal(matchesPassword("pogrešna-lozinka", first), false);
});

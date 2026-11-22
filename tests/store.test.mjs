import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessList, atomic, database, derivePassword, matchesPassword, snapshot } from "../lib/store.ts";

const folderPath = mkdtempSync(join(tmpdir(), "spisak-test-"));
process.env.SPISAK_DB_PATH = join(folderPath, "test.sqlite");
const db = database();
const owner = { id: "owner", email: "owner@example.com" };
const guest = { id: "guest", email: "guest@example.com" };

for (const user of [owner, guest]) db.prepare("INSERT INTO users VALUES (?, ?, ?)").run(user.id, user.email, "unused");
db.prepare("INSERT INTO folders VALUES (?, ?, ?)").run("folder", owner.id, "Domaćinstvo");
db.prepare("INSERT INTO lists VALUES (?, ?, ?, ?)").run("list", owner.id, "folder", "Spisak");
db.prepare("INSERT INTO lists VALUES (?, ?, ?, ?)").run("private", owner.id, null, "Privatni spisak");
db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, 0)").run("milk", "list", "Mleko", "2 l", "Bez laktoze");

after(() => {
  db.close();
  rmSync(folderPath, { recursive: true, force: true });
});

test("Deljenje foldera obuhvata nove spiskove, a direktna dozvola ima prednost", () => {
  assert.equal(accessList(guest.id, "list"), undefined);
  db.prepare("INSERT INTO grants VALUES (?, ?, ?, ?)").run("folder", "folder", guest.id, 3);
  db.prepare("INSERT INTO lists VALUES (?, ?, ?, ?)").run("next", owner.id, "folder", "Sledeća nabavka");
  assert.deepEqual(accessList(guest.id, "next")?.permissions, { add: true, edit: true, remove: false });
  db.prepare("INSERT INTO grants VALUES (?, ?, ?, ?)").run("list", "list", guest.id, 0);
  assert.deepEqual(accessList(guest.id, "list")?.permissions, { add: false, edit: false, remove: false });
  assert.deepEqual(snapshot(guest).lists.map(list => list.id), ["list", "next"]);
  assert.deepEqual(snapshot(guest).items.map(item => item.name), ["Mleko"]);
  assert.equal(accessList(guest.id, "private"), undefined);
});

test("Čekiranje čuva novu količinu i napomenu, a neuspešna transakcija se poništava", () => {
  db.prepare("UPDATE items SET quantity = ?, note = ? WHERE id = ?").run("3 l", "Punomasno", "milk");
  db.prepare("UPDATE items SET checked = ? WHERE id = ?").run(1, "milk");
  assert.throws(() => atomic(() => {
    db.prepare("UPDATE items SET checked = 0 WHERE id = ?").run("milk");
    throw new Error("prekid");
  }), /prekid/);
  assert.deepEqual(snapshot(owner).items[0], {
    id: "milk", listId: "list", name: "Mleko", quantity: "3 l", note: "Punomasno", checked: true
  });
});

test("Lozinke koriste nasumične soli i proveravaju se uz ispravnu vrednost", () => {
  const first = derivePassword("sigurna-lozinka");
  assert.notEqual(first, derivePassword("sigurna-lozinka"));
  assert.equal(matchesPassword("sigurna-lozinka", first), true);
  assert.equal(matchesPassword("pogrešna-lozinka", first), false);
});

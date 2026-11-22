import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Dashboard, Scope, User } from "./types.ts";

export const uuid = randomUUID;
export const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const token = () => randomBytes(32).toString("base64url");

let connection: DatabaseSync | undefined;

export function database() {
  if (connection) return connection;
  const file = resolve(process.env.SPISAK_DB_PATH || "data/spisak.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE, name TEXT NOT NULL, quantity TEXT NOT NULL, note TEXT NOT NULL, checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS grants (scope TEXT NOT NULL, target_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), flags INTEGER NOT NULL, PRIMARY KEY (scope, target_id, user_id));
    CREATE TABLE IF NOT EXISTS invites (key TEXT PRIMARY KEY, scope TEXT NOT NULL, target_id TEXT NOT NULL, flags INTEGER NOT NULL, expires INTEGER NOT NULL, accepted_by TEXT REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS check_receipts (user_id TEXT NOT NULL REFERENCES users(id), change_id TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, change_id));
    CREATE INDEX IF NOT EXISTS check_receipts_by_date ON check_receipts(created);
    CREATE INDEX IF NOT EXISTS items_by_list ON items(list_id);
  `);
  connection = db;
  return db;
}

export function atomic<T>(action: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function derivePassword(password: string, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}

export function matchesPassword(password: string, stored: string) {
  const [salt] = stored.split(":");
  return timingSafeEqual(Buffer.from(derivePassword(password, salt)), Buffer.from(stored));
}

export function flagsToPermissions(flags: number) {
  return { add: (flags & 1) !== 0, edit: (flags & 2) !== 0, remove: (flags & 4) !== 0 };
}

export function ownerOf(scope: Scope, id: string) {
  const table = scope === "list" ? "lists" : "folders";
  return database().prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).get(id)?.owner_id;
}

const accessQuery = `
  SELECT l.*, (l.owner_id = ?) AS owned, COALESCE(d.flags, f.flags, 0) AS flags
  FROM lists l
  LEFT JOIN grants d ON d.scope = 'list' AND d.target_id = l.id AND d.user_id = ?
  LEFT JOIN grants f ON f.scope = 'folder' AND f.target_id = l.folder_id AND f.user_id = ?
  WHERE (l.owner_id = ? OR d.user_id IS NOT NULL OR f.user_id IS NOT NULL)
`;

export function accessList(user: string, list: string) {
  const row = database().prepare(accessQuery + " AND l.id = ?").get(user, user, user, user, list);
  return row && { owner: Boolean(row.owned), permissions: flagsToPermissions(row.owned ? 7 : Number(row.flags)) };
}

export function snapshot(user: User): Dashboard {
  const db = database();
  const folders = db.prepare(`
    SELECT f.*, (f.owner_id = ?) AS owned FROM folders f
    LEFT JOIN grants g ON g.scope = 'folder' AND g.target_id = f.id AND g.user_id = ?
    WHERE f.owner_id = ? OR g.user_id IS NOT NULL ORDER BY f.rowid
  `).all(user.id, user.id, user.id).map(row => ({ id: String(row.id), name: String(row.name), owner: Boolean(row.owned) }));
  const visibleFolders = new Set(folders.map(folder => folder.id));
  const rows = db.prepare(accessQuery + " ORDER BY l.rowid").all(user.id, user.id, user.id, user.id);
  const lists = rows.map(row => ({
    id: String(row.id), name: String(row.name),
    folderId: row.folder_id && visibleFolders.has(String(row.folder_id)) ? String(row.folder_id) : null,
    owner: Boolean(row.owned),
    permissions: row.owned ? flagsToPermissions(7) : flagsToPermissions(Number(row.flags))
  }));
  const itemsForList = db.prepare("SELECT * FROM items WHERE list_id = ? ORDER BY rowid");
  const items = lists.flatMap(list => itemsForList.all(list.id).map(row => ({
    id: String(row.id), listId: list.id, name: String(row.name), quantity: String(row.quantity),
    note: String(row.note), checked: Boolean(row.checked)
  })));
  return { user, folders, lists, items };
}

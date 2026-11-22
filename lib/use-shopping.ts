"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { demo } from "./demo";
import type { Dashboard, Item, Permissions, Scope } from "./types";

type Check = { listId: string; id: string; checked: boolean; changeId: string };
export type Member = { id: string; email: string; permissions: Permissions };
type ItemFields = Pick<Item, "name" | "quantity" | "note">;
type Command =
  | { action: "login" | "register"; email: string; password: string }
  | { action: "logout" }
  | { action: "createList"; name: string; folderId: string | null }
  | { action: "createFolder"; name: string }
  | { action: "rename"; id: string; scope: Scope; name: string }
  | ({ action: "add"; listId: string } & ItemFields)
  | ({ action: "edit"; id: string; listId: string } & ItemFields)
  | { action: "remove" | "check"; id: string; listId: string; checked?: boolean; changeId?: string }
  | { action: "invite"; id: string; scope: Scope; permissions: Permissions }
  | { action: "accept"; token: string }
  | { action: "members"; id: string; scope: Scope }
  | { action: "grant"; id: string; scope: Scope; userId: string; permissions: Permissions }
  | { action: "revoke"; id: string; scope: Scope; userId: string };

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const cacheKey = "spisak:dashboard";
const demoKey = "spisak:demo";
const queueKey = (userId: string) => "spisak:checks:" + userId;
function readLocal<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || "null") as T | null; }
  catch { return null; }
}
function writeLocal(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch { return false; }
}
const readQueue = (userId: string) => readLocal<Check[]>(queueKey(userId)) ?? [];

async function post<T>(command: Command): Promise<T> {
  const response = await fetch("/api/app", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(data?.error || "Server trenutno nije dostupan.", response.status);
  return data as T;
}

function demoCommand(state: Dashboard, command: Command): { data: Dashboard; id?: string } {
  const id = globalThis.crypto?.randomUUID?.() || "demo-" + Date.now() + "-" + Math.random();
  switch (command.action) {
    case "createList":
      return { id, data: { ...state, lists: [...state.lists, { id, name: command.name, folderId: command.folderId, owner: true, permissions: { add: true, edit: true, remove: true } }] } };
    case "createFolder":
      return { id, data: { ...state, folders: [...state.folders, { id, name: command.name, owner: true }] } };
    case "rename":
      return command.scope === "list"
        ? { data: { ...state, lists: state.lists.map(list => list.id === command.id ? { ...list, name: command.name } : list) } }
        : { data: { ...state, folders: state.folders.map(folder => folder.id === command.id ? { ...folder, name: command.name } : folder) } };
    case "add":
      return { data: { ...state, items: [...state.items, { id, listId: command.listId, name: command.name, quantity: command.quantity, note: command.note, checked: false }] } };
    case "edit":
      return { data: { ...state, items: state.items.map(item => item.id === command.id ? { ...item, name: command.name, quantity: command.quantity, note: command.note } : item) } };
    case "remove":
      return { data: { ...state, items: state.items.filter(item => item.id !== command.id) } };
    case "check":
      return { data: { ...state, items: state.items.map(item => item.id === command.id ? { ...item, checked: Boolean(command.checked) } : item) } };
    default:
      throw new Error("Za deljenje je potreban nalog.");
  }
}

export function useShopping() {
  const [data, setData] = useState<Dashboard>(demo);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<Check[]>([]);
  const [notice, setNotice] = useState("");
  const current = useRef(demo);
  const etag = useRef("");
  const revision = useRef(0);
  const flushing = useRef(false);

  const update = useCallback((value: Dashboard) => {
    current.current = value;
    setData(value);
    writeLocal(value.user.id === "demo" ? demoKey : cacheKey, value);
    setQueue(value.user.id === "demo" ? [] : readQueue(value.user.id));
  }, []);

  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const response = await fetch("/api/app", { cache: "no-store", headers: etag.current ? { "If-None-Match": etag.current } : {} });
      if (request !== revision.current) return;
      if (response.status === 401) {
        etag.current = "";
        localStorage.removeItem(cacheKey);
        if (current.current.user.id !== "demo") {
          update(readLocal<Dashboard>(demoKey) ?? demo);
          setNotice("Sesija je istekla. Prijavi se ponovo za sinhronizaciju.");
        }
      } else if (response.ok) {
        const value = await response.json() as Dashboard;
        if (request !== revision.current) return;
        etag.current = response.headers.get("etag") ?? "";
        update(value);
      }
    } catch {
      // The cached snapshot remains available when the network drops.
    }
  }, [update]);

  const flush = useCallback(async () => {
    const userId = current.current.user.id;
    if (userId === "demo" || flushing.current || !navigator.onLine) return;
    flushing.current = true;
    let changed = false;
    try {
      while (current.current.user.id === userId) {
        const [op] = readQueue(userId);
        if (!op) break;
        try {
          await post({ action: "check", ...op });
        } catch (error) {
          if (!(error instanceof RequestError) || ![403, 404].includes(error.status)) break;
          setNotice(error.message);
        }
        const next = readQueue(userId).filter(check => check.changeId !== op.changeId);
        if (!writeLocal(queueKey(userId), next)) break;
        changed = true;
      }
      if (changed) {
        await refresh();
        if (current.current.user.id === userId) setQueue(readQueue(userId));
      }
    } finally {
      flushing.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    update(readLocal<Dashboard>(cacheKey) ?? readLocal<Dashboard>(demoKey) ?? demo);
    setOnline(navigator.onLine);
    setReady(true);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    function sync() {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh().then(flush);
    }
    sync();
    const timer = window.setInterval(() => { if (!document.hidden && !flushing.current) sync(); }, 1600);
    function storage(event: StorageEvent) {
      if (event.key === queueKey(current.current.user.id)) {
        setQueue(readQueue(current.current.user.id));
        void flush();
      }
    }
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refresh, flush, update]);

  const run = useCallback(async (command: Command) => {
    if (command.action === "login" || command.action === "register") {
      const account = await post<Dashboard>(command);
      ++revision.current;
      etag.current = "";
      update(account);
      void flush();
      return {};
    }
    if (command.action === "logout") {
      await post(command);
      ++revision.current;
      etag.current = "";
      localStorage.removeItem(cacheKey);
      update(readLocal<Dashboard>(demoKey) ?? demo);
      return {};
    }
    if (current.current.user.id === "demo") {
      const result = demoCommand(current.current, command);
      update(result.data);
      return { id: result.id };
    }
    if (command.action === "check") {
      const userId = current.current.user.id;
      const next = [
        ...readQueue(userId).filter(op => op.id !== command.id),
        { id: command.id, listId: command.listId, checked: Boolean(command.checked), changeId: globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random() }
      ];
      if (!writeLocal(queueKey(userId), next)) throw new Error("Telefon nije mogao da sačuva promenu.");
      setQueue(next);
      void flush();
      return {};
    }
    if (!navigator.onLine) throw new Error("Poveži se na internet za ovu izmenu.");
    const result = await post<{ id?: string; token?: string; scope?: Scope; members?: Member[] }>(command);
    if (!["invite", "members"].includes(command.action)) await refresh();
    return result;
  }, [flush, refresh, update]);

  const pending = new Map(queue.map(op => [op.id, op.checked]));
  const items = data.items.map(item => pending.has(item.id) ? { ...item, checked: pending.get(item.id)! } : item);
  return { data, items, online, ready, pending: queue.length, run, notice, setNotice };
}

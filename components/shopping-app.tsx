"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight,
  CirclePlus, ClipboardList, FolderClosed, FolderOpen, FolderPlus, ListChecks,
  Moon, Sun, LogIn, LogOut, MoreHorizontal, Pencil, Plus, RotateCw, ShoppingBag,
  Trash2, UserRound, UsersRound, Wifi, WifiOff, X
} from "lucide-react";
import { AppDialog, type Panel } from "@/components/dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useShopping } from "@/lib/use-shopping";
import type { GroceryList, Item, Scope } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = { scope: Scope; id: string } | { scope: "overview" };

export function ShoppingApp() {
  const { data, items, online, ready, pending, run, notice, setNotice } = useShopping();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("spisak:theme"); } catch {}
      const enabled = saved ? saved === "dark" : media.matches;
      document.documentElement.dataset.theme = enabled ? "dark" : "light";
      setDark(enabled);
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);

  function toggleTheme() {
    const enabled = document.documentElement.dataset.theme !== "dark";
    const theme = enabled ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    setDark(enabled);
    try { localStorage.setItem("spisak:theme", theme); } catch {}
  }

  const [view, setView] = useState<View>({ scope: "list", id: "weekly" });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [invite, setInvite] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);
  const groceriesRef = useRef<HTMLDivElement>(null);
  const heightAnimation = useRef<Animation | null>(null);
  const moves = useRef(new Map<string, { positions: Map<string, number>; height: number; checked: boolean }>());
  const isDemo = data.user.id === "demo";
  const showSyncStatus = !isDemo && (!online || pending > 0);
  const [syncStatus, setSyncStatus] = useState({ online: true, pending: 0 });
  useEffect(() => {
    if (showSyncStatus) setSyncStatus({ online, pending });
  }, [showSyncStatus, online, pending]);
  const list = view.scope === "list" ? data.lists.find(row => row.id === view.id) : undefined;
  const folder = view.scope === "folder" ? data.folders.find(row => row.id === view.id) : undefined;
  const parent = data.folders.find(row => row.id === list?.folderId);
  const shopping = items.filter(item => item.listId === list?.id);
  const remaining = shopping.filter(item => !item.checked);
  const completed = shopping.filter(item => item.checked);
  const percent = shopping.length ? Math.round(completed.length / shopping.length * 100) : 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const listId = params.get("spisak");
    const folderId = params.get("folder");
    if (listId) setView({ scope: "list", id: listId });
    else if (folderId) setView({ scope: "folder", id: folderId });
    else if (params.has("svi")) setView({ scope: "overview" });
    const token = params.get("poziv");
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) setInvite(token);
  }, []);

  useEffect(() => {
    if (ready && view.scope === "list" && !list) setView({ scope: "overview" });
    if (ready && view.scope === "folder" && !folder) setView({ scope: "overview" });
  }, [list, folder, ready, view]);

  function open(scope: Scope, id: string) {
    setHideChecked(false);
    setView({ scope, id });
    const url = new URL(window.location.href);
    for (const key of ["spisak", "folder", "svi"]) url.searchParams.delete(key);
    url.searchParams.set(scope === "list" ? "spisak" : "folder", id);
    window.history.replaceState(null, "", url);
  }

  function overview() {
    setView({ scope: "overview" });
    const url = new URL(window.location.href);
    url.searchParams.delete("spisak");
    url.searchParams.delete("folder");
    url.searchParams.set("svi", "");
    window.history.replaceState(null, "", url);
  }

  function dismissInvite() {
    setInvite("");
    const url = new URL(window.location.href);
    url.searchParams.delete("poziv");
    window.history.replaceState(null, "", url);
  }

  async function accept() {
    if (isDemo) { setPanel({ type: "auth" }); return; }
    setInviteBusy(true);
    try {
      const result = await run({ action: "accept", token: invite });
      if (result.id && result.scope) open(result.scope, result.id);
      dismissInvite();
      setNotice("Poziv je prihvaćen.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Poziv trenutno nije dostupan.");
    } finally { setInviteBusy(false); }
  }

  function share(scope: Scope, id: string, name: string) {
    setPanel(isDemo ? { type: "auth" } : { type: "share", scope, id, name });
  }

  function toggle(item: Item, checked: boolean) {
    const row = document.getElementById("item-" + item.id);
    if (row && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const positions = new Map<string, number>();
      document.querySelectorAll<HTMLElement>(".grocery-row").forEach(element => {
        positions.set(element.id, element.getBoundingClientRect().top + window.scrollY);
      });
      moves.current.set(item.id, { positions, height: groceriesRef.current?.getBoundingClientRect().height ?? 0, checked });
    }
    void run({ action: "check", listId: item.listId, id: item.id, checked })
      .catch((error: Error) => { moves.current.delete(item.id); setNotice(error.message); });
  }

  useLayoutEffect(() => {
    for (const [id, move] of moves.current) {
      const item = shopping.find(entry => entry.id === id);
      if (item && item.checked !== move.checked) continue;
      moves.current.delete(id);
      if (!item) continue;
      heightAnimation.current?.cancel();
      const section = groceriesRef.current;
      const endHeight = section?.getBoundingClientRect().height ?? 0;
      const movingId = "item-" + id;
      const destination = document.getElementById(movingId);
      const start = move.positions.get(movingId);
      const distance = destination && start !== undefined
        ? Math.abs(start - destination.getBoundingClientRect().top - window.scrollY)
        : 0;
      const timing = {
        duration: Math.min(760, 440 + Math.max(distance, Math.abs(endHeight - move.height)) * 0.45),
        easing: "cubic-bezier(.42,0,.18,1)"
      };
      for (const [rowId, start] of move.positions) {
        const row = document.getElementById(rowId);
        if (!row) continue;
        for (const animation of row.getAnimations()) {
          if (animation.id === "grocery-move") animation.cancel();
        }
        const offset = start - (row.getBoundingClientRect().top + window.scrollY);
        if (Math.abs(offset) < 1) continue;
        const layer = rowId === movingId ? "2" : "1";
        row.animate([
          { transform: "translateY(" + offset + "px)", zIndex: layer },
          { transform: "translateY(0)", zIndex: layer }
        ], {
          id: "grocery-move",
          ...timing
        });
      }
      if (section && move.height > 0 && Math.abs(move.height - endHeight) >= 1) {
        heightAnimation.current = section.animate(
          [{ height: move.height + "px" }, { height: endHeight + "px" }],
          timing
        );
      }
      if (!destination) {
        document.getElementById("completed-heading")?.animate(
          [{ backgroundColor: "var(--accent)" }, { backgroundColor: "transparent" }],
          { duration: 520 }
        );
      }
    }
  }, [shopping]);

  const pendingAdd = useRef<{ listId: string; ids: Set<string>; height: number } | null>(null);

  const runDialogCommand: typeof run = async command => {
    if (command.action !== "add") return run(command);
    const box = groceriesRef.current;
    if (box && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pendingAdd.current = { listId: command.listId, ids: new Set(shopping.map(item => item.id)), height: box.getBoundingClientRect().height };
    }
    try {
      return await run(command);
    } catch (error) {
      pendingAdd.current = null;
      throw error;
    }
  };

  useLayoutEffect(() => {
    const pending = pendingAdd.current;
    if (!pending) return;
    if (pending.listId !== list?.id) { pendingAdd.current = null; return; }
    const added = shopping.find(item => !pending.ids.has(item.id));
    const box = groceriesRef.current;
    if (!added || !box) return;
    pendingAdd.current = null;
    const row = document.getElementById("item-" + added.id);
    if (!row || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timing = { duration: 540, easing: "cubic-bezier(.35,0,.2,1)", fill: "backwards" as const };
    if (!pending.ids.size) {
      box.animate([
        { height: pending.height + "px", backgroundColor: "var(--empty-panel)", overflow: "hidden" },
        { height: box.getBoundingClientRect().height + "px", backgroundColor: "transparent", overflow: "hidden" }
      ], timing);
    }
    const height = row.getBoundingClientRect().height;
    const margin = getComputedStyle(row).marginTop;
    row.animate([
      { height: "0px", minHeight: "0px", marginTop: "0px", opacity: 0, overflow: "hidden" },
      { height: height + "px", minHeight: "0px", marginTop: margin, opacity: 1, overflow: "hidden" }
    ], timing);
  }, [shopping, list?.id]);

  const emptyTransition = useRef<{ listId: string; height: number } | null>(null);
  useLayoutEffect(() => {
    const previous = emptyTransition.current;
    emptyTransition.current = null;
    const box = groceriesRef.current;
    if (shopping.length || !previous || previous.listId !== list?.id || !box) return;
    const outgoing = box.getAnimations().find(animation => animation.id === "last-row-exit");
    const content = box.firstElementChild;
    if (!content || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      outgoing?.cancel();
      return;
    }
    const target = content.getBoundingClientRect().height;
    box.animate([
      { height: previous.height + "px", backgroundColor: "var(--panel-transition)", overflow: "hidden" },
      { height: target + "px", backgroundColor: "var(--empty-panel)", overflow: "hidden" }
    ], { duration: 600, easing: "cubic-bezier(.35,0,.2,1)", fill: "backwards" });
    content.animate([
      { opacity: 0, transform: "translateY(5px)", offset: 0 },
      { opacity: 0, transform: "translateY(5px)", offset: .25 },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: 600, easing: "ease-in-out", fill: "backwards" });
    outgoing?.cancel();
  }, [shopping.length, list?.id]);

  const removing = useRef(new Set<string>());

  async function removeItem(item: Item) {
    if (removing.current.has(item.id)) return;
    removing.current.add(item.id);
    const row = document.getElementById("item-" + item.id);
    let exit: Animation | undefined;
    const fades: Animation[] = [];
    try {
      if (row && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const height = row.getBoundingClientRect().height + "px";
        const margin = getComputedStyle(row).marginTop;
        const box = groceriesRef.current;
        const last = shopping.length === 1 && box;
        if (last) {
          for (const group of box.children) {
            fades.push(group.animate([{ opacity: 1 }, { opacity: 0 }], {
              id: "last-group-exit", duration: 220, fill: "both"
            }));
          }
        }
        exit = last ? box.animate([
          { height: box.getBoundingClientRect().height + "px", backgroundColor: "transparent", overflow: "hidden" },
          { height: "72px", backgroundColor: "var(--panel-transition)", overflow: "hidden" }
        ], { id: "last-row-exit", duration: 360, easing: "ease-in-out", fill: "forwards" }) : row.animate([
          { height, minHeight: "0px", marginTop: margin, opacity: 1, overflow: "hidden" },
          { height, minHeight: "0px", marginTop: margin, opacity: 0.35, overflow: "hidden", offset: 0.32 },
          { height: "0px", minHeight: "0px", marginTop: "0px", opacity: 0, overflow: "hidden" }
        ], { duration: 420, easing: "cubic-bezier(.42,0,.18,1)", fill: "forwards" });
        await exit.finished;
      }
      if (groceriesRef.current) {
        emptyTransition.current = { listId: item.listId, height: groceriesRef.current.getBoundingClientRect().height };
      }
      await run({ action: "remove", listId: item.listId, id: item.id });
    } catch (error) {
      exit?.cancel();
      fades.forEach(animation => animation.cancel());
      emptyTransition.current = null;
      setNotice(error instanceof Error ? error.message : "Namirnica nije obrisana.");
    } finally {
      removing.current.delete(item.id);
    }
  }

  function itemRow(item: Item) {
    return (
      <li id={"item-" + item.id} key={item.id} className="grocery-row relative group flex min-h-[72px] items-center gap-2 border-b border-[#edf0e8] dark:border-border px-2 last:border-b-0 sm:px-3">
        <label className="flex min-h-[70px] min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
          <Checkbox checked={item.checked} onCheckedChange={(value: boolean | "indeterminate") => toggle(item, value === true)} aria-label={item.name} className={cn("size-[23px] rounded-[7px]", item.checked ? "data-[state=checked]:border-[#dfead9] data-[state=checked]:bg-[#dfead9] [&_svg]:text-[#3d6340]" : "border-[#c8d3c4] dark:border-border")} />
          <span className="min-w-0 break-words">
            <span className={cn("block text-[15px] font-bold", item.checked && "text-muted-foreground line-through")}>{item.name}</span>
            {list?.shared && item.checked && item.purchasedBy && <span className="block break-all text-xs text-muted-foreground">Kupio/la: {item.purchasedBy}</span>}
            {item.note && <span className="block text-xs leading-relaxed text-muted-foreground">{item.note}</span>}
          </span>
        </label>
        {item.quantity && <span className="max-w-[35%] break-words rounded-md bg-[#f0f3eb] dark:bg-accent px-2 py-1 text-center text-xs font-semibold text-[#49614b] dark:text-accent-foreground">{item.quantity}</span>}
        {list && (list.permissions.edit || list.permissions.remove) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label={`Opcije za ${item.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {list.permissions.edit && <DropdownMenuItem onSelect={() => setPanel({ type: "item", listId: list.id, item })}><Pencil /> Izmeni</DropdownMenuItem>}
              {list.permissions.remove && <DropdownMenuItem className="text-red-700 dark:text-red-300" onSelect={() => void removeItem(item)}><Trash2 /> Obriši namirnicu</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    );
  }

  function listLink(row: GroceryList) {
    const active = list?.id === row.id;
    return <button key={row.id} type="button" onClick={() => open("list", row.id)} data-active={active} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm hover:bg-[#ebf0e5] dark:hover:bg-accent", active ? "bg-[#e2ebdf] dark:bg-accent font-bold text-[#284d37] dark:text-accent-foreground" : "text-[#4e5a4f] dark:text-accent-foreground")}>
      <ClipboardList size={16} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{row.name}</span>{!row.owner && <UsersRound size={14} />}
    </button>;
  }

  function accountButton() {
    if (isDemo) return <Button variant="outline" size="sm" className="bg-white/60 dark:bg-background" onClick={() => setPanel({ type: "auth" })}><LogIn /> Prijavi se</Button>;
    return <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="size-10 rounded-full bg-[#eef3e8] dark:bg-accent text-primary" aria-label="Moj nalog"><UserRound /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <p className="max-w-56 truncate px-3 py-2 text-xs text-muted-foreground">{data.user.email}</p>
        <DropdownMenuItem onSelect={() => void run({ action: "logout" }).then(() => open("list", "weekly")).catch((error: Error) => setNotice(error.message))}><LogOut /> Odjavi se</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>;
  }

  const ownedTarget = list?.owner ? { scope: "list" as const, ...list } : folder?.owner ? { scope: "folder" as const, ...folder } : null;
  const visibleLists = folder ? data.lists.filter(row => row.folderId === folder.id) : data.lists;
  const canAdd = list?.permissions.add ?? false;


  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-[#e1e6da] dark:border-border bg-[#f1f4ec] px-5 pt-7 pb-5 lg:flex">
        <button className="flex items-center gap-3 rounded-xl text-left" onClick={overview}>
          <Image src="/icon-nas-spisak.svg" width={44} height={44} alt="" className="shrink-0" unoptimized />
          <span><span className="block text-[19px] leading-none font-black tracking-tight">NašSpisak</span><span className="text-xs text-muted-foreground">Zajednička kupovina</span></span>
        </button>
        <Button className="mt-9 w-full justify-start" onClick={() => setPanel({ type: "create", scope: "list", folderId: folder?.owner ? folder.id : undefined })}><Plus /> Novi spisak</Button>
        <nav aria-label="Spiskovi i folderi" className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <button onClick={overview} data-active={view.scope === "overview"} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-[#e6ede2] dark:hover:bg-accent", view.scope === "overview" && "bg-[#e2ebdf] dark:bg-accent")}><ListChecks size={17} /> Svi spiskovi</button>
          <div className="mt-6 mb-2 flex items-center justify-between pl-3">
            <span className="text-[11px] font-bold tracking-[.14em] text-[#59675b] dark:text-accent-foreground uppercase">Folderi</span>
            <Button variant="ghost" size="icon" className="size-9" aria-label="Novi folder" onClick={() => setPanel({ type: "create", scope: "folder" })}><FolderPlus /></Button>
          </div>
          {data.folders.map(entry => <div key={entry.id} className="mb-3">
            <button onClick={() => open("folder", entry.id)} data-active={folder?.id === entry.id} className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-bold hover:bg-[#ebf0e5] dark:hover:bg-accent", folder?.id === entry.id && "bg-[#e2ebdf] dark:bg-accent")}><FolderClosed size={17} className="shrink-0 text-[#5a7259] dark:text-accent-foreground" /> <span className="flex-1 truncate">{entry.name}</span><ChevronDown size={14} className="text-muted-foreground" /></button>
            <div className="ml-5 grid gap-0.5 border-l border-[#dce3d6] dark:border-border pl-2">{data.lists.filter(row => row.folderId === entry.id).map(listLink)}</div>
          </div>)}
          {data.lists.filter(row => !row.folderId).map(listLink)}
        </nav>
        {!isDemo && <div className="mt-5 rounded-2xl border border-[#e1e7db] dark:border-border bg-[#f9faf4] dark:bg-accent px-3 py-3 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-2">{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? "Povezano" : "Bez interneta"}</span>
        </div>}
      </aside>

      <main className="min-w-0">
        <header className="border-b border-[#e7eadf] dark:border-border bg-[#fafaf5]">
          <div className="mx-auto flex min-h-[67px] max-w-[1000px] items-center justify-between gap-3 px-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <button onClick={overview} aria-label="NašSpisak · Svi spiskovi" className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg font-bold text-[#415547] dark:text-accent-foreground hover:text-primary">
                <Image src="/icon-nas-spisak.svg" width={32} height={32} alt="" className="shrink-0" unoptimized />
                <span className="truncate">NašSpisak</span>
              </button>
              {parent && <><ChevronRight size={14} className="shrink-0 text-[#879386] dark:text-accent-foreground" /><button onClick={() => open("folder", parent.id)} className="hidden min-h-10 truncate text-muted-foreground hover:text-primary min-[400px]:block">{parent.name}</button></>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Tamna tema" aria-pressed={dark} title={dark ? "Uključi svetlu temu" : "Uključi tamnu temu"} onClick={toggleTheme}>
                <Moon className="dark:hidden" /><Sun className="hidden dark:block" />
              </Button>
              {accountButton()}
            </div>
          </div>
        </header>
        <div
          role="status"
          aria-atomic="true"
          aria-hidden={!showSyncStatus}
          data-visible={showSyncStatus}
          className="sync-status pointer-events-none fixed right-3 z-30 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border border-white/70 bg-[#faeddb] dark:bg-accent px-4 py-3 text-sm text-[#644321] dark:text-accent-foreground shadow-md sm:right-6"
        >
          {syncStatus.online ? <RotateCw size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
          {syncStatus.pending ? `Izmene na čekanju: ${syncStatus.pending}` : "Bez interneta. Izmene se čuvaju na uređaju."}
        </div>

        <div key={list?.id ?? folder?.id ?? view.scope} className="shopping-view mx-auto w-full max-w-[1000px] px-4 pt-5 pb-8 sm:px-8 sm:pt-8">
          {invite && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9e4d6] dark:border-border bg-accent px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold"><UsersRound size={17} /> Imaš poziv za deljeni spisak ili folder.</span>
            <div className="flex gap-2"><Button size="sm" disabled={inviteBusy} onClick={() => void accept()}>{isDemo ? "Prijavi se" : "Prihvati poziv"}</Button><Button aria-label="Zatvori poziv" variant="ghost" size="sm" onClick={dismissInvite}><X /></Button></div>
          </div>}
          {notice && <div role="status" className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm"><span>{notice}</span><Button variant="ghost" size="sm" aria-label="Skloni obaveštenje" onClick={() => setNotice("")}><X /></Button></div>}

          {list ? <>
            <section className="hero-texture relative isolate overflow-hidden rounded-[24px] px-5 py-6 text-white sm:rounded-[30px] sm:px-8 sm:py-8">
              <div aria-hidden="true" className="pointer-events-none absolute -top-14 -right-10 -z-10 h-[240px] w-[260px] rotate-[-15deg] opacity-[.19] [background-image:radial-gradient(#e3f4d9_1px,transparent_1px)] [background-size:12px_12px] sm:w-[430px]" />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white/13 px-2.5 py-1.5 text-xs font-semibold text-[#f1f6ec]"><ShoppingBag size={15} /> Spisak za kupovinu</div>
                  <h1 className="max-w-[640px] break-words text-[clamp(1.8rem,5.3vw,3.45rem)] leading-[1.02] font-black tracking-[-.055em]">{list.name}</h1>
                </div>
                {ownedTarget && <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button onClick={() => share(ownedTarget.scope, ownedTarget.id, ownedTarget.name)} className="share-list-button h-10 bg-[#f2f5e9] dark:bg-accent text-[#284633] dark:text-accent-foreground hover:bg-white"><UsersRound /> Podeli</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-10 border border-white/25 text-white hover:bg-white/20 hover:text-white" aria-label="Opcije spiska"><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setPanel({ type: "rename", ...ownedTarget })}><Pencil /> Promeni naziv</DropdownMenuItem></DropdownMenuContent>
                  </DropdownMenu>
                </div>}
              </div>
              <div className="mt-6 max-w-[460px] sm:mt-8">
                <div className="mb-2 flex justify-between gap-2 text-xs font-semibold text-[#ecf5e9]"><span>{completed.length} od {shopping.length} kupljeno</span><span>{percent}%</span></div>
                <div role="progressbar" aria-label="Napredak kupovine" aria-valuenow={percent}
                  aria-valuetext={completed.length + " od " + shopping.length + " kupljeno"}
                  className="h-[7px] w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full origin-left rounded-full bg-[#cce4b5] motion-safe:transition-transform motion-safe:duration-[600ms] motion-safe:ease-[cubic-bezier(.42,0,.18,1)]"
                    style={{ transform: "scaleX(" + (shopping.length ? completed.length / shopping.length : 0) + ")" }}
                  />
                </div>
              </div>
            </section>

            <div className="mt-6 flex items-center justify-between gap-3 sm:mt-8">
              <h2 className="text-2xl font-black tracking-[-.035em]">Namirnice</h2>
            </div>
            <div ref={groceriesRef} className={cn("mt-3 grid auto-rows-max content-start gap-4 rounded-[20px]", !shopping.length && "bg-[var(--empty-panel)]")}>
              {shopping.length > 0 ? <>
              <section className="grocery-section rounded-[20px] border border-[#e4e8dc] dark:border-border bg-background px-3 pb-1 sm:px-4">
                <h3 className="flex items-center gap-2 border-b border-[#edf0e8] dark:border-border px-2 py-3.5 text-sm font-bold sm:px-3"><span className="remaining-icon grid size-7 place-items-center rounded-lg bg-[#f6ebdb] dark:bg-accent text-[#8b5c27] dark:text-accent-foreground"><ShoppingBag size={15} /></span> Za kupiti <span className="rounded-md bg-[#f0f3eb] dark:bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">{remaining.length}</span></h3>
                {remaining.length ? <ul>{remaining.map(itemRow)}</ul> : <p className="px-3 py-5 text-sm text-muted-foreground">Sve sa spiska je kupljeno.</p>}
              </section>
              {completed.length > 0 && <section className="grocery-section rounded-[20px] border border-[#e4e8dc] dark:border-border bg-background px-3 pb-1 sm:px-4">
                <button id="completed-heading" type="button" onClick={() => setHideChecked(!hideChecked)} aria-expanded={!hideChecked} className="flex w-full items-center gap-2 border-b border-[#edf0e8] dark:border-border px-2 py-3.5 text-left text-sm font-bold sm:px-3"><span className="completed-icon grid size-7 place-items-center rounded-lg bg-[#e6efe1] dark:bg-accent text-[#436848] dark:text-accent-foreground"><CheckCheck size={16} /></span> Kupljeno <span className="rounded-md bg-[#f0f3eb] dark:bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">{completed.length}</span><ArrowDown size={15} className={cn("ml-auto text-muted-foreground", hideChecked && "-rotate-90")} /></button>
                {!hideChecked && <ul>{completed.map(itemRow)}</ul>}
              </section>}
            </> : <div className="grid justify-items-center rounded-[20px] border border-border px-4 py-10 text-center">
              <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-primary"><ShoppingBag size={23} /></span>
              <p className="font-bold">Spisak je prazan</p>
              {canAdd && <p className="mt-1 text-sm text-muted-foreground">Pritisni + da dodaš prvu namirnicu.</p>}
            </div>}
            </div>
            {canAdd && (
              <div id="add-grocery-anchor" className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 mt-4 flex justify-center">
                <Button
                  type="button"
                  aria-label="Dodaj namirnicu"
                  aria-haspopup="dialog"
                  title="Dodaj namirnicu"
                  className="pointer-events-auto size-16 rounded-full shadow-lg [&_svg]:size-8"
                  onClick={() => setPanel({ type: "item", listId: list.id })}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            )}
          </> : <>
            <div className="list-overview-heading flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-[#e8eee1] dark:bg-accent p-5 sm:p-8">
              <div className="min-w-0">
                <div className="mb-3 grid size-11 place-items-center rounded-xl bg-[#dae6d4] dark:bg-accent text-primary">{folder ? <FolderOpen size={23} /> : <ListChecks size={23} />}</div>
                <h1 className="break-words text-4xl font-black tracking-[-.05em] sm:text-5xl">{folder?.name ?? "Svi spiskovi"}</h1>
              </div>
              {ownedTarget && <div className="flex gap-2"><Button onClick={() => share(ownedTarget.scope, ownedTarget.id, ownedTarget.name)}><UsersRound /> Podeli folder</Button><Button variant="outline" size="icon" aria-label="Promeni naziv foldera" onClick={() => setPanel({ type: "rename", ...ownedTarget })}><Pencil /></Button></div>}
            </div>
            {!folder && <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xl font-black">Folderi</h2><Button size="sm" variant="outline" onClick={() => setPanel({ type: "create", scope: "folder" })}><FolderPlus /> Novi folder</Button></div>
              {data.folders.length ? <ul className="grid gap-3 sm:grid-cols-2">{data.folders.map(entry => <li key={entry.id}><button onClick={() => open("folder", entry.id)} className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 text-left hover:bg-accent"><FolderClosed size={20} className="shrink-0 text-[#557258] dark:text-accent-foreground" /><span className="min-w-0 flex-1 break-words font-bold">{entry.name}</span><ChevronRight size={17} className="shrink-0 text-muted-foreground" /></button></li>)}</ul> : <p className="rounded-xl bg-accent p-4 text-sm text-muted-foreground">Ovde možeš da grupišeš svoje spiskove.</p>}
            </section>}
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xl font-black">Spiskovi</h2>
                {(!folder || folder.owner) && <Button size="sm" onClick={() => setPanel({ type: "create", scope: "list", folderId: folder?.id })}><CirclePlus /> Novi spisak</Button>}
              </div>
              {visibleLists.length ? <ul className="grid gap-3 sm:grid-cols-2">{visibleLists.map(row => {
                const count = items.filter(item => item.listId === row.id && !item.checked).length;
                return <li key={row.id}><button onClick={() => open("list", row.id)} className="flex min-h-[84px] w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 text-left hover:bg-accent"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><ClipboardList size={19} /></span><span className="min-w-0 flex-1 break-words"><span className="block font-bold">{row.name}</span><span className="text-xs text-muted-foreground">{count ? `Za kupiti: ${count}` : "Nema stavki za kupovinu"}</span></span>{row.owner ? <ArrowUpRight size={17} className="shrink-0 text-muted-foreground" /> : <UsersRound size={17} className="shrink-0 text-muted-foreground" />}</button></li>;
              })}</ul> : <p className="rounded-xl bg-accent p-4 text-sm text-muted-foreground">Ovde će se pojaviti tvoji i podeljeni spiskovi.</p>}
            </section>
          </>}

          {!isDemo && online && !pending && <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><Check size={14} /> Sinhronizacija je aktivna</p>}
        </div>
      </main>
      {panel && <AppDialog panel={panel} close={() => setPanel(null)} run={panel.type === "item" ? runDialogCommand : run} onCreated={open} acceptToken={invite} />}
    </div>
  );
}

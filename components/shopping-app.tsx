"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight,
  CirclePlus, ClipboardList, FolderClosed, FolderOpen, FolderPlus, ListChecks,
  LogIn, LogOut, MoreHorizontal, Pencil, Plus, RotateCw, ShoppingBag,
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
  const [view, setView] = useState<View>({ scope: "list", id: "weekly" });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [invite, setInvite] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);
  const moves = useRef(new Map<string, { top: number; checked: boolean }>());
  const isDemo = data.user.id === "demo";
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
      moves.current.set(item.id, { top: row.getBoundingClientRect().top, checked });
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
      const row = document.getElementById("item-" + id);
      if (!row) {
        document.getElementById("completed-heading")?.animate(
          [{ backgroundColor: "#dcebdc" }, { backgroundColor: "transparent" }],
          { duration: 340 }
        );
        continue;
      }
      const offset = move.top - row.getBoundingClientRect().top;
      row.animate([
        { translate: "0 " + offset + "px", backgroundColor: "#e5f1e5" },
        { translate: "0 0", backgroundColor: "rgba(255,255,255,.84)" }
      ], { duration: 360, easing: "cubic-bezier(.2,.75,.25,1)" });
    }
  }, [shopping]);

  function itemRow(item: Item) {
    return (
      <li id={"item-" + item.id} key={item.id} className="group flex min-h-[72px] items-center gap-2 border-b border-[#edf0e8] px-2 last:border-b-0 sm:px-3">
        <label className="flex min-h-[70px] min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
          <Checkbox checked={item.checked} onCheckedChange={(value: boolean | "indeterminate") => toggle(item, value === true)} aria-label={item.name} className={cn("size-[23px] rounded-[7px]", item.checked ? "data-[state=checked]:border-[#dfead9] data-[state=checked]:bg-[#dfead9] [&_svg]:text-[#3d6340]" : "border-[#c8d3c4]")} />
          <span className="min-w-0 break-words">
            <span className={cn("block text-[15px] font-bold", item.checked && "text-muted-foreground line-through")}>{item.name}</span>
            {item.note && <span className="block text-xs leading-relaxed text-muted-foreground">{item.note}</span>}
          </span>
        </label>
        {item.quantity && <span className="max-w-[35%] break-words rounded-md bg-[#f0f3eb] px-2 py-1 text-center text-xs font-semibold text-[#49614b]">{item.quantity}</span>}
        {list && (list.permissions.edit || list.permissions.remove) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-10 text-muted-foreground" aria-label={`Opcije za ${item.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {list.permissions.edit && <DropdownMenuItem onSelect={() => setPanel({ type: "item", listId: list.id, item })}><Pencil /> Izmeni</DropdownMenuItem>}
              {list.permissions.remove && <DropdownMenuItem className="text-red-700" onSelect={() => void run({ action: "remove", listId: list.id, id: item.id }).catch((error: Error) => setNotice(error.message))}><Trash2 /> Obriši namirnicu</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    );
  }

  function listLink(row: GroceryList) {
    const active = list?.id === row.id;
    return <button key={row.id} type="button" onClick={() => open("list", row.id)} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm hover:bg-[#ebf0e5]", active ? "bg-[#e2ebdf] font-bold text-[#284d37]" : "text-[#4e5a4f]")}>
      <ClipboardList size={16} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{row.name}</span>{!row.owner && <UsersRound size={14} />}
    </button>;
  }

  function accountButton() {
    if (isDemo) return <Button variant="outline" size="sm" className="bg-white/60" onClick={() => setPanel({ type: "auth" })}><LogIn /> Prijavi se</Button>;
    return <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="size-10 rounded-full bg-[#eef3e8] text-primary" aria-label="Moj nalog"><UserRound /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <p className="max-w-56 truncate px-3 py-2 text-xs text-muted-foreground">{data.user.email}</p>
        <DropdownMenuItem onSelect={() => void run({ action: "logout" }).then(() => open("list", "weekly")).catch((error: Error) => setNotice(error.message))}><LogOut /> Odjavi se</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>;
  }

  const ownedTarget = list?.owner ? { scope: "list" as const, ...list } : folder?.owner ? { scope: "folder" as const, ...folder } : null;
  const visibleLists = folder ? data.lists.filter(row => row.folderId === folder.id) : data.lists;
  const canAdd = list?.permissions.add ?? false;
  const addDisabled = !online && !isDemo;

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-[#e1e6da] bg-[#f1f4ec] px-5 pt-7 pb-5 lg:flex">
        <button className="flex items-center gap-3 rounded-xl text-left" onClick={overview}>
          <span className="grid size-11 place-items-center rounded-[14px] bg-primary text-white"><ShoppingBag size={21} /></span>
          <span><span className="block text-[19px] leading-none font-black tracking-tight">SpisakApp</span><span className="text-xs text-muted-foreground">Zajednička kupovina</span></span>
        </button>
        <Button className="mt-9 w-full justify-start" onClick={() => setPanel({ type: "create", scope: "list", folderId: folder?.owner ? folder.id : undefined })}><Plus /> Novi spisak</Button>
        <nav aria-label="Spiskovi i folderi" className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <button onClick={overview} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-[#e6ede2]", view.scope === "overview" && "bg-[#e2ebdf]")}><ListChecks size={17} /> Svi spiskovi</button>
          <div className="mt-6 mb-2 flex items-center justify-between pl-3">
            <span className="text-[11px] font-bold tracking-[.14em] text-[#59675b] uppercase">Folderi</span>
            <Button variant="ghost" size="icon" className="size-9" aria-label="Novi folder" onClick={() => setPanel({ type: "create", scope: "folder" })}><FolderPlus /></Button>
          </div>
          {data.folders.map(entry => <div key={entry.id} className="mb-3">
            <button onClick={() => open("folder", entry.id)} className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-bold hover:bg-[#ebf0e5]", folder?.id === entry.id && "bg-[#e2ebdf]")}><FolderClosed size={17} className="shrink-0 text-[#5a7259]" /> <span className="flex-1 truncate">{entry.name}</span><ChevronDown size={14} className="text-muted-foreground" /></button>
            <div className="ml-5 grid gap-0.5 border-l border-[#dce3d6] pl-2">{data.lists.filter(row => row.folderId === entry.id).map(listLink)}</div>
          </div>)}
          {data.lists.filter(row => !row.folderId).map(listLink)}
        </nav>
        {!isDemo && <div className="mt-5 rounded-2xl border border-[#e1e7db] bg-[#f9faf4] px-3 py-3 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-2">{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? "Povezano" : "Bez interneta"}</span>
        </div>}
      </aside>

      <main className="min-w-0">
        <header className="border-b border-[#e7eadf] bg-[#fafaf5]">
          <div className="mx-auto flex min-h-[67px] max-w-[1000px] items-center justify-between gap-3 px-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <button onClick={overview} className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg font-bold text-[#415547] hover:text-primary">
                {view.scope === "overview" ? <ShoppingBag size={17} /> : <ArrowLeft size={17} />}<span className="truncate">{view.scope === "overview" ? "SpisakApp" : "Svi spiskovi"}</span>
              </button>
              {parent && <><ChevronRight size={14} className="shrink-0 text-[#879386]" /><button onClick={() => open("folder", parent.id)} className="hidden min-h-10 truncate text-muted-foreground hover:text-primary min-[400px]:block">{parent.name}</button></>}
            </div>
            <div className="flex shrink-0 items-center gap-2">{accountButton()}</div>
          </div>
        </header>

        <div key={list?.id ?? folder?.id ?? view.scope} className="shopping-view mx-auto w-full max-w-[1000px] px-4 pt-5 pb-8 sm:px-8 sm:pt-8">
          {invite && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9e4d6] bg-accent px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold"><UsersRound size={17} /> Imaš poziv za deljeni spisak ili folder.</span>
            <div className="flex gap-2"><Button size="sm" disabled={inviteBusy} onClick={() => void accept()}>{isDemo ? "Prijavi se" : "Prihvati poziv"}</Button><Button aria-label="Zatvori poziv" variant="ghost" size="sm" onClick={dismissInvite}><X /></Button></div>
          </div>}
          {!isDemo && (!online || pending > 0) && <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-[#faeddb] px-4 py-3 text-sm text-[#644321]">{online ? <RotateCw size={16} /> : <WifiOff size={16} />}{pending ? `Izmene na čekanju: ${pending}` : "Bez interneta. Kupljene stavke i dalje možeš da označiš."}</div>}
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
                  <Button onClick={() => share(ownedTarget.scope, ownedTarget.id, ownedTarget.name)} className="h-10 bg-[#f2f5e9] text-[#284633] hover:bg-white"><UsersRound /> Podeli</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-10 border border-white/25 text-white hover:bg-white/20 hover:text-white" aria-label="Opcije spiska"><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setPanel({ type: "rename", ...ownedTarget })}><Pencil /> Promeni naziv</DropdownMenuItem></DropdownMenuContent>
                  </DropdownMenu>
                </div>}
              </div>
              <div className="mt-6 max-w-[460px] sm:mt-8">
                <div className="mb-2 flex justify-between gap-2 text-xs font-semibold text-[#ecf5e9]"><span>{completed.length} od {shopping.length} kupljeno</span><span>{percent}%</span></div>
                <progress aria-label="Napredak kupovine" value={completed.length} max={shopping.length || 1} className="block h-[7px] w-full overflow-hidden rounded-full bg-white/20 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[#cce4b5] [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#cce4b5]" />
              </div>
            </section>

            <div className="mt-6 flex items-center justify-between gap-3 sm:mt-8">
              <h2 className="text-2xl font-black tracking-[-.035em]">Namirnice</h2>
            </div>
            {shopping.length > 0 ? <div className="mt-3 grid gap-4">
              <section className="rounded-[20px] border border-[#e4e8dc] bg-background px-3 pb-1 sm:px-4">
                <h3 className="flex items-center gap-2 border-b border-[#edf0e8] px-2 py-3.5 text-sm font-bold sm:px-3"><span className="grid size-7 place-items-center rounded-lg bg-[#f6ebdb] text-[#8b5c27]"><ShoppingBag size={15} /></span> Za kupiti <span className="rounded-md bg-[#f0f3eb] px-1.5 py-0.5 text-xs text-muted-foreground">{remaining.length}</span></h3>
                {remaining.length ? <ul>{remaining.map(itemRow)}</ul> : <p className="px-3 py-5 text-sm text-muted-foreground">Sve sa spiska je kupljeno.</p>}
              </section>
              {completed.length > 0 && <section className="rounded-[20px] border border-[#e4e8dc] bg-background px-3 pb-1 sm:px-4">
                <button id="completed-heading" type="button" onClick={() => setHideChecked(!hideChecked)} aria-expanded={!hideChecked} className="flex w-full items-center gap-2 border-b border-[#edf0e8] px-2 py-3.5 text-left text-sm font-bold sm:px-3"><span className="grid size-7 place-items-center rounded-lg bg-[#e6efe1] text-[#436848]"><CheckCheck size={16} /></span> Kupljeno <span className="rounded-md bg-[#f0f3eb] px-1.5 py-0.5 text-xs text-muted-foreground">{completed.length}</span><ArrowDown size={15} className={cn("ml-auto text-muted-foreground", hideChecked && "-rotate-90")} /></button>
                {!hideChecked && <ul>{completed.map(itemRow)}</ul>}
              </section>}
            </div> : <div className="mt-3 grid justify-items-center rounded-[20px] border border-dashed border-border bg-background px-4 py-10 text-center">
              <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent text-primary"><ShoppingBag size={23} /></span>
              <p className="font-bold">Spisak je prazan</p>
              {canAdd && <p className="mt-1 text-sm text-muted-foreground">Pritisni + da dodaš prvu namirnicu.</p>}
            </div>}
            {canAdd && (
              <div className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 mt-4 flex justify-end">
                <Button
                  type="button"
                  aria-label="Dodaj namirnicu"
                  aria-haspopup="dialog"
                  title="Dodaj namirnicu"
                  disabled={addDisabled}
                  className="pointer-events-auto size-16 rounded-full shadow-lg [&_svg]:size-8"
                  onClick={() => setPanel({ type: "item", listId: list.id })}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            )}
          </> : <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-[#e8eee1] p-5 sm:p-8">
              <div className="min-w-0">
                <div className="mb-3 grid size-11 place-items-center rounded-xl bg-[#dae6d4] text-primary">{folder ? <FolderOpen size={23} /> : <ListChecks size={23} />}</div>
                <h1 className="break-words text-4xl font-black tracking-[-.05em] sm:text-5xl">{folder?.name ?? "Svi spiskovi"}</h1>
              </div>
              {ownedTarget && <div className="flex gap-2"><Button onClick={() => share(ownedTarget.scope, ownedTarget.id, ownedTarget.name)}><UsersRound /> Podeli folder</Button><Button variant="outline" size="icon" aria-label="Promeni naziv foldera" onClick={() => setPanel({ type: "rename", ...ownedTarget })}><Pencil /></Button></div>}
            </div>
            {!folder && <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xl font-black">Folderi</h2><Button size="sm" variant="outline" onClick={() => setPanel({ type: "create", scope: "folder" })}><FolderPlus /> Novi folder</Button></div>
              {data.folders.length ? <ul className="grid gap-3 sm:grid-cols-2">{data.folders.map(entry => <li key={entry.id}><button onClick={() => open("folder", entry.id)} className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 text-left hover:bg-accent"><FolderClosed size={20} className="shrink-0 text-[#557258]" /><span className="min-w-0 flex-1 break-words font-bold">{entry.name}</span><ChevronRight size={17} className="shrink-0 text-muted-foreground" /></button></li>)}</ul> : <p className="rounded-xl bg-accent p-4 text-sm text-muted-foreground">Ovde možeš da grupišeš svoje spiskove.</p>}
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
      {panel && <AppDialog panel={panel} close={() => setPanel(null)} run={run} onCreated={open} acceptToken={invite} />}
    </div>
  );
}

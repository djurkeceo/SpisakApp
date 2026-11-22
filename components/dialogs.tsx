"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, FolderOpen, Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { noPermissions, type Item, type Permissions, type Scope } from "@/lib/types";
import type { Member, useShopping } from "@/lib/use-shopping";

type Run = ReturnType<typeof useShopping>["run"];
export type Panel =
  | { type: "auth" }
  | { type: "create"; scope: Scope; folderId?: string }
  | { type: "rename" | "share"; scope: Scope; id: string; name: string }
  | { type: "item"; listId: string; item?: Item };

function Field({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return <label htmlFor={name} className="grid gap-2 text-sm font-semibold">{label}{children}</label>;
}

function PermissionFields({ value, onChange, prefix }: { value: Permissions; onChange: (value: Permissions) => void; prefix: string }) {
  const entries = [["add", "Dodavanje"], ["edit", "Izmena"], ["remove", "Brisanje"]] as const;
  return (
    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
      {entries.map(([key, label]) => (
        <label htmlFor={prefix + key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-2 text-xs font-medium" key={key}>
          <Checkbox id={prefix + key} checked={value[key]} onCheckedChange={(checked: boolean | "indeterminate") => onChange({ ...value, [key]: checked === true })} className="size-5" />{label}
        </label>
      ))}
    </div>
  );
}

export function AppDialog({ panel, close, run, onCreated, acceptToken }: {
  panel: Panel; close: () => void; run: Run; onCreated: (scope: Scope, id: string) => void; acceptToken: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const content = contentRef.current;
    if (panel.type !== "auth" || !viewport || !content) return;
    function resize() {
      if (!viewport || !content) return;
      content.style.setProperty("--visible-height", viewport.height + "px");
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      content.style.setProperty("--keyboard-inset", inset + "px");
      const field = document.activeElement;
      if (field instanceof HTMLInputElement && content.contains(field)) {
        const bounds = field.getBoundingClientRect();
        const box = content.getBoundingClientRect();
        if (bounds.bottom > box.bottom - 12) content.scrollTop += bounds.bottom - box.bottom + 12;
        if (bounds.top < box.top + 12) content.scrollTop -= box.top - bounds.top + 12;
      }
    }
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [panel.type]);

  const [register, setRegister] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [permissions, setPermissions] = useState(noPermissions);
  const [members, setMembers] = useState<Member[]>([]);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (panel.type !== "share") return;
    let live = true;
    void run({ action: "members", id: panel.id, scope: panel.scope })
      .then(result => { if (live) setMembers(result.members ?? []); })
      .catch((err: Error) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [panel, run]);

  async function perform(action: () => Promise<void>) {
    setError("");
    setSaved("");
    setBusy(true);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : "Pokušaj ponovo."); }
    finally { setBusy(false); }
  }

  function form(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const field = (key: string) => String(values.get(key) ?? "").trim();
    void perform(async () => {
      if (panel.type === "auth") {
        await run({ action: register ? "register" : "login", email: field("email"), password: String(values.get("password") ?? "") });
      }
      if (panel.type === "create") {
        const result = panel.scope === "folder"
          ? await run({ action: "createFolder", name: field("name") })
          : await run({ action: "createList", name: field("name"), folderId: panel.folderId ?? null });
        if (result.id) onCreated(panel.scope, result.id);
      }
      if (panel.type === "rename") await run({ action: "rename", scope: panel.scope, id: panel.id, name: field("name") });
      if (panel.type === "item") {
        const input = { listId: panel.listId, name: field("name"), quantity: field("quantity"), note: field("note") };
        await run(panel.item ? { action: "edit", id: panel.item.id, ...input } : { action: "add", ...input });
      }
      close();
    });
  }

  const title = panel.type === "auth" ? (register ? "Napravi nalog" : "Prijavi se")
    : panel.type === "create" ? (panel.scope === "folder" ? "Novi folder" : "Novi spisak")
    : panel.type === "rename" ? "Promeni naziv"
    : panel.type === "share" ? "Podeli " + (panel.scope === "folder" ? "folder" : "spisak")
    : panel.type === "item" && panel.item ? "Izmeni namirnicu" : "Dodaj namirnicu";
  const description = panel.type === "auth" ? (acceptToken ? "Prijavi se da bi mogao da prihvatiš poziv." : "Koristi iste spiskove na svojim uređajima i podeli ih sa drugima.")
    : panel.type === "share" ? (panel.scope === "folder" ? `Poziv za „${panel.name}“ obuhvata postojeće i buduće spiskove u folderu.` : `Pošalji poziv za „${panel.name}“.`)
    : panel.type === "item" ? "Količinu i napomenu možeš da ostaviš prazne."
    : panel.type === "create" && panel.scope === "folder" ? "Grupiši spiskove koje koristiš zajedno." : "Unesi naziv koji ćeš lako prepoznati.";

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy) close(); }}>
      <DialogContent
        ref={contentRef}
        className={panel.type === "auth" ? "auth-dialog" : undefined}
        onOpenAutoFocus={event => {
          if (panel.type === "auth" && window.matchMedia("(pointer: coarse), (max-width: 639px)").matches) {
            event.preventDefault();
            titleRef.current?.focus({ preventScroll: true });
          }
        }}
      >
        <DialogTitle ref={titleRef} tabIndex={-1} className="pr-10 text-2xl font-bold tracking-tight">{title}</DialogTitle>
        <DialogDescription className="mt-1.5 pr-7 text-sm leading-relaxed text-muted-foreground">{description}</DialogDescription>
        {panel.type === "share" ? (
          <div className="mt-6 grid gap-4">
            <p className="text-sm">Svako sa pristupom može da čekira namirnice. Izaberi dodatne dozvole za novi poziv.</p>
            <PermissionFields value={permissions} onChange={value => { setPermissions(value); setLink(""); }} prefix="invite-" />
            <Button disabled={busy} onClick={() => void perform(async () => {
              const result = await run({ action: "invite", scope: panel.scope, id: panel.id, permissions });
              if (!result.token) return;
              const url = new URL("/", window.location.origin);
              url.searchParams.set("poziv", result.token);
              setLink(url.href);
              setCopied(false);
            })}><Link2 /> Napravi pozivni link</Button>
            {link && <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Input aria-label="Pozivni link" readOnly value={link} onFocus={event => event.target.select()} className="text-sm" />
                <Button aria-label="Kopiraj link" variant="outline" size="icon" onClick={() => void perform(async () => {
                  if (!navigator.clipboard) throw new Error("Označi link i kopiraj ga ručno.");
                  await navigator.clipboard.writeText(link).catch(() => { throw new Error("Označi link i kopiraj ga ručno."); });
                  setCopied(true);
                })}>{copied ? <Check /> : <Copy />}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{copied ? "Link je kopiran." : "Link važi sedam dana i može ga prihvatiti jedna osoba."}</p>
            </div>}
            {members.length > 0 && <div className="mt-1 grid gap-3 border-t border-border pt-4">
              <h3 className="text-sm font-bold">Osobe sa direktnim pristupom</h3>
              {members.map(member => <div key={member.id} className="grid gap-2 rounded-xl border border-border p-3">
                <p className="truncate text-sm font-semibold">{member.email}</p>
                <PermissionFields value={member.permissions} prefix={member.id} onChange={value => setMembers(previous => previous.map(row => row.id === member.id ? { ...row, permissions: value } : row))} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(async () => {
                    await run({ action: "grant", scope: panel.scope, id: panel.id, userId: member.id, permissions: member.permissions });
                    setSaved("Dozvole su sačuvane.");
                  })}>Sačuvaj</Button>
                  <Button variant="ghost" size="sm" disabled={busy} className="text-red-700" onClick={() => void perform(async () => {
                    await run({ action: "revoke", scope: panel.scope, id: panel.id, userId: member.id });
                    setMembers(previous => previous.filter(row => row.id !== member.id));
                    setSaved("Direktan pristup je uklonjen.");
                  })}>Ukloni pristup</Button>
                </div>
              </div>)}
            </div>}
          </div>
        ) : (
          <form className="mt-6 grid gap-4" onSubmit={form}>
            {panel.type === "auth" ? <>
              <Field name="email" label="Mejl"><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ime@primer.rs" /></Field>
              <Field name="password" label="Lozinka"><Input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={8} maxLength={128} /></Field>
            </> : <>
              <Field name="name" label={panel.type === "item" ? "Naziv namirnice" : "Naziv"}><Input id="name" name="name" required maxLength={100} defaultValue={panel.type === "rename" ? panel.name : panel.type === "item" ? panel.item?.name : ""} placeholder={panel.type === "item" ? "Npr. Mleko" : panel.type === "create" && panel.scope === "folder" ? "Npr. Domaćinstvo" : "Npr. Nedeljna nabavka"} /></Field>
              {panel.type === "item" && <>
                <Field name="quantity" label="Količina"><Input id="quantity" name="quantity" maxLength={200} defaultValue={panel.item?.quantity} placeholder="Npr. 2 l" /></Field>
                <Field name="note" label="Napomena"><Input id="note" name="note" maxLength={200} defaultValue={panel.item?.note} placeholder="Npr. Bez laktoze" /></Field>
              </>}
            </>}
            <Button disabled={busy} type="submit" className="mt-1 w-full">
              {panel.type === "auth" && <UserPlus />}{panel.type === "create" && panel.scope === "folder" && <FolderOpen />}
              {busy ? "Sačekaj…" : panel.type === "auth" ? title : panel.type === "create" ? "Kreiraj" : panel.type === "item" && !panel.item ? "Dodaj" : "Sačuvaj"}
            </Button>
            {panel.type === "auth" && <Button type="button" variant="ghost" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Već imaš nalog? Prijavi se" : "Prvi put si ovde? Napravi nalog"}</Button>}
          </form>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {saved && <p role="status" className="mt-4 rounded-lg bg-accent p-3 text-sm">{saved}</p>}
      </DialogContent>
    </Dialog>
  );
}

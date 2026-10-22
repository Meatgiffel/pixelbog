/* Handlinger der åbner RPG-dialoger eller viser toasts. */
import { useState } from "react";
import { compareContacts, displayName, TYPE_LABEL } from "../lib/format";
import { Icon } from "../lib/pixel";
import {
  ConflictError, type StoredContact, acceptServer, app, contactsIn, createAddressBook, errorText, exportVcf, removeContact,
} from "../state/app";
import { go, router } from "../state/router";
import { play } from "../state/settings";
import { closeDialog, openDialog, toast } from "../state/ui";
import type { ContactData } from "../vcard/contact";
import { RpgBox } from "./Dialog";

export function bookName(id: string): string {
  if (id === "alle") return "Alle kontakter";
  return app.get().books.find((b) => b.id === id)?.name ?? "Ukendt bog";
}

/* ---------- Slet ---------- */

export function openDelete(c: StoredContact) {
  const name = displayName(c.data);
  openDialog(
    <RpgBox
      speaker="Slet kontakt"
      text={`Vil du virkelig slette ${name}? Kontakten forsvinder også fra serveren og dine andre enheder.`}
      focus='[data-choice="1"]'
      choices={[
        { label: "JA", hint: "Slet kontakten", danger: true, run: () => { closeDialog(); void doDelete(c); } },
        { label: "NEJ", hint: "Behold den", run: closeDialog },
      ]}
    />,
  );
}

async function doDelete(c: StoredContact) {
  const { bookId } = router.get().route;
  let undo: () => Promise<void>;
  try {
    undo = await removeContact(c);
  } catch (e) {
    play("error");
    if (e instanceof ConflictError) {
      toast("STOP!", e.server ? `${displayName(c.data)} blev ændret på en anden enhed. Tjek ændringerne, før du sletter.` : `${displayName(c.data)} var allerede slettet.`, "alert");
      if (!e.server) go({ bookId, contactId: null, mode: null });
    } else {
      toast("FEJL", errorText(e), "alert", { ms: 6000 });
    }
    return;
  }
  play("delete");
  go({ bookId, contactId: null, mode: null });
  toast("GAME OVER", `Kontakt slettet: ${displayName(c.data)}.`, "trash", {
    action: "Fortryd",
    ms: 6000,
    onAction: async () => {
      try {
        await undo();
        toast("CONTINUE?", `${displayName(c.data)} er tilbage.`, "heart");
        go({ bookId, contactId: c.id, mode: "view" });
      } catch (e) {
        toast("FEJL", errorText(e), "alert", { ms: 6000 });
      }
    },
  });
}

/* ---------- Konflikt ---------- */

function changesBetween(mine: ContactData, server: ContactData): { tag: string; value: string }[] {
  const out: { tag: string; value: string }[] = [];
  const name = (c: ContactData) => [c.prefix, c.given, c.middle, c.family, c.suffix].join(" ").trim();
  if (name(mine) !== name(server)) out.push({ tag: "Navn", value: name(server) || "(intet)" });
  const single: [keyof ContactData, string][] = [["nickname", "Kaldenavn"], ["title", "Stilling"], ["org", "Firma"], ["note", "Note"]];
  for (const [k, tag] of single) if (mine[k] !== server[k]) out.push({ tag, value: (server[k] as string) || "(fjernet)" });
  if (mine.birthday !== server.birthday) out.push({ tag: "Fødselsdag", value: server.birthday || "(fjernet)" });
  if (mine.photo !== server.photo) out.push({ tag: "Foto", value: server.photo ? "Nyt foto" : "(fjernet)" });
  server.phones.forEach((p) => {
    if (!mine.phones.some((m) => m.value === p.value && m.type === p.type)) out.push({ tag: TYPE_LABEL[p.type], value: p.value });
  });
  server.emails.forEach((p) => {
    if (!mine.emails.some((m) => m.value === p.value)) out.push({ tag: "E-mail", value: p.value });
  });
  const lostPhones = mine.phones.filter((m) => !server.phones.some((p) => p.value === m.value)).length;
  if (lostPhones) out.push({ tag: "Telefon", value: `${lostPhones} fjernet` });
  if (JSON.stringify(mine.addresses.map(({ ref: _r, ...a }) => a)) !== JSON.stringify(server.addresses.map(({ ref: _r, ...a }) => a))) {
    out.push({ tag: "Adresse", value: "Ændret" });
  }
  return out.slice(0, 8);
}

export interface ConflictChoice {
  /** Hent serverens version og kassér egne ændringer */
  reload: () => void;
  /** Gem egen version oven i serverens */
  overwrite: () => void;
}

export function openConflict(prev: StoredContact, server: StoredContact | null, on: ConflictChoice) {
  const name = displayName(prev.data);
  const changes = server ? changesBetween(prev.data, server.data) : [];
  openDialog(
    <RpgBox
      speaker="Serveren"
      text={server
        ? `Kontakten er ændret på en anden enhed. ${name} blev opdateret, mens du redigerede.`
        : `${name} er slettet på en anden enhed, mens du redigerede.`}
      choices={server ? [
        { label: "Genindlæs", hint: "Hent serverens version. Dine ændringer kasseres.", run: () => { closeDialog(); on.reload(); } },
        { label: "Overskriv", hint: "Gem din version oven i serverens.", danger: true, run: () => { closeDialog(); on.overwrite(); } },
      ] : [
        { label: "Gem igen", hint: "Opret kontakten igen med dine ændringer.", run: () => { closeDialog(); on.overwrite(); } },
        { label: "Kassér", hint: "Lad den være slettet.", danger: true, run: () => { closeDialog(); on.reload(); } },
      ]}
      actions={<button type="button" className="btn btn-ghost btn-s" onClick={closeDialog}>Tilbage til redigering</button>}
    >
      {changes.length ? (
        <>
          <p className="label">Ændret på serveren</p>
          <ul className="od-stack" style={{ ["--od-gap" as string]: "8px" }}>
            {changes.map((c, i) => <li key={i}><span className="tag">{c.tag}</span> <span className="od-nowrap">{c.value}</span></li>)}
          </ul>
        </>
      ) : null}
    </RpgBox>,
  );
}

export function reloadFromServer(prev: StoredContact, server: StoredContact | null) {
  acceptServer(prev, server);
  const { bookId } = router.get().route;
  if (server) {
    toast("GENINDLÆST", `${displayName(server.data)} viser nu serverens version.`, "import");
    go({ bookId, contactId: server.id, mode: "view" }, { force: true });
  } else {
    go({ bookId, contactId: null, mode: null }, { force: true });
  }
}

/* ---------- Eksport ---------- */

export function doExport(bookId: string) {
  const list = contactsIn(bookId).sort((a, b) => compareContacts(a.data, b.data));
  const name = bookName(bookId);
  if (!list.length) { toast("TOMT", `Der er ingen kontakter at eksportere i ${name}.`, "alert"); return; }
  const file = `pixelbog-${bookId.replace(/[^\w-]+/g, "_")}.vcf`;
  const blob = new Blob([exportVcf(list)], { type: "text/vcard;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  play("done");
  toast("EKSPORTERET!", `${list.length} kontakter gemt som ${file}.`, "export");
}

/* ---------- Ny adressebog ---------- */

function CreateBook() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    if (!name.trim()) { setErr("Giv bogen et navn."); play("error"); return; }
    setBusy(true);
    try {
      const b = await createAddressBook(name.trim());
      closeDialog();
      play("save");
      toast("NY BOG!", `${b.name} er oprettet.`, "book");
      go({ bookId: b.id, contactId: null, mode: null });
    } catch (e) {
      setBusy(false);
      setErr(errorText(e));
      play("error");
    }
  }
  return (
    <RpgBox
      speaker="Ny adressebog"
      text="Hvad skal den nye adressebog hedde?"
      focus="#nb-name"
      actions={<>
        <button type="button" className="btn" onClick={closeDialog}><Icon name="close" /><span className="btn-label">Annuller</span></button>
        <button type="button" className={"btn btn-primary" + (busy ? " is-loading" : "")} onClick={submit}><Icon name="plus" /><span className="btn-label">Opret</span></button>
      </>}
    >
      <form className="field" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="label" htmlFor="nb-name">Navn</label>
        <input className="input" id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx Personlige"
          {...(err ? { "aria-invalid": true, "aria-describedby": "nb-err" } : {})} />
        {err ? <p className="error-text" id="nb-err"><Icon name="alert" /><span>{err}</span></p> : null}
      </form>
    </RpgBox>
  );
}

export function openCreateBook() {
  openDialog(<CreateBook />);
}

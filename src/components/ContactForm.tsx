/* Redigering / ny kontakt */
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { displayName, TYPE_OPTIONS, typeLabel } from "../lib/format";
import { Icon, type IconName, resizeForVCard } from "../lib/pixel";
import { ConflictError, type StoredContact, app, errorText, saveContact } from "../state/app";
import { editor, editorActions } from "../state/editor";
import { type Route, go, setGuard } from "../state/router";
import { play } from "../state/settings";
import { useStore } from "../state/store";
import { toast } from "../state/ui";
import { type AddressItem, type ContactData, type ListKey, type ValueItem, blankContact, hasIdentity } from "../vcard/contact";
import { Avatar } from "./Avatar";
import { confirmDiscard } from "./Dialog";
import { bookName, openConflict, reloadFromServer } from "./actions";

type Errors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOUN: Record<ListKey, string> = { phones: "telefon", emails: "e-mail", addresses: "adresse", urls: "webside" };
const idOf = (path: string) => "f-" + path.replace(/\./g, "-");
const errId = (path: string) => "err-" + path.replace(/\./g, "-");

function getPath(o: unknown, path: string): string {
  return (path.split(".").reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o) as string) ?? "";
}

/** Uforanderlig opdatering langs en sti, fx "phones.0.value". */
function setPath<T>(o: T, keys: string[], v: unknown): T {
  const [k, ...rest] = keys;
  const cur = (o as Record<string, unknown>)[k];
  const next = rest.length ? setPath(cur, rest, v) : v;
  if (Array.isArray(o)) { const a = o.slice(); a[+k] = next; return a as T; }
  return { ...o, [k]: next };
}

function validateField(d: ContactData, path: string, errors: Errors): Errors {
  const v = getPath(d, path).trim();
  const out = { ...errors };
  if (/^emails\.\d+\.value$/.test(path)) {
    if (v && !EMAIL_RE.test(v)) out[path] = "Det ligner ikke en e-mailadresse. Den skal indeholde @ og et domæne, fx navn@mail.dk.";
    else delete out[path];
  }
  if (/^phones\.\d+\.value$/.test(path)) {
    if (v && !/^\+?[\d\s()-]{4,}$/.test(v)) out[path] = "Et telefonnummer må kun indeholde tal, mellemrum og evt. + foran.";
    else delete out[path];
  }
  return out;
}

function validateAll(d: ContactData): Errors {
  let e: Errors = {};
  d.emails.forEach((_, i) => { e = validateField(d, `emails.${i}.value`, e); });
  d.phones.forEach((_, i) => { e = validateField(d, `phones.${i}.value`, e); });
  if (!hasIdentity(d)) e = { given: "Giv kontakten mindst et navn, et firma, et telefonnummer eller en e-mail.", ...e };
  return e;
}

function normalized(d: ContactData, prev: ContactData | null): ContactData {
  const t = (s: string) => s.trim();
  const origUrl = (ref?: number) => prev?.urls.find((u) => u.ref === ref)?.value;
  return {
    ...d,
    prefix: t(d.prefix), given: t(d.given), middle: t(d.middle), family: t(d.family), suffix: t(d.suffix),
    nickname: t(d.nickname), title: t(d.title), org: t(d.org), note: t(d.note),
    phones: d.phones.filter((p) => p.value.trim()).map((p) => ({ ...p, value: t(p.value) })),
    emails: d.emails.filter((p) => p.value.trim()).map((p) => ({ ...p, value: t(p.value) })),
    urls: d.urls.filter((u) => u.value.trim()).map((u) => {
      const v = t(u.value);
      // uændrede adresser fra andre klienter skal ikke have https:// sat foran
      return { ...u, value: /^[a-z][\w+.-]*:/i.test(v) || v === origUrl(u.ref) ? v : "https://" + v };
    }),
    addresses: d.addresses.filter((a) => [a.street, a.postal, a.city].some((v) => v.trim())),
  };
}

interface Props {
  route: Route;
  contact: StoredContact | null;
}

export function ContactForm({ route, contact: current }: Props) {
  // Hold fast i versionen redigeringen startede fra, også hvis listen opdateres imens —
  // ellers ville en baggrundsopdatering skjule en konflikt
  const [contact] = useState(current);
  const books = useStore(app, (s) => s.books);
  const isNew = route.mode === "new";
  const [draft, setDraft] = useState<ContactData>(() =>
    contact ? structuredClone(contact.data) : { ...blankContact(), phones: [{ type: "mobil", value: "" }], emails: [{ type: "hjem", value: "" }] });
  const [book, setBook] = useState(() => contact?.bookId ?? (books.some((b) => b.id === route.bookId) ? route.bookId : books[0]?.id ?? ""));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [moreNames, setMoreNames] = useState(() => !!(contact && (contact.data.prefix || contact.data.middle || contact.data.suffix)));
  const saving = useStore(editor, (s) => s.saving);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const focusNext = useRef<string | null>(null);
  const focusSummary = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  /* ---------- livscyklus ---------- */
  useEffect(() => {
    document.getElementById(isNew ? "f-book" : "f-given")?.focus({ preventScroll: true });
    setGuard((proceed) => {
      if (!dirtyRef.current) return false;
      confirmDiscard(proceed);
      return true;
    });
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
      editor.set({ dirty: false, saving: false });
    };
  }, [isNew]);

  useEffect(() => { editor.set({ dirty }); }, [dirty]);

  useLayoutEffect(() => {
    if (focusNext.current) {
      document.getElementById(focusNext.current)?.focus();
      focusNext.current = null;
    }
    if (focusSummary.current) {
      focusSummary.current = false;
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      document.getElementById("error-summary")?.focus();
    }
  });

  /* ---------- redigering ---------- */
  const change = (path: string, v: unknown) => {
    setDraft((d) => setPath(d, path.split("."), v));
    setDirty(true);
  };
  const blur = (path: string) => setErrors((e) => validateField(draft, path, e));

  const addRow = (list: ListKey) => {
    const blank = list === "addresses"
      ? { type: "hjem", street: "", postal: "", city: "", region: "", country: "Danmark" }
      : { type: TYPE_OPTIONS[list][0], value: "" };
    const i = draft[list].length;
    setDraft((d) => ({ ...d, [list]: [...d[list], blank] }));
    setDirty(true);
    focusNext.current = list === "addresses" ? `f-addresses-${i}-street` : `f-${list}-${i}`;
  };
  const removeRow = (list: ListKey, i: number) => {
    const left = draft[list].length - 1;
    setDraft((d) => ({ ...d, [list]: d[list].filter((_, j) => j !== i) }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(list + "."))));
    setDirty(true);
    focusNext.current = left > 0 ? `rm-${list}-${Math.min(i, left - 1)}` : `add-${list}`;
  };

  const photoInput = useRef<HTMLInputElement>(null);
  async function pickPhoto(file: File) {
    try {
      const src = await resizeForVCard(file);
      change("photo", src);
    } catch {
      play("error");
      toast("FEJL", "Billedet kunne ikke læses. Prøv en JPG eller PNG.", "alert");
    }
  }

  /* ---------- gem / annuller ---------- */
  function done(c: StoredContact) {
    dirtyRef.current = false;
    setDirty(false);
    play("save");
    toast("GEMT!", isNew ? `${displayName(c.data)} er tilføjet til ${bookName(c.bookId)}.` : `${displayName(c.data)} er opdateret.`, "check");
    const bookId = route.bookId !== "alle" && route.bookId !== c.bookId ? c.bookId : route.bookId;
    go({ bookId, contactId: c.id, mode: "view" }, { force: true });
    setTimeout(() => document.getElementById("detail-title")?.focus({ preventScroll: true }), 0);
  }

  async function attempt(data: ContactData, overwrite?: { server: StoredContact | null }) {
    editor.set({ saving: true });
    try {
      done(await saveContact(contact, book, data, overwrite));
    } catch (e) {
      play("error");
      if (e instanceof ConflictError && contact) {
        const server = e.server;
        openConflict(contact, server, {
          reload: () => { dirtyRef.current = false; reloadFromServer(contact, server); },
          overwrite: () => void attempt(data, { server }),
        });
      } else if (app.get().phase === "ready") {
        toast("FEJL", errorText(e), "alert", { ms: 6000 });
      }
    } finally {
      editor.set({ saving: false });
    }
  }

  function save() {
    if (editor.get().saving) return;
    const errs = validateAll(draft);
    setErrors(errs);
    if (Object.keys(errs).length) { play("error"); focusSummary.current = true; return; }
    void attempt(normalized(draft, contact?.data ?? null));
  }

  function cancel() {
    const leave = () => {
      dirtyRef.current = false;
      go(isNew ? { bookId: route.bookId, contactId: null, mode: null } : { bookId: route.bookId, contactId: route.contactId, mode: "view" }, { force: true });
    };
    if (dirtyRef.current) confirmDiscard(leave); else leave();
  }

  editorActions.save = save;
  editorActions.cancel = cancel;

  /* ---------- felter ---------- */
  const inv = (path: string) => (errors[path] ? { "aria-invalid": true as const, "aria-describedby": errId(path) } : {});
  const fieldErr = (path: string) => errors[path]
    ? <p className="error-text" id={errId(path)}><Icon name="alert" /><span>{errors[path]}</span></p>
    : null;

  const text = (path: string, label: string, opts: { type?: string; ac?: string; help?: string; req?: boolean; inputMode?: "numeric"; max?: string } = {}) => {
    const id = idOf(path);
    const describe = opts.help && !errors[path] ? { "aria-describedby": `${id}-help` } : {};
    return (
      <div className="field">
        <label className="label" htmlFor={id}>{label}{opts.req ? <> <span className="req" aria-hidden="true">*</span></> : null}</label>
        {opts.help ? <p className="help" id={`${id}-help`}>{opts.help}</p> : null}
        <input className="input" id={id} type={opts.type || "text"} value={getPath(draft, path)} autoComplete={opts.ac}
          inputMode={opts.inputMode} max={opts.max}
          onChange={(e) => change(path, e.target.value)} onBlur={() => blur(path)} {...describe} {...inv(path)} />
        {fieldErr(path)}
      </div>
    );
  };

  const typeSelect = (list: ListKey, i: number, label: string) => (
    <span className="select-wrap">
      <select className="select" aria-label={label} value={draft[list][i].type} onChange={(e) => change(`${list}.${i}.type`, e.target.value)}>
        {TYPE_OPTIONS[list].map((t) => <option key={t} value={t}>{typeLabel(list, t)}</option>)}
      </select>
    </span>
  );

  const removeBtn = (list: ListKey, i: number, label: string) => (
    <button type="button" className="btn btn-icon btn-s" id={`rm-${list}-${i}`} aria-label={label} onClick={() => removeRow(list, i)}>
      <Icon name="close" />
    </button>
  );

  const repSection = (list: ListKey, icon: IconName, title: string, valueLabel: string, inputType: string, ac?: string) => {
    let rows: ReactNode;
    if (list === "addresses") {
      rows = (draft.addresses as AddressItem[]).map((_, i) => (
        <div className="rep-addr" key={i}>
          <div className="rep-addr-head">
            {typeSelect(list, i, `Type, adresse ${i + 1}`)}
            <span className="t-ui t-soft">Adresse {i + 1}</span>
            {removeBtn(list, i, `Fjern adresse ${i + 1}`)}
          </div>
          {text(`addresses.${i}.street`, "Gade og nr.", { ac: "street-address" })}
          <div className="grid-3">
            {text(`addresses.${i}.postal`, "Postnr.", { ac: "postal-code", inputMode: "numeric" })}
            {text(`addresses.${i}.city`, "By", { ac: "address-level2" })}
          </div>
          <div className="grid-2">
            {text(`addresses.${i}.region`, "Region")}
            {text(`addresses.${i}.country`, "Land", { ac: "country-name" })}
          </div>
        </div>
      ));
    } else {
      rows = (draft[list] as ValueItem[]).map((it, i) => {
        const path = `${list}.${i}.value`;
        return (
          <div className="rep-row" key={i}>
            {typeSelect(list, i, `Type, ${NOUN[list]} ${i + 1}`)}
            <div className="rep-value field">
              <input className="input" id={`f-${list}-${i}`} type={inputType} value={it.value} aria-label={`${valueLabel} ${i + 1}`}
                autoComplete={ac} inputMode={inputType === "tel" ? "tel" : undefined}
                onChange={(e) => change(path, e.target.value)} onBlur={() => blur(path)} {...inv(path)} />
              {fieldErr(path)}
            </div>
            {removeBtn(list, i, `Fjern ${NOUN[list]} ${i + 1}`)}
          </div>
        );
      });
    }
    return (
      <fieldset className="fieldset">
        <legend className="block-title"><Icon name={icon} />{title}</legend>
        {list !== "addresses" && draft[list].length ? (
          <div className="rep-row rep-head hide-narrow" aria-hidden="true"><span className="label">Type</span><span className="label">{valueLabel}</span><span /></div>
        ) : null}
        {rows}
        <div>
          <button type="button" className="btn btn-s" id={`add-${list}`} onClick={() => addRow(list)}>
            <Icon name="plus" /><span className="btn-label">Tilføj {NOUN[list]}</span>
          </button>
        </div>
      </fieldset>
    );
  };

  const errs = Object.entries(errors);
  const previewAvatar = draft.given || draft.family || draft.org || draft.phones.some((p) => p.value) ? draft : { ...draft, given: "Ny" };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="panel-head detail-head">
        <h2 className="panel-title" id="detail-title" tabIndex={-1}>{isNew ? "Ny kontakt" : "Rediger"}</h2>
        {dirty ? <><span className="unsaved-star blink" aria-hidden="true">★</span><span className="badge" role="status">Ikke gemt</span></> : null}
      </header>
      <div className="panel-body detail-body is-form" id="detail-body" ref={bodyRef}>
        <form className="form" id="contact-form" noValidate aria-labelledby="detail-title" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {errs.length ? (
            <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
              <p className="label">{errs.length === 1 ? "1 ting mangler" : `${errs.length} ting mangler`}</p>
              <ul>
                {errs.map(([p, m]) => (
                  <li key={p}><a href={`#${idOf(p)}`} onClick={(e) => { e.preventDefault(); document.getElementById(idOf(p))?.focus(); }}>{m}</a></li>
                ))}
              </ul>
            </div>
          ) : null}
          {isNew ? (
            <div className="field">
              <label className="label" htmlFor="f-book">Adressebog <span className="req" aria-hidden="true">*</span></label>
              <span className="select-wrap">
                <select className="select" id="f-book" value={book} onChange={(e) => { setBook(e.target.value); setDirty(true); }}>
                  {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </span>
            </div>
          ) : (
            <p className="t-data-s t-soft">Adressebog: <strong>{bookName(book)}</strong></p>
          )}
          <fieldset className="fieldset">
            <legend className="block-title"><Icon name="camera" />Foto</legend>
            <div className="photo-edit">
              <Avatar c={previewAvatar} size="m" />
              <div className="od-stack">
                <p className="help">Fotos vises pixeleret i appens palet. JPG eller PNG.</p>
                <div className="btn-row">
                  <button type="button" className="btn btn-s" id="photo-pick" onClick={() => photoInput.current?.click()}>
                    <Icon name="camera" /><span className="btn-label">{draft.photo ? "Skift foto" : "Upload foto"}</span>
                  </button>
                  {draft.photo ? (
                    <button type="button" className="btn btn-s" onClick={() => { change("photo", null); focusNext.current = "photo-pick"; }}>
                      <Icon name="trash" /><span className="btn-label">Fjern foto</span>
                    </button>
                  ) : null}
                </div>
                <input type="file" accept="image/*" ref={photoInput} className="sr-only" tabIndex={-1} aria-hidden="true"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickPhoto(f); }} />
              </div>
            </div>
          </fieldset>
          <fieldset className="fieldset">
            <legend className="block-title"><Icon name="user" />Navn</legend>
            <div className="grid-2">
              {text("given", "Fornavn", { ac: "given-name" })}
              {text("family", "Efternavn", { ac: "family-name" })}
            </div>
            <div>
              <button type="button" className="disclosure" aria-expanded={moreNames} aria-controls="more-names"
                onClick={() => { setMoreNames(!moreNames); if (!moreNames) focusNext.current = "f-prefix"; }}>
                <Icon name="chevron" />Flere navnefelter
              </button>
            </div>
            <div className="grid-2" id="more-names" hidden={!moreNames}>
              {text("prefix", "Titel", { ac: "honorific-prefix", help: "Fx Dr. eller Prof." })}
              {text("middle", "Mellemnavn", { ac: "additional-name" })}
              {text("suffix", "Suffiks", { ac: "honorific-suffix", help: "Fx jr. eller cand.merc." })}
            </div>
            <div className="grid-2">{text("nickname", "Kaldenavn", { ac: "nickname" })}</div>
            <div className="grid-2">
              {text("title", "Stilling", { ac: "organization-title" })}
              {text("org", "Firma", { ac: "organization" })}
            </div>
          </fieldset>
          {repSection("phones", "phone", "Telefoner", "Telefonnummer", "tel", "tel")}
          {repSection("emails", "mail", "E-mails", "E-mailadresse", "email", "email")}
          {repSection("addresses", "home", "Adresser", "Adresse", "text")}
          {repSection("urls", "globe", "Websider", "Webadresse", "url", "url")}
          <fieldset className="fieldset">
            <legend className="block-title"><Icon name="cake" />Fødselsdag og note</legend>
            <div className="grid-2">
              {draft.birthday.startsWith("--") ? (
                <div className="field">
                  <span className="label">Fødselsdag</span>
                  <p className="help">Gemt uden årstal ({draft.birthday.slice(2).split("-").reverse().join("/")}).{" "}
                    <button type="button" className="btn btn-ghost btn-s" onClick={() => change("birthday", "")}>Ryd</button>
                  </p>
                </div>
              ) : text("birthday", "Fødselsdag", { type: "date", ac: "bday", max: today })}
            </div>
            <div className="field">
              <label className="label" htmlFor="f-note">Note</label>
              <textarea className="textarea" id="f-note" rows={4} value={draft.note} onChange={(e) => change("note", e.target.value)} />
            </div>
          </fieldset>
          <button type="submit" hidden tabIndex={-1}>Gem</button>
        </form>
      </div>
      <footer className="panel-foot hide-mobile" id="detail-foot">
        <button type="button" className="btn" onClick={cancel}><Icon name="close" /><span className="btn-label">Annuller</span></button>
        <span className="spacer" />
        <button type="button" className={"btn btn-primary" + (saving ? " is-loading" : "")} onClick={save} aria-disabled={saving || undefined}>
          <Icon name="check" /><span className="btn-label">Gem</span>
        </button>
      </footer>
    </>
  );
}

/* ==========================================================================
   App-tilstand og handlinger mod Radicale.
   ========================================================================== */
import { AuthError, DavClient, DavError, NetworkError, PreconditionError, basicAuth } from "../dav/client";
import {
  type Book, createBook as mkBook, deleteCard, discover, fetchCards, getCard, listBooks, newHref, putCard, slugOf, uuid,
} from "../dav/carddav";
import { type ContactData, ensureRequired, hasIdentity, newCard, readContact, writeContact } from "../vcard/contact";
import { type CardFailure, type VCard, parseVCard, parseVcf, serialize } from "../vcard/vcard";
import { resetRoute } from "./router";
import { createStore } from "./store";
import { toast } from "./ui";

export interface StoredContact {
  /** "<bog>:<fil>" — unik på tværs af bøger */
  id: string;
  bookId: string;
  href: string;
  etag: string;
  raw: string;
  data: ContactData;
}

export type LoginError = "auth" | "server" | null;

interface AppState {
  user: string;
  phase: "login" | "loading" | "ready";
  loginError: LoginError;
  books: Book[];
  home: string;
  contacts: Record<string, StoredContact>;
  query: string;
}

export const app = createStore<AppState>({
  user: "", phase: "login", loginError: null, books: [], home: "", contacts: {}, query: "",
});

/** Radicale ligger bag /dav/ ved siden af appen (nginx eller Vite-proxy). */
export const DAV_BASE = new URL("dav/", document.baseURI).toString();
export const SERVER = location.host;

const SESSION_KEY = "pixelbog.session";
let client: DavClient | null = null;

function dav(): DavClient {
  if (!client) throw new AuthError(401, "Ikke logget ind");
  return client;
}

function toStored(bookId: string, href: string, etag: string, raw: string): StoredContact | null {
  try {
    return { id: `${bookId}:${slugOf(href)}`, bookId, href, etag, raw, data: readContact(parseVCard(raw)) };
  } catch {
    return null; // et ødelagt kort på serveren skal ikke vælte hele listen
  }
}

function putStored(c: StoredContact) {
  app.set((s) => ({ contacts: { ...s.contacts, [c.id]: c } }));
}

function dropStored(id: string) {
  app.set((s) => {
    const { [id]: _gone, ...rest } = s.contacts;
    return { contacts: rest };
  });
}

/* ---------- Login og indlæsning ---------- */

export async function login(user: string, pass: string): Promise<LoginError> {
  const c = new DavClient(DAV_BASE, basicAuth(user, pass));
  try {
    await discover(c);
  } catch (e) {
    return e instanceof AuthError ? "auth" : "server";
  }
  client = c;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, pass })); } catch { /* privat tilstand */ }
  app.set({ user, loginError: null });
  await load();
  return null;
}

/** Genopret login efter genindlæsning af siden (gemt for fanens levetid). */
export function restoreSession(): boolean {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!s?.user) return false;
    client = new DavClient(DAV_BASE, basicAuth(s.user, s.pass));
    app.set({ user: s.user });
    void load();
    return true;
  } catch {
    return false;
  }
}

export async function load() {
  app.set({ phase: "loading" });
  try {
    const { home } = await discover(dav());
    const books = await listBooks(dav(), home);
    const contacts: Record<string, StoredContact> = {};
    const all = await Promise.all(books.map(async (b) => [b, await fetchCards(dav(), b)] as const));
    for (const [b, cards] of all) {
      for (const r of cards) {
        const c = toStored(b.id, r.href, r.etag, r.raw);
        if (c) contacts[c.id] = c;
      }
    }
    app.set({ home, books, contacts, phase: "ready" });
  } catch (e) {
    logout(e instanceof AuthError ? null : "server");
  }
}

let refreshing = false;
/** Henter bøger igen, hvis noget er ændret på serveren (sammenligner ctag). */
export async function refresh() {
  const s = app.get();
  if (s.phase !== "ready" || refreshing || !client) return;
  refreshing = true;
  try {
    const books = await listBooks(dav(), s.home);
    const changed = books.filter((b) => {
      const old = s.books.find((o) => o.id === b.id);
      return !old || !b.ctag || old.ctag !== b.ctag;
    });
    const fresh = await Promise.all(changed.map(async (b) => [b, await fetchCards(dav(), b)] as const));
    app.set((cur) => {
      const keep = Object.values(cur.contacts).filter((c) => books.some((b) => b.id === c.bookId) && !changed.some((b) => b.id === c.bookId));
      const contacts: Record<string, StoredContact> = Object.fromEntries(keep.map((c) => [c.id, c]));
      for (const [b, cards] of fresh) {
        for (const r of cards) {
          const c = toStored(b.id, r.href, r.etag, r.raw);
          if (c) contacts[c.id] = c;
        }
      }
      return { books, contacts };
    });
  } catch (e) {
    handle(e);
  } finally {
    refreshing = false;
  }
}

export function logout(error: LoginError = null) {
  client = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  app.set({ phase: "login", loginError: error, books: [], contacts: {}, home: "", query: "" });
  resetRoute();
}

/** Fælles fejlhåndtering: udløbet login sender brugeren til titelskærmen. */
export function handle(e: unknown): never {
  if (e instanceof AuthError) {
    logout(null);
    toast("Logget ud", "Sessionen er udløbet. Log ind igen.", "logout");
  }
  throw e;
}

export function errorText(e: unknown): string {
  if (e instanceof NetworkError) return `${SERVER} svarer ikke. Tjek din forbindelse, eller om Radicale kører.`;
  if (e instanceof DavError) {
    const reason = /<title>(.*?)<\/title>|^(.{1,160})$/s.exec(e.body.trim());
    return `Serveren afviste ændringen (${e.status}${reason ? ": " + (reason[1] || reason[2]).trim() : ""}).`;
  }
  return e instanceof Error ? e.message : "Ukendt fejl";
}

/* ---------- Gem / slet ---------- */

export class ConflictError extends Error {
  /** Serverens version, eller null hvis kontakten er slettet på serveren */
  constructor(public server: StoredContact | null) {
    super("Kontakten er ændret på en anden enhed");
  }
}

function bookById(id: string): Book {
  const b = app.get().books.find((x) => x.id === id);
  if (!b) throw new Error("Adressebogen findes ikke længere");
  return b;
}

/**
 * Gemmer en ny eller ændret kontakt.
 * `overwrite` = brugeren har valgt at overskrive serverens version efter en konflikt.
 */
export async function saveContact(
  prev: StoredContact | null, bookId: string, data: ContactData,
  overwrite?: { server: StoredContact | null },
): Promise<StoredContact> {
  try {
    if (!prev) {
      const href = newHref(bookById(bookId));
      const raw = serialize(writeContact(newCard(uuid()), data));
      const etag = await putCard(dav(), href, raw, null);
      const c = toStored(bookId, href, etag, raw)!;
      putStored(c);
      return c;
    }
    let base: VCard, etag: string | null, replaceAll = false;
    if (overwrite) {
      // Byg oven på serverens kort, så felter appen ikke kender, ikke går tabt
      base = overwrite.server ? parseVCard(overwrite.server.raw) : parseVCard(prev.raw);
      etag = overwrite.server ? overwrite.server.etag : null;
      replaceAll = !!overwrite.server;
    } else {
      base = parseVCard(prev.raw);
      etag = prev.etag;
    }
    const raw = serialize(writeContact(base, data, { replaceAll }));
    let newTag: string;
    try {
      newTag = await putCard(dav(), prev.href, raw, etag);
    } catch (e) {
      if (!(e instanceof PreconditionError)) throw e;
      const fresh = await getCard(dav(), prev.href);
      throw new ConflictError(fresh ? toStored(prev.bookId, fresh.href, fresh.etag, fresh.raw) : null);
    }
    const c = toStored(prev.bookId, prev.href, newTag, raw)!;
    putStored(c);
    return c;
  } catch (e) {
    if (e instanceof ConflictError) throw e;
    return handle(e);
  }
}

/** Erstatter den lokale kopi med serverens version (efter "Genindlæs"). */
export function acceptServer(prev: StoredContact, server: StoredContact | null) {
  if (server) putStored(server);
  else dropStored(prev.id);
}

/** Sletter kontakten. Returnerer en fortryd-funktion. */
export async function removeContact(c: StoredContact): Promise<() => Promise<void>> {
  try {
    await deleteCard(dav(), c.href, c.etag);
  } catch (e) {
    if (e instanceof PreconditionError) {
      const fresh = await getCard(dav(), c.href);
      if (fresh) { const s = toStored(c.bookId, fresh.href, fresh.etag, fresh.raw); if (s) putStored(s); }
      throw new ConflictError(fresh ? toStored(c.bookId, fresh.href, fresh.etag, fresh.raw) : null);
    }
    return handle(e);
  }
  dropStored(c.id);
  return async () => {
    try {
      const etag = await putCard(dav(), c.href, c.raw, null);
      putStored({ ...c, etag });
    } catch (e) {
      handle(e);
    }
  };
}

export async function createAddressBook(name: string): Promise<Book> {
  try {
    const b = await mkBook(dav(), app.get().home, name);
    app.set((s) => ({ books: [...s.books, b].sort((x, y) => x.name.localeCompare(y.name, "da")) }));
    return b;
  } catch (e) {
    return handle(e);
  }
}

/* ---------- Import / eksport ---------- */

export interface ImportPlan {
  cards: { card: VCard; index: number; line: number }[];
  failures: CardFailure[];
  total: number;
}

export function planImport(text: string): ImportPlan {
  const { cards, failures } = parseVcf(text);
  const ok: ImportPlan["cards"] = [];
  const bad = [...failures];
  for (const c of cards) {
    if (!hasIdentity(readContact(c.card))) bad.push({ index: c.index, line: c.line, reason: "Kortet har hverken navn, telefon eller e-mail" });
    else ok.push({ card: c.card, index: c.index, line: c.line });
  }
  bad.sort((a, b) => a.index - b.index);
  return { cards: ok, failures: bad, total: cards.length + failures.length };
}

/** Lægger ét kort op. Kaster med en læsbar grund, hvis serveren afviser det. */
export async function importOne(bookId: string, card: VCard): Promise<void> {
  const book = bookById(bookId);
  const raw = serialize(ensureRequired(card, uuid));
  const href = newHref(book);
  try {
    const etag = await putCard(dav(), href, raw, null);
    const c = toStored(bookId, href, etag, raw);
    if (c) putStored(c);
  } catch (e) {
    if (e instanceof AuthError) handle(e);
    if (e instanceof DavError && e.status === 409) throw new Error("Findes allerede i bogen (samme UID)");
    throw new Error(e instanceof NetworkError ? "Serveren svarede ikke" : errorText(e));
  }
}

export function contactsIn(bookId: string): StoredContact[] {
  return Object.values(app.get().contacts).filter((c) => bookId === "alle" || c.bookId === bookId);
}

export function exportVcf(list: StoredContact[]): string {
  return list.map((c) => c.raw.replace(/\r?\n/g, "\r\n").replace(/(\r\n)*$/, "\r\n")).join("");
}

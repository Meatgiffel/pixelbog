/* ==========================================================================
   CardDAV oven på DavClient: find adressebøger, hent, gem og slet kort.
   ========================================================================== */
import { DavClient, DavError, NS, key } from "./client";

export interface Book {
  /** Sidste del af stien — bruges i URL'en (#/bog/<id>) */
  id: string;
  href: string;
  name: string;
  ctag: string | null;
}

export interface RemoteCard {
  href: string;
  etag: string;
  raw: string;
}

const text = (el: Element | undefined) => el?.textContent?.trim() ?? "";

/** UUID v4. crypto.randomUUID findes kun på HTTPS/localhost, getRandomValues overalt */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const hrefIn = (el: Element | undefined) => (el ? text(el.getElementsByTagNameNS(NS.DAV, "href")[0]) : "");

export function slugOf(href: string): string {
  const parts = href.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? "");
}

export async function discover(client: DavClient): Promise<{ principal: string; home: string }> {
  const [root] = await client.propfind(client.base, 0, "<d:current-user-principal/>");
  const principal = hrefIn(root?.props.get(key(NS.DAV, "current-user-principal"))) || new URL(client.base).pathname;
  const [p] = await client.propfind(principal, 0, "<card:addressbook-home-set/>");
  const home = hrefIn(p?.props.get(key(NS.CARD, "addressbook-home-set"))) || principal;
  return { principal, home };
}

export async function listBooks(client: DavClient, home: string): Promise<Book[]> {
  const res = await client.propfind(home, 1, "<d:resourcetype/><d:displayname/><cs:getctag/>");
  return res
    .filter((r) => r.props.get(key(NS.DAV, "resourcetype"))?.getElementsByTagNameNS(NS.CARD, "addressbook").length)
    .map((r) => ({
      id: slugOf(r.href),
      href: r.href.endsWith("/") ? r.href : r.href + "/",
      name: text(r.props.get(key(NS.DAV, "displayname"))) || slugOf(r.href),
      ctag: text(r.props.get(key(NS.CS, "getctag"))) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}

export async function fetchCards(client: DavClient, book: Book): Promise<RemoteCard[]> {
  const res = await client.report(
    book.href,
    `<?xml version="1.0" encoding="utf-8"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="${NS.CARD}"><d:prop><d:getetag/><card:address-data/></d:prop></card:addressbook-query>`,
  );
  return res
    .filter((r) => r.props.has(key(NS.CARD, "address-data")))
    .map((r) => ({
      href: r.href,
      etag: text(r.props.get(key(NS.DAV, "getetag"))),
      raw: r.props.get(key(NS.CARD, "address-data"))?.textContent ?? "",
    }));
}

export async function getCard(client: DavClient, href: string): Promise<RemoteCard | null> {
  const res = await client.request("GET", href, { allow: [404, 410] });
  if (!res.ok) return null;
  return { href, etag: res.headers.get("ETag") ?? "", raw: await res.text() };
}

/** Gemmer et kort. `etag` = ret eksisterende (If-Match), `null` = opret nyt (If-None-Match). */
export async function putCard(client: DavClient, href: string, raw: string, etag: string | null): Promise<string> {
  const res = await client.request("PUT", href, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
    },
    body: raw,
  });
  await res.text().catch(() => "");
  const tag = res.headers.get("ETag");
  if (tag) return tag;
  const fresh = await getCard(client, href);
  if (!fresh) throw new DavError(404, "Kortet forsvandt efter det blev gemt");
  return fresh.etag;
}

export async function deleteCard(client: DavClient, href: string, etag: string): Promise<void> {
  // 404 = allerede væk, hvilket er det, vi ville
  const res = await client.request("DELETE", href, { headers: etag ? { "If-Match": etag } : {}, allow: [404] });
  await res.text().catch(() => "");
}

export async function createBook(client: DavClient, home: string, name: string): Promise<Book> {
  const href = `${home.replace(/\/?$/, "/")}${uuid()}/`;
  const esc = name.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await client.request("MKCOL", href, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="utf-8"?><d:mkcol xmlns:d="DAV:" xmlns:card="${NS.CARD}"><d:set><d:prop><d:resourcetype><d:collection/><card:addressbook/></d:resourcetype><d:displayname>${esc}</d:displayname></d:prop></d:set></d:mkcol>`,
  });
  return { id: slugOf(href), href, name, ctag: null };
}

export function newHref(book: Book): string {
  return `${book.href}${uuid()}.vcf`;
}

/* ==========================================================================
   Minimal WebDAV-klient: fetch + Basic auth + multistatus-parsing.
   ========================================================================== */

export const NS = {
  DAV: "DAV:",
  CARD: "urn:ietf:params:xml:ns:carddav",
  CS: "http://calendarserver.org/ns/",
} as const;

export class DavError extends Error {
  constructor(public status: number, message: string, public body = "") {
    super(message);
    this.name = "DavError";
  }
}
/** 401/403: forkert login eller sessionen er udløbet */
export class AuthError extends DavError {}
/** 412: nogen har ændret ressourcen siden vi hentede den */
export class PreconditionError extends DavError {}
/** Netværket eller proxyen svarer ikke */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export interface DavResponse {
  href: string;
  status: number | null;
  /** Fundne egenskaber (status 200), nøgle = "namespace|lokalnavn" */
  props: Map<string, Element>;
}

export const key = (ns: string, local: string) => `${ns}|${local}`;

export function basicAuth(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return "Basic " + btoa(bin);
}

function statusCode(text: string | null | undefined): number | null {
  const m = /HTTP\/[\d.]+\s+(\d{3})/.exec(text || "");
  return m ? +m[1] : null;
}

export function parseMultistatus(xml: string): DavResponse[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new DavError(0, "Ugyldigt svar fra serveren");
  const out: DavResponse[] = [];
  for (const r of Array.from(doc.getElementsByTagNameNS(NS.DAV, "response"))) {
    const href = r.getElementsByTagNameNS(NS.DAV, "href")[0]?.textContent?.trim() ?? "";
    const props = new Map<string, Element>();
    let status: number | null = null;
    for (const child of Array.from(r.children)) {
      if (child.namespaceURI === NS.DAV && child.localName === "status") status = statusCode(child.textContent);
    }
    for (const ps of Array.from(r.getElementsByTagNameNS(NS.DAV, "propstat"))) {
      const st = statusCode(ps.getElementsByTagNameNS(NS.DAV, "status")[0]?.textContent);
      if (st !== null && (st < 200 || st > 299)) continue;
      const prop = ps.getElementsByTagNameNS(NS.DAV, "prop")[0];
      if (!prop) continue;
      for (const el of Array.from(prop.children)) props.set(key(el.namespaceURI ?? "", el.localName), el);
    }
    out.push({ href, status, props });
  }
  return out;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: string;
  /** Statuskoder der ikke skal kaste en fejl */
  allow?: number[];
}

export class DavClient {
  constructor(public readonly base: string, private readonly auth: string) {}

  /** Hrefs fra serveren er stier ("/dav/bruger/…"); løs dem op mod base. */
  url(href: string): string {
    return new URL(href, this.base).toString();
  }

  async request(method: string, href: string, opts: RequestOptions = {}): Promise<Response> {
    const url = this.url(href);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: this.auth, ...opts.headers },
        body: opts.body,
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new NetworkError("Kan ikke forbinde til serveren");
    }
    if (res.ok || opts.allow?.includes(res.status)) return res;
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new AuthError(res.status, "Ikke logget ind", body);
    if (res.status === 412) throw new PreconditionError(res.status, "Ændret på serveren", body);
    // nginx/Vite svarer 502/504, når Radicale ikke kører
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new NetworkError("Serveren svarer ikke");
    throw new DavError(res.status, `${method} ${url} fejlede (${res.status})`, body);
  }

  async propfind(url: string, depth: 0 | 1, props: string): Promise<DavResponse[]> {
    const res = await this.request("PROPFIND", url, {
      headers: { Depth: String(depth), "Content-Type": "application/xml; charset=utf-8" },
      body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:card="${NS.CARD}" xmlns:cs="${NS.CS}"><d:prop>${props}</d:prop></d:propfind>`,
    });
    return parseMultistatus(await res.text());
  }

  async report(url: string, body: string): Promise<DavResponse[]> {
    const res = await this.request("REPORT", url, {
      headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body,
    });
    return parseMultistatus(await res.text());
  }
}

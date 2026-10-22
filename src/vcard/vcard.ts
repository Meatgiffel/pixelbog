/* ==========================================================================
   vCard (2.1 / 3.0 / 4.0) — lav-niveau parser og serializer.
   Hver egenskab husker sin oprindelige linje (raw). Egenskaber, appen ikke
   rører, skrives derfor tilbage præcis som de kom fra serveren.
   ========================================================================== */

export interface VParam {
  name: string; // altid store bogstaver
  values: string[];
}

export interface VProp {
  group: string | null;
  name: string; // altid store bogstaver
  params: VParam[];
  /** Rå værdi, stadig escapet som i filen */
  value: string;
  /** Den oprindelige tekst inkl. foldninger. null = ny eller ændret, bygges ved serialisering */
  raw: string | null;
}

export interface VCard {
  props: VProp[]; // uden BEGIN/END
}

export interface ParsedCard {
  card: VCard;
  index: number; // 1-baseret nummer i filen
  line: number; // linjen med BEGIN:VCARD
}

export interface CardFailure {
  index: number;
  line: number;
  reason: string;
}

/* ---------- Linjer ---------- */

interface LogicalLine {
  text: string; // udfoldet
  physical: string; // som i filen, inkl. foldninger (CRLF)
  line: number;
}

function unfold(text: string): LogicalLine[] {
  const physical = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const out: LogicalLine[] = [];
  physical.forEach((l, i) => {
    const prev = out[out.length - 1];
    if (prev && (l.startsWith(" ") || l.startsWith("\t"))) {
      prev.text += l.slice(1);
      prev.physical += "\r\n" + l;
      return;
    }
    // vCard 2.1 quoted-printable: "=" sidst på linjen betyder, at værdien fortsætter
    if (prev && /QUOTED-PRINTABLE/i.test(headOf(prev.text)) && prev.text.endsWith("=")) {
      prev.text = prev.text.slice(0, -1) + l;
      prev.physical += "\r\n" + l;
      return;
    }
    out.push({ text: l, physical: l, line: i + 1 });
  });
  return out;
}

/** Finder første kolon uden for anførselstegn. */
function colonIndex(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) return i;
  }
  return -1;
}

function headOf(line: string): string {
  const i = colonIndex(line);
  return i < 0 ? line : line.slice(0, i);
}

function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseLine(text: string): VProp | null {
  const colon = colonIndex(text);
  if (colon < 0) return null;
  const [nameTok, ...paramToks] = splitOutsideQuotes(text.slice(0, colon), ";");
  const dot = nameTok.lastIndexOf(".");
  const group = dot > 0 ? nameTok.slice(0, dot) : null;
  const name = (dot > 0 ? nameTok.slice(dot + 1) : nameTok).trim().toUpperCase();
  if (!name) return null;
  const params: VParam[] = [];
  for (const tok of paramToks) {
    if (!tok) continue;
    const eq = tok.indexOf("=");
    if (eq < 0) {
      // vCard 2.1: TEL;CELL;HOME:… — løse parametre er typer
      params.push({ name: "TYPE", values: [tok] });
      continue;
    }
    params.push({
      name: tok.slice(0, eq).trim().toUpperCase(),
      values: splitOutsideQuotes(tok.slice(eq + 1), ",").map((v) => v.replace(/^"(.*)"$/, "$1")),
    });
  }
  return { group, name, params, value: text.slice(colon + 1), raw: text };
}

/* ---------- Kort ---------- */

/** Læser en fil med ét eller flere kort. Kort uden END:VCARD rapporteres som fejl. */
export function parseVcf(text: string): { cards: ParsedCard[]; failures: CardFailure[] } {
  const cards: ParsedCard[] = [];
  const failures: CardFailure[] = [];
  let cur: ParsedCard | null = null;
  let index = 0;
  for (const { text: t, physical, line } of unfold(text)) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      if (cur) failures.push({ index: cur.index, line: cur.line, reason: "Mangler END:VCARD" });
      cur = { card: { props: [] }, index: ++index, line };
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      if (cur) cards.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const prop = parseLine(t);
    if (prop) cur.card.props.push({ ...prop, raw: physical });
  }
  if (cur) failures.push({ index: cur.index, line: cur.line, reason: "Mangler END:VCARD" });
  return { cards, failures };
}

/** Læser præcis ét kort (fx en .vcf fra serveren). */
export function parseVCard(text: string): VCard {
  const { cards, failures } = parseVcf(text);
  if (!cards.length) throw new Error(failures[0]?.reason ?? "Ingen vCard fundet");
  return cards[0].card;
}

/* ---------- Værdier ---------- */

export function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN:])/g, (_, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([;,])/g, "\\$1");
}

/** Deler en struktureret værdi (N, ADR, ORG) ved ikke-escapede semikoloner. */
export function splitStructured(raw: string): string[] {
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) { cur += ch + raw[++i]; continue; }
    if (ch === ";") { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(unescapeText);
}

export function joinStructured(parts: string[]): string {
  return parts.map(escapeText).join(";");
}

export function getParam(prop: VProp, name: string): string[] {
  return prop.params.filter((p) => p.name === name).flatMap((p) => p.values);
}

/** Rå værdi med evt. quoted-printable (vCard 2.1) afkodet. Stadig escapet. */
export function decodedValue(prop: VProp): string {
  const enc = getParam(prop, "ENCODING")[0]?.toUpperCase();
  if (enc !== "QUOTED-PRINTABLE") return prop.value;
  const bytes: number[] = [];
  const v = prop.value;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "=" && /^[0-9A-F]{2}$/i.test(v.slice(i + 1, i + 3))) {
      bytes.push(parseInt(v.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(v[i]));
    }
  }
  const charset = getParam(prop, "CHARSET")[0] || "utf-8";
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

export function textValue(prop: VProp): string {
  return unescapeText(decodedValue(prop));
}

export function structuredValue(prop: VProp): string[] {
  return splitStructured(decodedValue(prop));
}

export function first(card: VCard, name: string): VProp | undefined {
  return card.props.find((p) => p.name === name);
}

export function all(card: VCard, name: string): VProp[] {
  return card.props.filter((p) => p.name === name);
}

export function versionOf(card: VCard): string {
  return first(card, "VERSION")?.value.trim() || "3.0";
}

/* ---------- Serialisering ---------- */

function quoteParam(v: string): string {
  return /[:;,]/.test(v) ? `"${v.replace(/"/g, "'")}"` : v;
}

export function buildLine(prop: VProp): string {
  const name = (prop.group ? prop.group + "." : "") + prop.name;
  const params = prop.params.map((p) => `;${p.name}=${p.values.map(quoteParam).join(",")}`).join("");
  return `${name}${params}:${prop.value}`;
}

const encoder = new TextEncoder();

/** Folder en linje til højst 75 oktetter pr. fysisk linje uden at dele UTF-8-tegn. */
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = " ";
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function serialize(card: VCard): string {
  const lines = card.props.map((p) => p.raw ?? fold(buildLine(p)));
  return ["BEGIN:VCARD", ...lines, "END:VCARD"].join("\r\n") + "\r\n";
}

/** Laver en ny egenskab, der bygges ved serialisering. */
export function prop(name: string, value: string, params: VParam[] = [], group: string | null = null): VProp {
  return { group, name: name.toUpperCase(), params, value, raw: null };
}

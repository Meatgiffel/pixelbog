/* ==========================================================================
   Kontakt-model ⇄ vCard.
   writeContact() rører kun de egenskaber, der faktisk er ændret i formularen.
   Alt andet (X-felter, grupper, PREF, Apple-labels …) bevares uændret.
   ========================================================================== */
import {
  type VCard, type VParam, type VProp,
  escapeText, first, getParam, joinStructured, prop, structuredValue, textValue, unescapeText, versionOf,
} from "./vcard";

export type FieldType = "mobil" | "hjem" | "arbejde" | "andet";

export interface ValueItem {
  type: FieldType;
  value: string;
  /** Index i kildekortets props — bruges til at bevare uændrede linjer */
  ref?: number;
}

export interface AddressItem {
  type: FieldType;
  street: string;
  postal: string;
  city: string;
  region: string;
  country: string;
  ref?: number;
}

export interface ContactData {
  prefix: string;
  given: string;
  middle: string;
  family: string;
  suffix: string;
  nickname: string;
  title: string;
  org: string;
  /** data:-URL eller http(s)-URL */
  photo: string | null;
  phones: ValueItem[];
  emails: ValueItem[];
  addresses: AddressItem[];
  urls: ValueItem[];
  /** "YYYY-MM-DD", "--MM-DD" (uden år) eller "" */
  birthday: string;
  note: string;
}

export type ListKey = "phones" | "emails" | "addresses" | "urls";
const LIST_PROP: Record<ListKey, string> = { phones: "TEL", emails: "EMAIL", addresses: "ADR", urls: "URL" };

export function blankContact(): ContactData {
  return {
    prefix: "", given: "", middle: "", family: "", suffix: "", nickname: "", title: "", org: "", photo: null,
    phones: [], emails: [], addresses: [], urls: [], birthday: "", note: "",
  };
}

/* ---------- Typer ---------- */

const MANAGED_TYPES = new Set(["CELL", "MOBILE", "IPHONE", "HOME", "WORK", "OTHER"]);
const TYPE_TOKEN: Record<FieldType, string | null> = { mobil: "CELL", hjem: "HOME", arbejde: "WORK", andet: null };

function typeTokens(p: VProp): string[] {
  return getParam(p, "TYPE").flatMap((v) => v.split(",")).map((t) => t.trim()).filter(Boolean);
}

function appleLabel(card: VCard, p: VProp): string {
  if (!p.group) return "";
  const label = card.props.find((q) => q.group?.toLowerCase() === p.group!.toLowerCase() && q.name === "X-ABLABEL");
  return label ? textValue(label) : "";
}

function typeOf(card: VCard, p: VProp): FieldType {
  const t = new Set(typeTokens(p).map((x) => x.toUpperCase()));
  if (p.name === "TEL" && (t.has("CELL") || t.has("MOBILE") || t.has("IPHONE"))) return "mobil";
  if (t.has("WORK")) return "arbejde";
  if (t.has("HOME")) return "hjem";
  const label = appleLabel(card, p);
  if (p.name === "TEL" && /mobile|iphone/i.test(label)) return "mobil";
  if (/work/i.test(label)) return "arbejde";
  if (/home/i.test(label)) return "hjem";
  return "andet";
}

/* ---------- Læsning ---------- */

function readTel(p: VProp): string {
  return textValue(p).replace(/^tel:/i, "").trim();
}

function readAddress(p: VProp): Omit<AddressItem, "type" | "ref"> {
  const c = structuredValue(p);
  return {
    street: [c[2], c[1]].filter((s) => s && s.trim()).join(", "),
    city: c[3] || "",
    region: c[4] || "",
    postal: c[5] || "",
    country: c[6] || "",
  };
}

export function normalizeBirthday(raw: string, omitYear?: string): string {
  const v = raw.trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v);
  if (m) return omitYear && m[1] === omitYear ? `--${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = /^--(\d{2})-?(\d{2})/.exec(v);
  if (m) return `--${m[1]}-${m[2]}`;
  return "";
}

export function photoSrc(p: VProp): string | null {
  const enc = getParam(p, "ENCODING")[0]?.toUpperCase();
  const value = p.value.trim();
  if (enc === "B" || enc === "BASE64") {
    const t = (getParam(p, "TYPE")[0] || "jpeg").toLowerCase();
    const mime = t.includes("/") ? t : "image/" + (t === "jpg" ? "jpeg" : t);
    return `data:${mime};base64,${value.replace(/\s/g, "")}`;
  }
  const uri = unescapeText(value);
  // Radicale har tidligere gemt vCard 4-fotos uden data (data:image/png\;base64) — dem springer vi over
  if (/^data:image\/[^,]+,.+/i.test(uri) || /^https?:\/\//i.test(uri)) return uri;
  return null;
}

export function readContact(card: VCard): ContactData {
  const d = blankContact();
  const n = first(card, "N");
  if (n) {
    const c = structuredValue(n);
    [d.family, d.given, d.middle, d.prefix, d.suffix] = [0, 1, 2, 3, 4].map((i) => (c[i] || "").trim());
  }
  const org = first(card, "ORG");
  if (org) d.org = structuredValue(org).map((s) => s.trim()).filter(Boolean).join(", ");
  const fn = first(card, "FN");
  const fnText = fn ? textValue(fn).trim() : "";
  // Kort uden N (typisk vCard 4 eller simple eksporter): del FN i for- og efternavn
  if (!d.given && !d.family && fnText && fnText !== d.org && /\p{L}/u.test(fnText) && !fnText.includes("@")) {
    const parts = fnText.split(/\s+/);
    d.family = parts.length > 1 ? parts.pop()! : "";
    d.given = parts.join(" ");
  }
  const text = (name: string) => { const p = first(card, name); return p ? textValue(p).trim() : ""; };
  d.nickname = text("NICKNAME");
  d.title = text("TITLE");
  d.note = text("NOTE");

  card.props.forEach((p, i) => {
    switch (p.name) {
      case "TEL": d.phones.push({ type: typeOf(card, p), value: readTel(p), ref: i }); break;
      case "EMAIL": d.emails.push({ type: typeOf(card, p), value: textValue(p).trim(), ref: i }); break;
      case "URL": d.urls.push({ type: typeOf(card, p), value: textValue(p).trim(), ref: i }); break;
      case "ADR": d.addresses.push({ type: typeOf(card, p), ...readAddress(p), ref: i }); break;
    }
  });

  const bday = first(card, "BDAY");
  if (bday) d.birthday = normalizeBirthday(textValue(bday), getParam(bday, "X-APPLE-OMIT-YEAR")[0]);
  const photo = first(card, "PHOTO");
  if (photo) d.photo = photoSrc(photo);
  return d;
}

/* ---------- Visningsnavne ---------- */

export const personName = (c: ContactData) =>
  [c.prefix, c.given, c.middle, c.family, c.suffix].filter((s) => s.trim()).join(" ");

/** FN skrives som personnavn eller firma — aldrig et nummer, så det ikke læses som et navn igen. */
export const formattedName = (c: ContactData) => personName(c) || c.org.trim();

export function hasIdentity(c: ContactData): boolean {
  return [c.given, c.family, c.org, ...c.phones.map((p) => p.value), ...c.emails.map((e) => e.value)].some((v) => v.trim());
}

/* ---------- Skrivning ---------- */

export interface WriteOptions {
  /** Erstat alle styrede felter (bruges ved "Overskriv" oven på serverens version) */
  replaceAll?: boolean;
}

function isV4(card: VCard) {
  return versionOf(card).startsWith("4");
}

function typeParams(base: VProp | null, type: FieldType, v4: boolean): VParam[] {
  const kept = base ? typeTokens(base).filter((t) => !MANAGED_TYPES.has(t.toUpperCase())) : [];
  const tok = TYPE_TOKEN[type];
  const tokens = tok ? [...kept, v4 ? tok.toLowerCase() : tok] : kept;
  const others = base ? base.params.filter((p) => !["TYPE", "ENCODING", "CHARSET", "VALUE"].includes(p.name)) : [];
  return tokens.length ? [...others, { name: "TYPE", values: tokens }] : others;
}

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function itemEquals(key: ListKey, a: ValueItem | AddressItem, b: ValueItem | AddressItem): boolean {
  if (a.type !== b.type) return false;
  if (key === "addresses") {
    const x = a as AddressItem, y = b as AddressItem;
    return (["street", "postal", "city", "region", "country"] as const).every((k) => x[k].trim() === y[k].trim());
  }
  return (a as ValueItem).value.trim() === (b as ValueItem).value.trim();
}

function isEmptyItem(key: ListKey, it: ValueItem | AddressItem): boolean {
  if (key === "addresses") {
    const a = it as AddressItem;
    return ![a.street, a.postal, a.city].some((s) => s.trim());
  }
  return !(it as ValueItem).value.trim();
}

function listProp(key: ListKey, it: ValueItem | AddressItem, base: VProp | null, v4: boolean): VProp {
  const params = typeParams(base, it.type, v4);
  let value: string;
  if (key === "addresses") {
    const a = it as AddressItem;
    const pobox = base ? structuredValue(base)[0] || "" : "";
    value = joinStructured([pobox, "", clean(a.street), clean(a.city), clean(a.region), clean(a.postal), clean(a.country)]);
  } else {
    value = clean((it as ValueItem).value);
  }
  return { group: base?.group ?? null, name: LIST_PROP[key], params, value, raw: null };
}

function setSingle(card: VCard, name: string, value: string | null, params: VParam[] = []) {
  const existing = first(card, name);
  if (value === null) {
    card.props = card.props.filter((p) => p !== existing);
    return;
  }
  if (existing) {
    const keep = existing.params.filter((p) => !["ENCODING", "CHARSET", "VALUE"].includes(p.name) && !p.name.startsWith("X-APPLE"));
    Object.assign(existing, { value, params: [...keep, ...params], raw: null });
  } else {
    card.props.push(prop(name, value, params));
  }
}

function escapeSingle(s: string) {
  return joinStructured([s.trim()]);
}

function photoProp(src: string, v4: boolean): { value: string; params: VParam[] } {
  const m = /^data:(image\/[\w.+-]+);base64,(.*)$/i.exec(src);
  // Escapet, ellers klipper Radicale (vobject) data-URI'en over ved kommaet
  if (v4) return { value: escapeText(src), params: [] };
  if (!m) return { value: src, params: [{ name: "VALUE", values: ["uri"] }] };
  const type = m[1].split("/")[1].toUpperCase();
  return { value: m[2], params: [{ name: "ENCODING", values: ["b"] }, { name: "TYPE", values: [type === "JPG" ? "JPEG" : type] }] };
}

export function newCard(uid: string): VCard {
  return {
    props: [
      prop("VERSION", "3.0"),
      prop("PRODID", "-//Pixelbog//Radicale UI//DA"),
      prop("UID", uid),
    ],
  };
}

export function writeContact(base: VCard, data: ContactData, opts: WriteOptions = {}): VCard {
  // Kopierne følger base.props index for index, så rækkernes ref kan slås op efter identitet
  const copies = base.props.map((p) => ({ ...p }));
  const card: VCard = { props: [...copies] };
  const before = opts.replaceAll ? null : readContact(base);
  const v4 = isV4(card);

  const nameKeys = ["family", "given", "middle", "prefix", "suffix"] as const;
  const nameChanged = nameKeys.some((k) => !before || before[k].trim() !== data[k].trim());
  // N er påkrævet i vCard 3
  if (nameChanged || (!v4 && !first(card, "N"))) setSingle(card, "N", joinStructured(nameKeys.map((k) => data[k].trim())));
  const orgChanged = !before || before.org.trim() !== data.org.trim();
  if (orgChanged) setSingle(card, "ORG", data.org.trim() ? escapeSingle(data.org) : null);
  if (nameChanged || orgChanged || !first(card, "FN")) setSingle(card, "FN", escapeSingle(formattedName(data)));

  for (const k of ["nickname", "title", "note"] as const) {
    if (before && before[k].trim() === data[k].trim()) continue;
    setSingle(card, k.toUpperCase(), data[k].trim() ? escapeSingle(data[k]) : null);
  }

  if (!before || before.birthday !== data.birthday) {
    const b = data.birthday;
    const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
    const noYear = /^--(\d{2})-(\d{2})$/.exec(b);
    if (full) setSingle(card, "BDAY", v4 ? full[1] + full[2] + full[3] : b);
    else if (noYear && v4) setSingle(card, "BDAY", `--${noYear[1]}${noYear[2]}`);
    // vCard 3 har intet format uden år — brug Apples konvention
    else if (noYear) setSingle(card, "BDAY", `1604-${noYear[1]}-${noYear[2]}`, [{ name: "X-APPLE-OMIT-YEAR", values: ["1604"] }]);
    else setSingle(card, "BDAY", null);
  }

  if (!before || before.photo !== data.photo) {
    const at = card.props.findIndex((p) => p.name === "PHOTO");
    card.props = card.props.filter((p) => p.name !== "PHOTO");
    if (data.photo) {
      const { value, params } = photoProp(data.photo, v4);
      card.props.splice(at < 0 ? card.props.length : at, 0, prop("PHOTO", value, params));
    }
  }

  // Lister: uændrede rækker beholder deres oprindelige linje og plads
  const staleGroups = new Set<string>();
  for (const key of Object.keys(LIST_PROP) as ListKey[]) {
    const name = LIST_PROP[key];
    const used = new Set<number>();
    const replaced = new Map<VProp, VProp>();
    const added: VProp[] = [];
    for (const it of data[key] as (ValueItem | AddressItem)[]) {
      if (isEmptyItem(key, it)) continue;
      const ref = it.ref;
      const src = !opts.replaceAll && ref != null && base.props[ref]?.name === name && !used.has(ref) ? base.props[ref] : null;
      if (!src || ref == null) { added.push(listProp(key, it, null, v4)); continue; }
      used.add(ref);
      const orig = (readContact({ props: [src] })[key] as (ValueItem | AddressItem)[])[0];
      // typen kan komme fra en Apple-label i samme gruppe, så sammenlign mod det fulde kort
      const origType = typeOf(base, src);
      if (orig && itemEquals(key, { ...orig, type: origType }, it)) continue;
      if (src.group && origType !== it.type) staleGroups.add(src.group.toLowerCase());
      replaced.set(copies[ref], listProp(key, it, src, v4));
    }
    const removed = new Set<VProp>();
    base.props.forEach((p, i) => {
      if (p.name !== name || used.has(i)) return;
      removed.add(copies[i]);
      if (p.group) staleGroups.add(p.group.toLowerCase());
    });
    // Nye rækker lander efter den sidste tilbageværende af samme slags, ellers hvor den første stod
    const remaining = card.props.some((p) => p.name === name && !removed.has(p));
    let placed = false;
    card.props = card.props.flatMap((p) => {
      if (!removed.has(p)) return [replaced.get(p) ?? p];
      if (remaining || placed) return [];
      placed = true;
      return added;
    });
    if (remaining) {
      const last = card.props.findLastIndex((p) => p.name === name);
      card.props.splice(last + 1, 0, ...added);
    } else if (!placed) {
      card.props.push(...added);
    }
  }
  // Fjern Apple-labels, der hører til slettede eller omtypede rækker
  if (staleGroups.size) {
    const live = new Set(card.props.filter((p) => p.group && !p.name.startsWith("X-AB")).map((p) => p.group!.toLowerCase()));
    card.props = card.props.filter((p) => {
      const g = p.group?.toLowerCase();
      if (!g || !p.name.startsWith("X-AB")) return true;
      if (p.name === "X-ABLABEL" && staleGroups.has(g)) return false;
      return live.has(g);
    });
  }
  return card;
}

/** Sikrer at kortet har UID og FN (krævet af Radicale/vCard 3). */
export function ensureRequired(card: VCard, uid: () => string): VCard {
  if (!first(card, "UID")) card.props.splice(1, 0, prop("UID", uid()));
  if (!first(card, "FN")) card.props.push(prop("FN", escapeSingle(formattedName(readContact(card)))));
  return card;
}

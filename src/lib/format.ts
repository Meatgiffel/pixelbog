/* Visningshjælpere til kontakter (navne, sortering, søgning, fødselsdage). */
import { type ContactData, type FieldType, type ListKey, personName } from "../vcard/contact";

export { personName };

export const TYPE_LABEL: Record<FieldType, string> = { mobil: "Mobil", hjem: "Hjem", arbejde: "Arbejde", andet: "Andet" };
const URL_LABEL: Record<FieldType, string> = { mobil: "Personlig", hjem: "Personlig", arbejde: "Arbejde", andet: "Andet" };
export const TYPE_OPTIONS: Record<ListKey, FieldType[]> = {
  phones: ["mobil", "hjem", "arbejde", "andet"],
  emails: ["hjem", "arbejde", "andet"],
  addresses: ["hjem", "arbejde", "andet"],
  urls: ["hjem", "arbejde", "andet"],
};
export const typeLabel = (list: ListKey, t: FieldType) => (list === "urls" ? URL_LABEL[t] : TYPE_LABEL[t]) || "Andet";

export const isNameless = (c: ContactData) => !personName(c) && !c.org.trim();

export function displayName(c: ContactData): string {
  return personName(c) || c.org.trim() || c.phones[0]?.value || c.emails[0]?.value || "Ukendt kontakt";
}

export function secondary(c: ContactData): string {
  if (isNameless(c)) return "Intet navn – tilføj et";
  if (personName(c)) return c.org || c.phones[0]?.value || c.emails[0]?.value || "Ingen detaljer endnu";
  return c.phones[0]?.value || c.emails[0]?.value || "Firma";
}

const collator = new Intl.Collator("da", { sensitivity: "base", numeric: true });

export function letterOf(c: ContactData): string {
  if (isNameless(c)) return "#";
  const ch = displayName(c).charAt(0).toLocaleUpperCase("da");
  return /[A-ZÆØÅ]/.test(ch) ? ch : "#";
}

export function compareContacts(a: ContactData, b: ContactData): number {
  const na = isNameless(a), nb = isNameless(b);
  if (na !== nb) return na ? 1 : -1;
  return collator.compare(displayName(a), displayName(b));
}

export function matches(c: ContactData, q: string): boolean {
  if (!q) return true;
  const hay = [displayName(c), c.nickname, c.org, c.title, ...c.emails.map((e) => e.value), ...c.addresses.map((a) => `${a.street} ${a.postal} ${a.city}`)]
    .join(" ").toLocaleLowerCase("da");
  const digits = c.phones.map((p) => p.value.replace(/\D/g, "")).join(" ");
  return q.toLocaleLowerCase("da").split(/\s+/).filter(Boolean)
    .every((t) => hay.includes(t) || (/\d/.test(t) && digits.includes(t.replace(/\D/g, ""))));
}

export const telHref = (v: string) => "tel:" + v.replace(/[^\d+]/g, "");
export const prettyUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
export const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "https://" + u);

const dateFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long" });

export interface BdayInfo {
  date: string;
  days: number;
  /** null når året ikke kendes */
  turning: number | null;
  age: number | null;
}

export function bdayInfo(iso: string, now = new Date()): BdayInfo | null {
  const m = /^(\d{4}|--)-?(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const y = m[1] === "--" ? null : +m[1], mo = +m[2] - 1, d = +m[3];
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), mo, d);
  if (next < today) next = new Date(today.getFullYear() + 1, mo, d);
  const days = Math.round((next.getTime() - today.getTime()) / 864e5);
  const turning = y === null ? null : next.getFullYear() - y;
  const age = turning === null ? null : days === 0 ? turning : turning - 1;
  const date = y === null ? dayFmt.format(new Date(2000, mo, d)) : dateFmt.format(new Date(y, mo, d));
  return { date, days, turning, age };
}

/* Karakterark — læsevisning af én kontakt */
import { Fragment, type ReactNode } from "react";
import {
  bdayInfo, displayName, isNameless, personName, prettyUrl, safeUrl, telHref, typeLabel,
} from "../lib/format";
import { Icon, type IconName } from "../lib/pixel";
import type { StoredContact } from "../state/app";
import { hashFor } from "../state/router";
import type { AddressItem, ListKey, ValueItem } from "../vcard/contact";
import { Avatar } from "./Avatar";
import { bookName } from "./actions";

function Value({ kind, it }: { kind: ListKey; it: ValueItem | AddressItem }) {
  if (kind === "phones") { const v = (it as ValueItem).value; return <a href={telHref(v)} className="od-nowrap">{v}</a>; }
  if (kind === "emails") { const v = (it as ValueItem).value; return <a href={`mailto:${v}`}>{v}</a>; }
  if (kind === "urls") { const v = (it as ValueItem).value; return <a href={safeUrl(v)} target="_blank" rel="noopener noreferrer">{prettyUrl(v)}</a>; }
  const a = it as AddressItem;
  const q = encodeURIComponent(`${a.street}, ${a.postal} ${a.city}`);
  const tail = [a.region, a.country].filter(Boolean).join(" · ");
  return (
    <>
      <address>
        {a.street}<br />
        <span className="od-nowrap">{a.postal}</span> {a.city}
        {tail ? <><br /><span className="t-soft">{tail}</span></> : null}
      </address>
      <a className="t-data-s" href={`https://www.openstreetmap.org/search?query=${q}`} target="_blank" rel="noopener noreferrer">Vis på kort</a>
    </>
  );
}

function Kv({ kind, list }: { kind: ListKey; list: (ValueItem | AddressItem)[] }) {
  return (
    <dl className="kv">
      {list.map((it, i) => (
        <Fragment key={i}>
          <dt><span className="tag">{typeLabel(kind, it.type)}</span></dt>
          <dd><Value kind={kind} it={it} /></dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Block({ icon, title, wide, children }: { icon: IconName; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={"block" + (wide ? " block-wide" : "")}>
      <h3 className="block-title"><Icon name={icon} />{title}</h3>
      {children}
    </section>
  );
}

const daysText = (d: number) => (d === 0 ? "I dag!" : d === 1 ? "I morgen" : `Om ${d} dage`);

export function ContactSheet({ contact, routeBook }: { contact: StoredContact; routeBook: string }) {
  const c = contact.data;
  const nameless = isNameless(c);
  const b = bdayInfo(c.birthday);
  const role = [c.title, personName(c) ? c.org : ""].filter(Boolean).join(" · ");
  const blocks: ReactNode[] = [];
  if (c.phones.length) blocks.push(<Block key="p" icon="phone" title="Telefoner"><Kv kind="phones" list={c.phones} /></Block>);
  if (c.emails.length) blocks.push(<Block key="e" icon="mail" title="E-mails"><Kv kind="emails" list={c.emails} /></Block>);
  if (c.addresses.length) blocks.push(<Block key="a" icon="home" title="Adresser"><Kv kind="addresses" list={c.addresses} /></Block>);
  if (c.urls.length) blocks.push(<Block key="u" icon="globe" title="Websider"><Kv kind="urls" list={c.urls} /></Block>);
  if (b) {
    blocks.push(
      <Block key="b" icon="cake" title="Fødselsdag">
        <p className="t-data"><strong>{b.date}</strong></p>
        <p className="t-data-s t-soft">
          {b.turning === null
            ? (b.days === 0 ? "Har fødselsdag i dag!" : `Fødselsdag om ${b.days} ${b.days === 1 ? "dag" : "dage"}`)
            : (b.days === 0 ? `Fylder ${b.turning} i dag!` : `Fylder ${b.turning} om ${b.days} ${b.days === 1 ? "dag" : "dage"}`)}
        </p>
      </Block>,
    );
  }
  if (c.note) blocks.push(<Block key="n" icon="note" title="Note" wide><p className="note-text">{c.note}</p></Block>);

  return (
    <article className="sheet" aria-labelledby="sheet-name">
      <div className="sheet-hero">
        <Avatar c={c} size="l" decorative={false} />
        <div>
          <h3 className={"sheet-name t-tabular" + (nameless ? " is-nameless" : "")} id="sheet-name">{displayName(c)}</h3>
          <div className="sheet-meta">
            {nameless ? (
              <p className="t-soft">Intet navn endnu. <a href={hashFor({ bookId: routeBook, contactId: contact.id, mode: "edit" })}>Tilføj et navn</a></p>
            ) : null}
            {c.nickname ? <p><span className="t-soft">Kaldes</span> <strong>“{c.nickname}”</strong></p> : null}
            {role ? <p><Icon name="work" /><span>{role}</span></p> : null}
          </div>
          <div className="stats">
            <div className="stat"><span className="stat-k">Bog</span><span className="stat-v">{bookName(contact.bookId)}</span></div>
            {b?.age != null ? <div className="stat"><span className="stat-k">Alder</span><span className="stat-v">{b.age} år</span></div> : null}
            {b ? <div className="stat"><span className="stat-k">Fødselsdag</span><span className="stat-v">{daysText(b.days)}</span></div> : null}
          </div>
        </div>
      </div>
      {blocks.length
        ? <div className="sheet-grid">{blocks}</div>
        : <p className="muted-empty">Ingen detaljer endnu. Vælg Rediger for at tilføje telefon, e-mail eller adresse.</p>}
    </article>
  );
}

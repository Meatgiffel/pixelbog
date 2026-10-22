/* Kontaktliste med søgning og bogstav-overskrifter */
import { Fragment, type ReactNode, useMemo } from "react";
import { compareContacts, displayName, isNameless, letterOf, matches, secondary } from "../lib/format";
import { Icon } from "../lib/pixel";
import { SERVER, type StoredContact, app } from "../state/app";
import { type Route, go, hashFor } from "../state/router";
import { useStore } from "../state/store";
import { Avatar } from "./Avatar";
import { bookName, openCreateBook } from "./actions";
import { openImport } from "./ImportDialog";

interface Props {
  route: Route;
  loading: boolean;
  drawer: boolean;
  setDrawer: (open: boolean) => void;
  bodyRef: (el: HTMLDivElement | null) => void;
}

export function ContactList({ route, loading, drawer, setDrawer, bodyRef }: Props) {
  const contacts = useStore(app, (s) => s.contacts);
  const books = useStore(app, (s) => s.books);
  const query = useStore(app, (s) => s.query);
  const q = query.trim();

  const inBook = useMemo(
    () => Object.values(contacts).filter((c) => route.bookId === "alle" || c.bookId === route.bookId),
    [contacts, route.bookId],
  );
  const visible = useMemo(
    () => inBook.filter((c) => matches(c.data, q)).sort((a, b) => compareContacts(a.data, b.data)),
    [inBook, q],
  );
  const title = bookName(route.bookId);
  const meta = loading ? "Henter kontakter…" : q ? `${visible.length} af ${inBook.length} kontakter` : `${inBook.length} kontakter · A–Å`;

  let body: ReactNode;
  if (loading) {
    body = (
      <>
        <div className="loader" role="status">
          <Icon name="brand" className="sprite" />
          <p className="loader-text">INDLÆSER<span className="loader-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
          <p className="t-data-s t-soft">Henter adressebøger fra {SERVER}</p>
        </div>
        <div className="skeleton" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => <div className="skel-row" key={i}><i /><span><i /><i /></span></div>)}
        </div>
      </>
    );
  } else if (!books.length) {
    body = (
      <div className="empty">
        <Icon name="book" className="sprite" />
        <p className="empty-title">Ingen adressebøger</p>
        <p className="empty-text">Din konto på {SERVER} har ingen adressebøger endnu. Opret den første her, eller synkronisér fra din telefon.</p>
        <button type="button" className="btn" onClick={openCreateBook}><Icon name="plus" /><span className="btn-label">Opret adressebog</span></button>
      </div>
    );
  } else if (!visible.length) {
    body = q ? (
      <div className="empty">
        <Icon name="ghost" className="sprite" />
        <p className="empty-title">Ingen kontakter fundet…</p>
        <p className="empty-text">Prøv en anden søgning. Intet matcher »{q}« i {title}.</p>
        <button type="button" className="btn" onClick={() => { app.set({ query: "" }); document.getElementById("q")?.focus(); }}>
          <Icon name="close" /><span className="btn-label">Ryd søgning</span>
        </button>
      </div>
    ) : (
      <div className="empty">
        <Icon name="chest" className="sprite" />
        <p className="empty-title">Bogen er tom</p>
        <p className="empty-text">Der er ingen kontakter i {title} endnu. Opret en ny kontakt, eller importér en .vcf-fil.</p>
        <button type="button" className="btn" onClick={openImport}><Icon name="import" /><span className="btn-label">Importér .vcf</span></button>
      </div>
    );
  } else {
    const groups: { letter: string; items: StoredContact[] }[] = [];
    for (const c of visible) {
      const L = letterOf(c.data);
      if (groups[groups.length - 1]?.letter !== L) groups.push({ letter: L, items: [] });
      groups[groups.length - 1].items.push(c);
    }
    body = groups.map((g) => (
      <Fragment key={g.letter}>
        <h2 className="letter" id={`letter-${g.letter === "#" ? "x" : g.letter}`}>
          {g.letter}{g.letter === "#" ? <span className="sr-only"> – uden navn</span> : null}
        </h2>
        <ul>
          {g.items.map((c) => (
            <li key={c.id}>
              <a className="row" href={hashFor({ bookId: route.bookId, contactId: c.id, mode: "view" })} aria-current={route.contactId === c.id}>
                <span className="cursor" aria-hidden="true" />
                <Avatar c={c.data} />
                <span className="row-text">
                  <span className={"row-name t-tabular" + (isNameless(c.data) ? " is-nameless" : "")}>{displayName(c.data)}</span>
                  <span className="row-sub">{secondary(c.data)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Fragment>
    ));
  }

  return (
    <section className="panel pane-list" aria-labelledby="list-title">
      <header className="panel-head list-head">
        <button type="button" className="btn btn-icon btn-s only-compact hide-mobile" aria-label="Vis adressebøger"
          aria-expanded={drawer} aria-controls="sidebar" id="drawer-open" onClick={() => setDrawer(true)}>
          <Icon name="menu" />
        </button>
        <h1 className="panel-title" id="list-title">{title}</h1>
      </header>
      <div className="list-tools">
        <div className="search">
          <label className="sr-only" htmlFor="q">Søg i kontakter</label>
          <Icon name="search" />
          <input className="input" id="q" type="search" placeholder="Søg navn, nummer, by…" autoComplete="off" spellCheck={false}
            value={query} onChange={(e) => app.set({ query: e.target.value })} />
        </div>
        <div className="list-meta">
          <span className="t-data-s t-soft" aria-live="polite">{meta}</span>
          <button type="button" className="btn btn-primary hide-mobile" disabled={!books.length}
            onClick={() => go({ bookId: route.bookId, contactId: null, mode: "new" })}>
            <Icon name="plus" /><span className="btn-label">Ny kontakt</span>
          </button>
        </div>
      </div>
      <div className="panel-body" id="list-body" ref={bodyRef}>{body}</div>
    </section>
  );
}

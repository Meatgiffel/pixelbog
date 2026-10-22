/* App-skal: sidebjælke, liste, detaljer, mobil-kabinet og konsol */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../lib/pixel";
import { type StoredContact, app, refresh } from "../state/app";
import { editor, editorActions } from "../state/editor";
import { type Route, go, router } from "../state/router";
import { play } from "../state/settings";
import { useStore } from "../state/store";
import { ui } from "../state/ui";
import { ContactForm } from "./ContactForm";
import { ContactList } from "./ContactList";
import { ContactSheet } from "./ContactSheet";
import { Sidebar } from "./Sidebar";
import { bookName, openDelete } from "./actions";

function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

const editing = (r: Route) => r.mode === "edit" || r.mode === "new";

function DetailPane({ route, contact, loading }: { route: Route; contact: StoredContact | null; loading: boolean }) {
  if (loading) {
    return (
      <>
        <header className="panel-head detail-head"><h2 className="panel-title" id="detail-title" tabIndex={-1}>Karakterark</h2></header>
        <div className="panel-body detail-body" id="detail-body">
          <div className="empty" role="status">
            <Icon name="book" className="sprite" />
            <p className="empty-title">INDLÆSER<span className="loader-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
          </div>
        </div>
      </>
    );
  }
  if (editing(route) && (route.mode === "new" || contact)) {
    return <ContactForm key={`${route.mode}:${contact?.id ?? ""}`} route={route} contact={route.mode === "new" ? null : contact} />;
  }
  if (!contact) {
    return (
      <>
        <header className="panel-head detail-head"><h2 className="panel-title" id="detail-title" tabIndex={-1}>Karakterark</h2></header>
        <div className="panel-body detail-body" id="detail-body">
          <div className="empty">
            <Icon name="brand" className="sprite" />
            <p className="empty-title">Ingen kontakt valgt</p>
            <p className="empty-text">Vælg en kontakt i listen for at se karakterarket. Brug ↑ og ↓ for at bladre.</p>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <header className="panel-head detail-head">
        <h2 className="panel-title" id="detail-title" tabIndex={-1}>Karakterark</h2>
        <div className="btn-row hide-mobile">
          <button type="button" className="btn btn-s" onClick={() => go({ ...route, mode: "edit" })}><Icon name="edit" /><span className="btn-label">Rediger</span></button>
          <button type="button" className="btn btn-s btn-danger" onClick={() => openDelete(contact)}><Icon name="trash" /><span className="btn-label">Slet</span></button>
        </div>
      </header>
      <div className="panel-body detail-body" id="detail-body">
        <ContactSheet contact={contact} routeBook={route.bookId} />
      </div>
    </>
  );
}

function Console({ route, contact, loading, books, openDrawer }: {
  route: Route; contact: StoredContact | null; loading: boolean; books: number; openDrawer: () => void;
}) {
  const btn = (key: string, icon: IconName, label: string, onClick: () => void, cls = "", disabled = false) => (
    <button key={key} type="button" className={`btn ${cls}`.trim()} id={`c-${key}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} /><span className="btn-label">{label}</span>
    </button>
  );
  let buttons;
  if (loading) buttons = [btn("drawer-open", "menu", "Bøger", openDrawer)];
  else if (editing(route) && (route.mode === "new" || contact)) {
    buttons = [btn("cancel", "close", "Annuller", () => editorActions.cancel()), btn("save", "check", "Gem", () => editorActions.save(), "btn-primary")];
  } else if (contact) {
    buttons = [
      btn("back", "back", "Tilbage", () => go({ bookId: route.bookId, contactId: null, mode: null })),
      btn("edit", "edit", "Rediger", () => go({ ...route, mode: "edit" })),
      btn("delete", "trash", "Slet", () => openDelete(contact), "btn-danger"),
    ];
  } else {
    buttons = [btn("drawer-open", "book", "Bøger", openDrawer), btn("new", "plus", "Ny", () => go({ bookId: route.bookId, contactId: null, mode: "new" }), "btn-primary", !books)];
  }
  return <nav className="console" id="console" aria-label="Handlinger">{buttons}</nav>;
}

export function Shell() {
  const phase = useStore(app, (s) => s.phase);
  const books = useStore(app, (s) => s.books);
  const contacts = useStore(app, (s) => s.contacts);
  const raw = useStore(router, (s) => s.route);
  const dirty = useStore(editor, (s) => s.dirty);
  const loading = phase === "loading";
  const compact = useMedia("(max-width: 1279px)");
  const mobile = useMedia("(max-width: 767px)");
  const [drawer, setDrawerState] = useState(false);
  const listBody = useRef<HTMLDivElement | null>(null);
  const listScroll = useRef(0);

  // Ukendte bøger og kontakter (fx slettet på en anden enhed) falder tilbage til listen
  const route = useMemo<Route>(() => {
    if (loading) return raw;
    const bookId = raw.bookId === "alle" || books.some((b) => b.id === raw.bookId) ? raw.bookId : "alle";
    if (raw.contactId && !contacts[raw.contactId]) return { bookId, contactId: null, mode: null };
    return { ...raw, bookId };
  }, [raw, books, contacts, loading]);
  const contact = route.contactId ? contacts[route.contactId] ?? null : null;
  const pane = route.contactId || route.mode === "new" ? "detail" : "list";

  function setDrawer(open: boolean) {
    setDrawerState(open);
    requestAnimationFrame(() => {
      if (open) document.querySelector<HTMLElement>(".menu-item[aria-current='true']")?.focus();
      else document.getElementById(mobile ? "c-drawer-open" : "drawer-open")?.focus();
    });
  }

  useEffect(() => { if (!compact) setDrawerState(false); }, [compact]);

  // Ny rute: luk skuffen og flyt fokus som i designet (mobil: titel eller den valgte række)
  const prevPane = useRef(pane);
  useEffect(() => {
    setDrawerState(false);
    const wasList = prevPane.current === "list";
    prevPane.current = pane;
    if (!mobile || editing(route)) return;
    if (route.contactId) {
      document.getElementById("detail-title")?.focus({ preventScroll: true });
      const b = document.getElementById("detail-body");
      if (b) b.scrollTop = 0;
    } else if (!wasList) {
      requestAnimationFrame(() => {
        if (listBody.current) listBody.current.scrollTop = listScroll.current;
        (document.querySelector<HTMLElement>('.row[aria-current="true"]') ?? document.querySelector<HTMLElement>(".row"))?.focus({ preventScroll: true });
      });
    }
  }, [route.bookId, route.contactId, route.mode]);

  // Husk listens scroll, så mobilens "Tilbage" lander samme sted
  useEffect(() => {
    const el = listBody.current;
    if (!el) return;
    const on = () => { listScroll.current = el.scrollTop; };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [loading]);

  // Tastatur: / søger, ↑/↓ bladrer i rækker, menuer og valg, Escape lukker skuffen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const dialogOpen = !!ui.get().dialog;
      if (e.key === "Escape" && drawer) { setDrawer(false); return; }
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !dialogOpen) {
        e.preventDefault();
        document.getElementById("q")?.focus();
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && t.matches(".row, .choice, .menu-item")) {
        const sel = t.matches(".row") ? ".row" : t.matches(".choice") ? ".choice" : ".menu-item";
        const scope = t.closest(".panel-body, .choices, .menu") ?? document;
        const all = Array.from(scope.querySelectorAll<HTMLElement>(sel));
        const n = all[(all.indexOf(t) + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length];
        if (n) { e.preventDefault(); n.focus(); play("select"); }
      }
      if (e.key === "ArrowDown" && t.id === "q") {
        const r = document.querySelector<HTMLElement>(".row");
        if (r) { e.preventDefault(); r.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Hent ændringer fra andre enheder, når fanen får fokus igen
  useEffect(() => {
    let last = Date.now();
    const on = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      void refresh().catch(() => {});
    };
    window.addEventListener("focus", on);
    document.addEventListener("visibilitychange", on);
    return () => { window.removeEventListener("focus", on); document.removeEventListener("visibilitychange", on); };
  }, []);

  return (
    <div className={"app" + (drawer ? " drawer-open" : "")} id="app" data-pane={pane}>
      <header className="m-bezel">
        <Icon name="brand" className="brand-mark ic-m" />
        <span className="brand-name">PIXELBOG</span>
        <span className="led" aria-hidden="true" />
        <span className="bezel-text">{editing(route) && dirty ? "★ Ikke gemt" : bookName(route.bookId)}</span>
      </header>
      <Sidebar bookId={route.bookId} drawer={drawer} compact={compact} setDrawer={setDrawer} />
      <ContactList route={route} loading={loading} drawer={drawer} setDrawer={setDrawer} bodyRef={(el) => { listBody.current = el; }} />
      <section className="panel pane-detail" aria-labelledby="detail-title">
        <DetailPane route={route} contact={contact} loading={loading} />
      </section>
      <Console route={route} contact={contact} loading={loading} books={books.length} openDrawer={() => setDrawer(true)} />
      <div className="scrim" hidden={!(drawer && compact)} onClick={() => setDrawer(false)} />
    </div>
  );
}

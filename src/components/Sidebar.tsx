/* Sidebjælke: adressebøger, import/eksport og brugermenu */
import { useState } from "react";
import { Icon, Identicon, sfx } from "../lib/pixel";
import { SERVER, app, logout } from "../state/app";
import { hashFor } from "../state/router";
import { type Settings, settings, updateSettings } from "../state/settings";
import { useStore } from "../state/store";
import { toast } from "../state/ui";
import { doExport } from "./actions";
import { openImport } from "./ImportDialog";

interface Props {
  bookId: string;
  drawer: boolean;
  compact: boolean;
  setDrawer: (open: boolean) => void;
}

function Switch({ k, label }: { k: "scan" | "motion" | "sound"; label: string }) {
  const on = useStore(settings, (s) => s[k]);
  return (
    <button type="button" className="switch" role="switch" aria-checked={on}
      onClick={() => { updateSettings({ [k]: !on } as Partial<Settings>); if (k === "sound" && !on) sfx("select"); }}>
      <span className="t-data">{label}</span>
      <span className="switch-track" aria-hidden="true"><span className="switch-off">Fra</span><span className="switch-on">Til</span></span>
    </button>
  );
}

export function Sidebar({ bookId, drawer, compact, setDrawer }: Props) {
  const books = useStore(app, (s) => s.books);
  const contacts = useStore(app, (s) => s.contacts);
  const user = useStore(app, (s) => s.user);
  const theme = useStore(settings, (s) => s.theme);
  const [menu, setMenu] = useState(false);

  const counts: Record<string, number> = { alle: 0 };
  for (const c of Object.values(contacts)) {
    counts.alle++;
    counts[c.bookId] = (counts[c.bookId] ?? 0) + 1;
  }
  const items = [{ id: "alle", name: "Alle kontakter" }, ...books];

  return (
    <aside className="panel sidebar" id="sidebar" aria-label="Adressebøger og konto" inert={compact && !drawer}>
      <header className="panel-head">
        <div className="brand"><Icon name="brand" className="brand-mark ic-m" /><span className="brand-name">PIXELBOG</span></div>
        <span className="od-fill" />
        <button type="button" className="btn btn-icon btn-s drawer-close" aria-label="Luk menu" onClick={() => setDrawer(false)}><Icon name="close" /></button>
      </header>
      <div className="panel-body">
        <p className="menu-label t-ui" id="books-label">Adressebøger</p>
        <nav aria-labelledby="books-label">
          <ul className="menu">
            {items.map((b) => {
              const n = counts[b.id] ?? 0;
              const href = hashFor({ bookId: b.id, contactId: null, mode: null });
              return (
                <li key={b.id}>
                  <a className="menu-item" href={href} aria-current={bookId === b.id}
                    onClick={() => { if (drawer && location.hash === href) setDrawer(false); }}>
                    <span className="label-text">{b.name}</span><span className="count" aria-label={`${n} kontakter`}>{n}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="side-actions">
          <button type="button" className="btn" onClick={() => { setDrawer(false); openImport(); }}><Icon name="import" /><span className="btn-label">Importér .vcf</span></button>
          <button type="button" className="btn" onClick={() => doExport(bookId)}><Icon name="export" /><span className="btn-label">Eksportér</span></button>
        </div>
      </div>
      <footer className="panel-foot">
        {menu ? (
          <div className="usermenu" id="usermenu">
            <div className="field">
              <span className="label" id="theme-label">Tema</span>
              <div className="segmented" role="group" aria-labelledby="theme-label">
                {([["light", "Lys"], ["dark", "Mørk"], ["system", "Auto"]] as const).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={theme === v} onClick={() => updateSettings({ theme: v })}>{label}</button>
                ))}
              </div>
            </div>
            <Switch k="scan" label="CRT-scanlines (mørk)" />
            <Switch k="motion" label="Animationer" />
            <Switch k="sound" label="8-bit-lyde" />
            <button type="button" className="btn btn-block" onClick={() => { logout(); toast("Logget ud", "Vi ses! Dine kontakter ligger trygt på serveren.", "logout"); }}>
              <Icon name="logout" /><span className="btn-label">Log ud</span>
            </button>
          </div>
        ) : null}
        <button type="button" className="usermenu-btn" aria-expanded={menu} aria-controls="usermenu" onClick={() => setMenu(!menu)}>
          <span className="avatar" aria-hidden="true"><Identicon seed={user || "bruger"} /></span>
          <span className="who"><span className="t-ui">{user}</span><span className="t-data-s t-soft">{SERVER}</span></span>
          <span aria-hidden="true" style={{ transform: `rotate(${menu ? 90 : -90}deg)` }}><Icon name="chevron" className="ic-s" /></span>
          <span className="sr-only">Indstillinger og log ud</span>
        </button>
      </footer>
    </aside>
  );
}

/* ==========================================================================
   PIXELBOG — app
   Vanilla SPA med hash-routing og data i hukommelsen (ingen rigtig server).
   Demo-tilstande til skærmoversigten styres via ?demo=…&theme=…
   ========================================================================== */
(function () {
  "use strict";

  const { icon, identicon, questionBlock, esc, sfx, typewriter, parseVcf, toVcf, quantizePhoto } = window.Pixel;
  const D = window.PixelData;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- URL-parametre (kun til demo/oversigt) ---------- */
  const params = new URLSearchParams(location.search);
  const DEMO = params.get("demo");
  const IS_DEMO = !!DEMO || params.has("theme");

  /* ---------- Indstillinger ---------- */
  const SETTINGS_KEY = "pixelbog.settings.v1";
  const settings = Object.assign({ theme: "system", scan: true, motion: true, sound: false }, IS_DEMO ? {} : safeLoad());
  if (params.get("theme")) settings.theme = params.get("theme");
  if (IS_DEMO) settings.scan = params.get("fx") === "scan";
  function safeLoad() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } }
  function saveSettings() { if (!IS_DEMO) try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* privat tilstand */ } }
  const mqDark = window.matchMedia("(prefers-color-scheme: dark)");
  const mqMobile = window.matchMedia("(max-width: 767px)");
  const mqCompact = window.matchMedia("(max-width: 1023px)");
  function resolvedTheme() { return settings.theme === "system" ? (mqDark.matches ? "dark" : "light") : settings.theme; }
  function applySettings() {
    const html = document.documentElement;
    const theme = resolvedTheme();
    html.dataset.theme = theme;
    html.classList.toggle("fx-scan", settings.scan && theme === "dark");
    html.classList.toggle("fx-still", !settings.motion);
  }
  mqDark.addEventListener("change", () => { applySettings(); });
  applySettings();
  function play(name) { if (settings.sound) sfx(name); }

  /* ---------- Tilstand ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S = {
    authed: false, user: "", loading: false,
    loginError: null, loginBusy: false, loginUser: "", loginFieldErrors: {},
    contacts: clone(D.CONTACTS),
    bookId: "alle", contactId: null, mode: null,
    query: "",
    draft: null, dirty: false, errors: {}, moreNames: false,
    drawer: false, usermenu: false,
    listScroll: 0,
    imp: null,
  };

  /* ---------- Hjælpere til kontakter ---------- */
  const collator = new Intl.Collator("da", { sensitivity: "base", numeric: true });
  const dateFmt = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric" });
  const TYPE_LABEL = { mobil: "Mobil", hjem: "Hjem", arbejde: "Arbejde", andet: "Andet" };
  const URL_LABEL = { hjem: "Personlig", arbejde: "Arbejde", andet: "Andet" };
  const TYPE_OPTIONS = {
    phones: ["mobil", "hjem", "arbejde", "andet"],
    emails: ["hjem", "arbejde", "andet"],
    addresses: ["hjem", "arbejde", "andet"],
    urls: ["hjem", "arbejde", "andet"],
  };
  const typeLabel = (list, t) => (list === "urls" ? URL_LABEL[t] : TYPE_LABEL[t]) || "Andet";

  const personName = (c) => [c.prefix, c.given, c.middle, c.family, c.suffix].filter(Boolean).join(" ");
  const isNameless = (c) => !personName(c) && !c.org;
  function displayName(c) {
    return personName(c) || c.org || (c.phones[0] && c.phones[0].value) || (c.emails[0] && c.emails[0].value) || "Ukendt kontakt";
  }
  function secondary(c) {
    if (isNameless(c)) return "Intet navn – tilføj et";
    if (personName(c)) return c.org || (c.phones[0] && c.phones[0].value) || (c.emails[0] && c.emails[0].value) || "Ingen detaljer endnu";
    return (c.phones[0] && c.phones[0].value) || (c.emails[0] && c.emails[0].value) || "Firma";
  }
  const bookName = (id) => (id === "alle" ? "Alle kontakter" : (D.BOOKS.find((b) => b.id === id) || {}).name || "Ukendt bog");
  const getContact = (id) => S.contacts.find((c) => c.id === id) || null;
  const inBook = (c, id = S.bookId) => id === "alle" || c.book === id;
  const countIn = (id) => S.contacts.filter((c) => inBook(c, id)).length;
  function letterOf(c) {
    if (isNameless(c)) return "#";
    const ch = displayName(c).charAt(0).toLocaleUpperCase("da");
    return /[A-ZÆØÅ]/.test(ch) ? ch : "#";
  }
  function sortContacts(list) {
    return list.slice().sort((a, b) => {
      const na = isNameless(a), nb = isNameless(b);
      if (na !== nb) return na ? 1 : -1;
      return collator.compare(displayName(a), displayName(b));
    });
  }
  function matches(c, q) {
    if (!q) return true;
    const hay = [displayName(c), c.nickname, c.org, c.title, ...c.emails.map((e) => e.value), ...c.addresses.map((a) => `${a.street} ${a.postal} ${a.city}`)].join(" ").toLocaleLowerCase("da");
    const digits = c.phones.map((p) => p.value.replace(/\D/g, "")).join(" ");
    return q.toLocaleLowerCase("da").split(/\s+/).filter(Boolean).every((t) => hay.includes(t) || (/\d/.test(t) && digits.includes(t.replace(/\D/g, ""))));
  }
  const telHref = (v) => "tel:" + v.replace(/[^\d+]/g, "");
  const prettyUrl = (u) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
  function bdayInfo(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), mo, d);
    if (next < today) next = new Date(today.getFullYear() + 1, mo, d);
    const days = Math.round((next - today) / 864e5);
    const turning = next.getFullYear() - y;
    const age = days === 0 ? turning : turning - 1;
    return { date: dateFmt.format(new Date(y, mo, d)), days, turning, age };
  }
  function avatar(c, size = "s", decorative = true) {
    const cls = size === "s" ? "avatar" : `avatar avatar-${size}`;
    const hidden = decorative ? ' aria-hidden="true"' : "";
    const name = displayName(c);
    if (c.photo) {
      const alt = decorative ? "" : `Foto af ${esc(name)}`;
      return `<span class="${cls}"${hidden}><img class="photo-light" src="${esc(c.photo.light)}" width="40" height="40" alt="${alt}"><img class="photo-dark" src="${esc(c.photo.dark)}" width="40" height="40" alt="${alt}"></span>`;
    }
    if (isNameless(c)) return `<span class="${cls}"${hidden}>${questionBlock("Kontakt uden navn")}</span>`;
    return `<span class="${cls}"${hidden}>${identicon(name, "Pixel-avatar for " + name)}</span>`;
  }

  /* ---------- Routing ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (h[0] !== "bog") return { bookId: "alle", contactId: null, mode: null };
    const bookId = h[1] && (h[1] === "alle" || D.BOOKS.some((b) => b.id === h[1])) ? h[1] : "alle";
    if (h[2] === "ny") return { bookId, contactId: null, mode: "new" };
    if (h[2]) return { bookId, contactId: h[2], mode: h[3] === "rediger" ? "edit" : "view" };
    return { bookId, contactId: null, mode: null };
  }
  function hashFor(r) {
    let s = "#/bog/" + r.bookId;
    if (r.mode === "new") s += "/ny";
    else if (r.contactId) { s += "/" + r.contactId; if (r.mode === "edit") s += "/rediger"; }
    return s;
  }
  const currentRoute = () => ({ bookId: S.bookId, contactId: S.contactId, mode: S.mode });
  const editing = () => S.mode === "edit" || S.mode === "new";

  function go(r) {
    const h = hashFor(r);
    if (location.hash === h) applyRoute(r);
    else location.hash = h;
  }
  function onHashChange() {
    if (!S.authed) return;
    const next = parseHash();
    const cur = currentRoute();
    if (hashFor(next) === hashFor(cur)) return;
    if (editing() && S.dirty) {
      history.replaceState(null, "", hashFor(cur));
      confirmDiscard(() => { S.dirty = false; go(next); });
      return;
    }
    applyRoute(next);
  }
  function applyRoute(r) {
    const wasList = !(S.contactId || S.mode === "new");
    const listBody = $("#list-body");
    if (wasList && listBody) S.listScroll = listBody.scrollTop;
    S.bookId = r.bookId;
    S.mode = r.mode;
    S.contactId = r.contactId;
    let c = S.contactId ? getContact(S.contactId) : null;
    if (S.contactId && !c) { S.contactId = null; S.mode = null; }
    S.errors = {};
    S.dirty = false;
    if (S.mode === "edit" && c) {
      S.draft = clone(c);
      S.moreNames = !!(c.prefix || c.middle || c.suffix);
    } else if (S.mode === "new") {
      S.draft = blankContact(S.bookId === "alle" ? "personlige" : S.bookId);
      S.moreNames = false;
    } else {
      S.draft = null;
    }
    if (S.drawer) setDrawer(false, false);
    render();
    afterRouteFocus(wasList);
  }
  function afterRouteFocus(wasList) {
    if (S.mode === "edit" || S.mode === "new") {
      const first = $(S.mode === "new" ? "#f-book" : "#f-given");
      if (first && !IS_DEMO) first.focus({ preventScroll: true });
      return;
    }
    if (mqMobile.matches) {
      if (S.contactId) { const t = $("#detail-title"); t && t.focus({ preventScroll: true }); $("#detail-body").scrollTop = 0; }
      else if (!wasList) {
        const lb = $("#list-body"); if (lb) lb.scrollTop = S.listScroll;
        const row = $(`.row[aria-current="true"]`) || $(".row"); row && row.focus({ preventScroll: true });
      }
    }
  }
  function blankContact(book) {
    return { id: "", book, prefix: "", given: "", middle: "", family: "", suffix: "", nickname: "", title: "", org: "", photo: null,
      phones: [{ type: "mobil", value: "" }], emails: [{ type: "hjem", value: "" }], addresses: [], urls: [], birthday: "", note: "" };
  }

  /* ==========================================================================
     Render: login
     ========================================================================== */
  function renderLogin() {
    const root = $("#root");
    const err = S.loginError;
    const fe = S.loginFieldErrors;
    const alert = err === "auth"
      ? `<div class="alert" role="alert">${icon("alert")}<div><strong>Forkert brugernavn eller kodeord</strong><p>Tjek at Caps Lock er slået fra, og prøv igen.</p></div></div>`
      : err === "server"
        ? `<div class="alert" role="alert">${icon("plug")}<div><strong>Kan ikke forbinde til serveren</strong><p>${esc(D.SERVER)} svarer ikke. Tjek din forbindelse, eller om Radicale kører.</p></div></div>`
        : "";
    root.innerHTML = `
      <main class="title-screen">
        <div class="title-card">
          <div class="title-logo">
            ${icon("brand", "brand-mark")}
            <h1>PIXELBOG</h1>
            <p class="title-sub">Kontakter · CardDAV</p>
          </div>
          <p class="title-sub blink" aria-hidden="true">— Tryk start —</p>
          <form class="title-form panel" id="login-form" novalidate aria-labelledby="login-title">
            <h2 class="sr-only" id="login-title">Log ind</h2>
            ${alert}
            <div class="field">
              <label class="label" for="l-user">Brugernavn</label>
              <input class="input" id="l-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(S.loginUser)}" ${fe.user ? 'aria-invalid="true" aria-describedby="l-user-err"' : err === "auth" ? 'aria-invalid="true"' : ""}>
              ${fe.user ? `<p class="error-text" id="l-user-err">${icon("alert")}<span>Skriv dit brugernavn.</span></p>` : ""}
            </div>
            <div class="field">
              <label class="label" for="l-pass">Kodeord</label>
              <input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" ${fe.pass ? 'aria-invalid="true" aria-describedby="l-pass-err"' : err === "auth" ? 'aria-invalid="true"' : ""}>
              ${fe.pass ? `<p class="error-text" id="l-pass-err">${icon("alert")}<span>Skriv dit kodeord.</span></p>` : ""}
            </div>
            <button class="btn btn-primary btn-block btn-start ${S.loginBusy ? "is-loading" : ""}" type="submit" ${S.loginBusy ? 'aria-disabled="true"' : ""}>
              <span class="btn-label">${S.loginBusy ? "Forbinder" : err === "server" ? "Prøv igen" : "Log ind"}</span>
            </button>
          </form>
          <div class="title-foot t-soft">
            <span>Server: ${esc(D.SERVER)}</span>
            <span>© 2026 · Version 1.0</span>
          </div>
        </div>
      </main>`;
    const target = err === "auth" || fe.pass ? "#l-pass" : (fe.user || !S.loginUser ? "#l-user" : "#l-pass");
    if (!IS_DEMO) { const el = $(target); el && el.focus(); }
  }

  function submitLogin(form) {
    const user = form.username.value.trim();
    const pass = form.password.value;
    S.loginUser = user;
    S.loginFieldErrors = { user: !user, pass: !pass };
    S.loginError = null;
    if (!user || !pass) { play("error"); renderLogin(); return; }
    S.loginBusy = true;
    renderLogin();
    setTimeout(() => {
      S.loginBusy = false;
      if (user.toLowerCase() === "offline") { S.loginError = "server"; play("error"); renderLogin(); return; }
      if (pass === "forkert") { S.loginError = "auth"; play("error"); renderLogin(); return; }
      S.authed = true; S.user = user; S.loading = true;
      mountShell();
      const r = parseHash();
      S.bookId = r.bookId;
      render();
      setTimeout(() => { S.loading = false; applyRoute(parseHash()); play("select"); }, 1100);
    }, 700);
  }

  /* ==========================================================================
     Render: app-skal
     ========================================================================== */
  function mountShell() {
    $("#root").innerHTML = `
      <div class="app" id="app" data-pane="list">
        <header class="m-bezel">
          ${icon("brand", "brand-mark ic-m")}
          <span class="brand-name">PIXELBOG</span>
          <span class="led" aria-hidden="true"></span>
          <span class="bezel-text" id="bezel-text"></span>
        </header>
        <aside class="panel sidebar" id="sidebar" aria-label="Adressebøger og konto"></aside>
        <section class="panel pane-list" aria-labelledby="list-title">
          <header class="panel-head list-head" id="list-head"></header>
          <div class="list-tools">
            <div class="search">
              <label class="sr-only" for="q">Søg i kontakter</label>
              ${icon("search")}
              <input class="input" id="q" type="search" placeholder="Søg navn, nummer, by…" autocomplete="off" spellcheck="false" data-fk="search">
            </div>
            <div class="list-meta" id="list-meta"></div>
          </div>
          <div class="panel-body" id="list-body"></div>
        </section>
        <section class="panel pane-detail" aria-labelledby="detail-title">
          <header class="panel-head detail-head" id="detail-head"></header>
          <div class="panel-body detail-body" id="detail-body"></div>
          <footer class="panel-foot hide-mobile" id="detail-foot" hidden></footer>
        </section>
        <nav class="console" id="console" aria-label="Handlinger"></nav>
        <div class="scrim" id="scrim" data-act="drawer-close" hidden></div>
      </div>`;
    $("#q").value = S.query;
  }

  function keepFocus(fn) {
    const a = document.activeElement;
    const key = !a || a === document.body ? null : a.dataset && a.dataset.fk ? `[data-fk="${CSS.escape(a.dataset.fk)}"]` : a.id ? "#" + CSS.escape(a.id) : null;
    fn();
    if (key) {
      const el = document.querySelector(key);
      if (el && el !== document.activeElement) el.focus({ preventScroll: true });
    }
  }

  function render() {
    applySettings();
    if (!S.authed) { renderLogin(); return; }
    if (!$("#app")) mountShell();
    keepFocus(() => {
      $("#app").dataset.pane = S.contactId || S.mode === "new" ? "detail" : "list";
      renderSidebar();
      renderListHead();
      renderList();
      renderDetail();
      renderConsole();
    });
  }

  /* ---------- Sidebjælke ---------- */
  function renderSidebar() {
    const books = [{ id: "alle", name: "Alle kontakter" }, ...D.BOOKS];
    const items = books.map((b) => `
      <li><a class="menu-item" href="#/bog/${b.id}" data-fk="book-${b.id}" aria-current="${S.bookId === b.id}">
        <span class="label-text">${esc(b.name)}</span><span class="count" aria-label="${countIn(b.id)} kontakter">${countIn(b.id)}</span>
      </a></li>`).join("");
    const t = settings.theme;
    const sw = (k, label) => `<button type="button" class="switch" role="switch" aria-checked="${!!settings[k]}" data-act="toggle" data-k="${k}" data-fk="sw-${k}">
        <span class="t-data">${label}</span><span class="switch-track" aria-hidden="true"><span class="switch-off">Fra</span><span class="switch-on">Til</span></span></button>`;
    const menu = S.usermenu ? `
      <div class="usermenu" id="usermenu">
        <div class="field">
          <span class="label" id="theme-label">Tema</span>
          <div class="segmented" role="group" aria-labelledby="theme-label">
            <button type="button" data-act="theme" data-v="light" aria-pressed="${t === "light"}" data-fk="th-light">Lys</button>
            <button type="button" data-act="theme" data-v="dark" aria-pressed="${t === "dark"}" data-fk="th-dark">Mørk</button>
            <button type="button" data-act="theme" data-v="system" aria-pressed="${t === "system"}" data-fk="th-system">Auto</button>
          </div>
        </div>
        ${sw("scan", "CRT-scanlines (mørk)")}
        ${sw("motion", "Animationer")}
        ${sw("sound", "8-bit-lyde")}
        <button type="button" class="btn btn-block" data-act="logout" data-fk="logout">${icon("logout")}<span class="btn-label">Log ud</span></button>
      </div>` : "";
    $("#sidebar").innerHTML = `
      <header class="panel-head">
        <div class="brand">${icon("brand", "brand-mark ic-m")}<span class="brand-name">PIXELBOG</span></div>
        <span class="od-fill"></span>
        <button type="button" class="btn btn-icon btn-s drawer-close" data-act="drawer-close" aria-label="Luk menu" data-fk="drawer-close">${icon("close")}</button>
      </header>
      <div class="panel-body">
        <p class="menu-label t-ui" id="books-label">Adressebøger</p>
        <nav aria-labelledby="books-label"><ul class="menu">${items}</ul></nav>
        <div class="side-actions">
          <button type="button" class="btn" data-act="import" data-fk="import">${icon("import")}<span class="btn-label">Importér .vcf</span></button>
          <button type="button" class="btn" data-act="export" data-fk="export">${icon("export")}<span class="btn-label">Eksportér</span></button>
        </div>
      </div>
      <footer class="panel-foot">
        ${menu}
        <button type="button" class="usermenu-btn" data-act="usermenu" aria-expanded="${S.usermenu}" aria-controls="usermenu" data-fk="usermenu">
          <span class="avatar" aria-hidden="true">${identicon(S.user || "bruger")}</span>
          <span class="who"><span class="t-ui">${esc(S.user)}</span><span class="t-data-s t-soft">${esc(D.SERVER)}</span></span>
          <span aria-hidden="true" style="transform: rotate(${S.usermenu ? 90 : -90}deg)">${icon("chevron", "ic-s")}</span>
          <span class="sr-only">Indstillinger og log ud</span>
        </button>
      </footer>`;
    $("#scrim").hidden = !(S.drawer && mqCompact.matches);
    $("#app").classList.toggle("drawer-open", S.drawer);
    $("#sidebar").toggleAttribute("inert", mqCompact.matches && !S.drawer);
  }

  /* ---------- Liste ---------- */
  function visibleContacts() {
    return sortContacts(S.contacts.filter((c) => inBook(c) && matches(c, S.query.trim())));
  }
  function renderListHead() {
    $("#list-head").innerHTML = `
      <button type="button" class="btn btn-icon btn-s only-compact hide-mobile" data-act="drawer-open" aria-label="Vis adressebøger" aria-expanded="${S.drawer}" aria-controls="sidebar" data-fk="drawer-open">${icon("menu")}</button>
      <h1 class="panel-title" id="list-title">${esc(bookName(S.bookId))}</h1>`;
    const n = S.loading ? null : visibleContacts().length;
    const total = countIn(S.bookId);
    const meta = S.loading ? "Henter kontakter…" : S.query.trim() ? `${n} af ${total} kontakter` : `${total} kontakter · A–Å`;
    $("#list-meta").innerHTML = `
      <span class="t-data-s t-soft" aria-live="polite">${meta}</span>
      <button type="button" class="btn btn-primary hide-mobile" data-act="new" data-fk="new">${icon("plus")}<span class="btn-label">Ny kontakt</span></button>`;
    $("#bezel-text").textContent = editing() && S.dirty ? "★ Ikke gemt" : bookName(S.bookId);
  }
  function renderList() {
    const body = $("#list-body");
    if (S.loading) {
      body.innerHTML = `
        <div class="loader" role="status">
          ${icon("brand", "sprite")}
          <p class="loader-text">INDLÆSER<span class="loader-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
          <p class="t-data-s t-soft">Henter adressebøger fra ${esc(D.SERVER)}</p>
        </div>
        <div class="skeleton" aria-hidden="true">${'<div class="skel-row"><i></i><span><i></i><i></i></span></div>'.repeat(5)}</div>`;
      return;
    }
    const list = visibleContacts();
    if (!list.length) {
      if (S.query.trim()) {
        body.innerHTML = `
          <div class="empty">
            ${icon("ghost", "sprite")}
            <p class="empty-title">Ingen kontakter fundet…</p>
            <p class="empty-text">Prøv en anden søgning. Intet matcher »${esc(S.query.trim())}« i ${esc(bookName(S.bookId))}.</p>
            <button type="button" class="btn" data-act="clear-search" data-fk="clear-search">${icon("close")}<span class="btn-label">Ryd søgning</span></button>
          </div>`;
      } else {
        body.innerHTML = `
          <div class="empty">
            ${icon("chest", "sprite")}
            <p class="empty-title">Bogen er tom</p>
            <p class="empty-text">Der er ingen kontakter i ${esc(bookName(S.bookId))} endnu. Opret en ny kontakt, eller importér en .vcf-fil.</p>
            <button type="button" class="btn" data-act="import" data-fk="empty-import">${icon("import")}<span class="btn-label">Importér .vcf</span></button>
          </div>`;
      }
      return;
    }
    let html = "", cur = null;
    for (const c of list) {
      const L = letterOf(c);
      if (L !== cur) {
        if (cur !== null) html += "</ul>";
        html += `<h2 class="letter" id="letter-${L === "#" ? "x" : L}">${L === "#" ? "#" : L}<span class="sr-only">${L === "#" ? " – uden navn" : ""}</span></h2><ul>`;
        cur = L;
      }
      const nameless = isNameless(c);
      html += `<li><a class="row" href="${hashFor({ bookId: S.bookId, contactId: c.id, mode: "view" })}" data-fk="row-${c.id}" aria-current="${S.contactId === c.id}">
        <span class="cursor" aria-hidden="true"></span>
        ${avatar(c)}
        <span class="row-text">
          <span class="row-name t-tabular${nameless ? " is-nameless" : ""}">${esc(displayName(c))}</span>
          <span class="row-sub">${esc(secondary(c))}</span>
        </span>
      </a></li>`;
    }
    body.innerHTML = html + "</ul>";
  }

  /* ---------- Detaljer ---------- */
  function renderDetail() {
    const head = $("#detail-head"), body = $("#detail-body"), foot = $("#detail-foot");
    body.classList.toggle("is-form", editing());
    if (S.loading) {
      head.innerHTML = `<h2 class="panel-title" id="detail-title" tabindex="-1">Karakterark</h2>`;
      body.innerHTML = `<div class="empty" role="status">${icon("book", "sprite")}<p class="empty-title">INDLÆSER<span class="loader-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p></div>`;
      foot.hidden = true;
      return;
    }
    if (editing()) { renderForm(head, body, foot); return; }
    foot.hidden = true;
    const c = S.contactId ? getContact(S.contactId) : null;
    if (!c) {
      head.innerHTML = `<h2 class="panel-title" id="detail-title" tabindex="-1">Karakterark</h2>`;
      body.innerHTML = `
        <div class="empty">
          ${icon("brand", "sprite")}
          <p class="empty-title">Ingen kontakt valgt</p>
          <p class="empty-text">Vælg en kontakt i listen for at se karakterarket. Brug ↑ og ↓ for at bladre.</p>
        </div>`;
      return;
    }
    head.innerHTML = `
      <h2 class="panel-title" id="detail-title" tabindex="-1">Karakterark</h2>
      <div class="btn-row hide-mobile">
        <button type="button" class="btn btn-s" data-act="edit" data-fk="edit">${icon("edit")}<span class="btn-label">Rediger</span></button>
        <button type="button" class="btn btn-s btn-danger" data-act="delete" data-fk="delete">${icon("trash")}<span class="btn-label">Slet</span></button>
      </div>`;
    body.innerHTML = sheetHtml(c);
  }

  function sheetHtml(c) {
    const nameless = isNameless(c);
    const b = bdayInfo(c.birthday);
    const role = [c.title, personName(c) ? c.org : ""].filter(Boolean).join(" · ");
    const stats = [`<div class="stat"><span class="stat-k">Bog</span><span class="stat-v">${esc(bookName(c.book))}</span></div>`];
    if (b) {
      stats.push(`<div class="stat"><span class="stat-k">Alder</span><span class="stat-v">${b.age} år</span></div>`);
      stats.push(`<div class="stat"><span class="stat-k">Fødselsdag</span><span class="stat-v">${b.days === 0 ? "I dag!" : b.days === 1 ? "I morgen" : `Om ${b.days} dage`}</span></div>`);
    }
    const kv = (list, fmt) => `<dl class="kv">${list.map((it) => `<dt><span class="tag">${esc(typeLabel(fmt, it.type))}</span></dt><dd>${valueHtml(fmt, it)}</dd>`).join("")}</dl>`;
    const block = (ic, title, inner, wide) => `<section class="block${wide ? " block-wide" : ""}"><h3 class="block-title">${icon(ic)}${title}</h3>${inner}</section>`;
    const blocks = [];
    if (c.phones.length) blocks.push(block("phone", "Telefoner", kv(c.phones, "phones")));
    if (c.emails.length) blocks.push(block("mail", "E-mails", kv(c.emails, "emails")));
    if (c.addresses.length) blocks.push(block("home", "Adresser", kv(c.addresses, "addresses")));
    if (c.urls.length) blocks.push(block("globe", "Websider", kv(c.urls, "urls")));
    if (b) blocks.push(block("cake", "Fødselsdag", `<p class="t-data"><strong>${esc(b.date)}</strong></p><p class="t-data-s t-soft">${b.days === 0 ? `Fylder ${b.turning} i dag!` : `Fylder ${b.turning} om ${b.days} ${b.days === 1 ? "dag" : "dage"}`}</p>`));
    if (c.note) blocks.push(block("note", "Note", `<p class="note-text">${esc(c.note)}</p>`, true));
    return `
      <article class="sheet" aria-labelledby="sheet-name">
        <div class="sheet-hero">
          ${avatar(c, "l", false)}
          <div>
            <h3 class="sheet-name t-tabular${nameless ? " is-nameless" : ""}" id="sheet-name">${esc(displayName(c))}</h3>
            <div class="sheet-meta">
              ${nameless ? `<p class="t-soft">Intet navn endnu. <a href="${hashFor({ bookId: S.bookId, contactId: c.id, mode: "edit" })}">Tilføj et navn</a></p>` : ""}
              ${c.nickname ? `<p><span class="t-soft">Kaldes</span> <strong>“${esc(c.nickname)}”</strong></p>` : ""}
              ${role ? `<p>${icon("work")}<span>${esc(role)}</span></p>` : ""}
            </div>
            <div class="stats">${stats.join("")}</div>
          </div>
        </div>
        ${blocks.length ? `<div class="sheet-grid">${blocks.join("")}</div>` : `<p class="muted-empty">Ingen detaljer endnu. Vælg Rediger for at tilføje telefon, e-mail eller adresse.</p>`}
      </article>`;
  }
  function valueHtml(kind, it) {
    if (kind === "phones") return `<a href="${telHref(it.value)}" class="od-nowrap">${esc(it.value)}</a>`;
    if (kind === "emails") return `<a href="mailto:${esc(it.value)}">${esc(it.value)}</a>`;
    if (kind === "urls") return `<a href="${esc(it.value)}" target="_blank" rel="noopener noreferrer">${esc(prettyUrl(it.value))}</a>`;
    if (kind === "addresses") {
      const q = encodeURIComponent(`${it.street}, ${it.postal} ${it.city}`);
      const tail = [it.region, it.country].filter(Boolean).join(" · ");
      return `<address>${esc(it.street)}<br><span class="od-nowrap">${esc(it.postal)}</span> ${esc(it.city)}${tail ? `<br><span class="t-soft">${esc(tail)}</span>` : ""}</address>
        <a class="t-data-s" href="https://www.openstreetmap.org/search?query=${q}" target="_blank" rel="noopener noreferrer">Vis på kort</a>`;
    }
    return esc(it.value);
  }

  /* ---------- Formular (rediger / ny) ---------- */
  function fieldErr(path) {
    const m = S.errors[path];
    return m ? `<p class="error-text" id="err-${path.replace(/\./g, "-")}">${icon("alert")}<span>${esc(m)}</span></p>` : "";
  }
  function inv(path) { return S.errors[path] ? ` aria-invalid="true" aria-describedby="err-${path.replace(/\./g, "-")}"` : ""; }
  function textField(path, label, opts = {}) {
    const v = getPath(S.draft, path) || "";
    const id = opts.id || "f-" + path.replace(/\./g, "-");
    return `<div class="field">
      <label class="label" for="${id}">${label}${opts.req ? ' <span class="req" aria-hidden="true">*</span>' : ""}</label>
      ${opts.help ? `<p class="help" id="${id}-help">${opts.help}</p>` : ""}
      <input class="input" id="${id}" type="${opts.type || "text"}" data-bind="${path}" value="${esc(v)}"${opts.ac ? ` autocomplete="${opts.ac}"` : ""}${opts.extra || ""}${inv(path)}${opts.help && !S.errors[path] ? ` aria-describedby="${id}-help"` : ""}>
      ${fieldErr(path)}
    </div>`;
  }
  function typeSelect(list, i, label) {
    const cur = S.draft[list][i].type;
    return `<span class="select-wrap"><select class="select" data-bind="${list}.${i}.type" aria-label="${label}">${TYPE_OPTIONS[list].map((t) => `<option value="${t}"${t === cur ? " selected" : ""}>${typeLabel(list, t)}</option>`).join("")}</select></span>`;
  }
  const NOUN = { phones: "telefon", emails: "e-mail", addresses: "adresse", urls: "webside" };
  function repSection(list, ic, title, valueLabel, inputType, ac) {
    const rows = S.draft[list].map((it, i) => {
      if (list === "addresses") {
        return `<div class="rep-addr" data-row="${list}.${i}">
          <div class="rep-addr-head">
            ${typeSelect(list, i, `Type, adresse ${i + 1}`)}
            <span class="t-ui t-soft">Adresse ${i + 1}</span>
            <button type="button" class="btn btn-icon btn-s" data-act="row-remove" data-list="${list}" data-i="${i}" aria-label="Fjern adresse ${i + 1}" data-fk="rm-${list}-${i}">${icon("close")}</button>
          </div>
          ${textField(`addresses.${i}.street`, "Gade og nr.", { ac: "street-address" })}
          <div class="grid-3">
            ${textField(`addresses.${i}.postal`, "Postnr.", { ac: "postal-code", extra: ' inputmode="numeric"' })}
            ${textField(`addresses.${i}.city`, "By", { ac: "address-level2" })}
          </div>
          <div class="grid-2">
            ${textField(`addresses.${i}.region`, "Region")}
            ${textField(`addresses.${i}.country`, "Land", { ac: "country-name" })}
          </div>
        </div>`;
      }
      const path = `${list}.${i}.value`;
      return `<div class="rep-row" data-row="${list}.${i}">
        ${typeSelect(list, i, `Type, ${NOUN[list]} ${i + 1}`)}
        <div class="rep-value field">
          <input class="input" id="f-${list}-${i}" type="${inputType}" data-bind="${path}" value="${esc(S.draft[list][i].value)}" aria-label="${valueLabel} ${i + 1}"${ac ? ` autocomplete="${ac}"` : ""}${inputType === "tel" ? ' inputmode="tel"' : ""}${inv(path)}>
          ${fieldErr(path)}
        </div>
        <button type="button" class="btn btn-icon btn-s" data-act="row-remove" data-list="${list}" data-i="${i}" aria-label="Fjern ${NOUN[list]} ${i + 1}" data-fk="rm-${list}-${i}">${icon("close")}</button>
      </div>`;
    }).join("");
    const head = list !== "addresses" && S.draft[list].length
      ? `<div class="rep-row rep-head hide-narrow" aria-hidden="true"><span class="label">Type</span><span class="label">${valueLabel}</span><span></span></div>` : "";
    return `<fieldset class="fieldset">
      <legend class="block-title">${icon(ic)}${title}</legend>
      ${head}${rows}
      <div><button type="button" class="btn btn-s" data-act="row-add" data-list="${list}" data-fk="add-${list}">${icon("plus")}<span class="btn-label">Tilføj ${NOUN[list]}</span></button></div>
    </fieldset>`;
  }

  function renderForm(head, body, foot) {
    const d = S.draft;
    const isNew = S.mode === "new";
    const badge = S.dirty ? `<span class="unsaved-star blink" aria-hidden="true">★</span><span class="badge" role="status">Ikke gemt</span>` : "";
    head.innerHTML = `<h2 class="panel-title" id="detail-title" tabindex="-1">${isNew ? "Ny kontakt" : "Rediger"}</h2>${badge}`;
    const errs = Object.entries(S.errors);
    const summary = errs.length ? `
      <div class="error-summary" role="alert" tabindex="-1" id="error-summary">
        <p class="label">${errs.length === 1 ? "1 ting mangler" : `${errs.length} ting mangler`}</p>
        <ul>${errs.map(([p, m]) => `<li><a href="#f-${p.replace(/\./g, "-")}" data-act="jump" data-target="f-${p.replace(/\./g, "-")}">${esc(m)}</a></li>`).join("")}</ul>
      </div>` : "";
    const bookSel = isNew ? `
      <div class="field">
        <label class="label" for="f-book">Adressebog <span class="req" aria-hidden="true">*</span></label>
        <span class="select-wrap"><select class="select" id="f-book" data-bind="book">${D.BOOKS.map((b) => `<option value="${b.id}"${b.id === d.book ? " selected" : ""}>${esc(b.name)}</option>`).join("")}</select></span>
      </div>` : `<p class="t-data-s t-soft">Adressebog: <strong>${esc(bookName(d.book))}</strong></p>`;
    body.innerHTML = `
      <form class="form" id="contact-form" novalidate aria-labelledby="detail-title">
        ${summary}
        ${bookSel}
        <fieldset class="fieldset">
          <legend class="block-title">${icon("camera")}Foto</legend>
          <div class="photo-edit">
            ${avatar(d.given || d.family || d.org || d.phones.some((p) => p.value) ? d : Object.assign({}, d, { given: "Ny" }), "m", true)}
            <div class="od-stack">
              <p class="help">Fotos vises pixeleret i appens palet. JPG eller PNG.</p>
              <div class="btn-row">
                <button type="button" class="btn btn-s" data-act="photo-pick" data-fk="photo-pick">${icon("camera")}<span class="btn-label">${d.photo ? "Skift foto" : "Upload foto"}</span></button>
                ${d.photo ? `<button type="button" class="btn btn-s" data-act="photo-remove" data-fk="photo-remove">${icon("trash")}<span class="btn-label">Fjern foto</span></button>` : ""}
              </div>
              <input type="file" accept="image/*" id="photo-input" class="sr-only" tabindex="-1" aria-hidden="true">
            </div>
          </div>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="block-title">${icon("user")}Navn</legend>
          <div class="grid-2">
            ${textField("given", "Fornavn", { ac: "given-name" })}
            ${textField("family", "Efternavn", { ac: "family-name" })}
          </div>
          <div>
            <button type="button" class="disclosure" data-act="more-names" aria-expanded="${S.moreNames}" aria-controls="more-names" data-fk="more-names">${icon("chevron")}Flere navnefelter</button>
          </div>
          <div class="grid-2" id="more-names"${S.moreNames ? "" : " hidden"}>
            ${textField("prefix", "Titel", { ac: "honorific-prefix", help: "Fx Dr. eller Prof." })}
            ${textField("middle", "Mellemnavn", { ac: "additional-name" })}
            ${textField("suffix", "Suffiks", { ac: "honorific-suffix", help: "Fx jr. eller cand.merc." })}
          </div>
          <div class="grid-2">
            ${textField("nickname", "Kaldenavn", { ac: "nickname" })}
          </div>
          <div class="grid-2">
            ${textField("title", "Stilling", { ac: "organization-title" })}
            ${textField("org", "Firma", { ac: "organization" })}
          </div>
        </fieldset>
        ${repSection("phones", "phone", "Telefoner", "Telefonnummer", "tel", "tel")}
        ${repSection("emails", "mail", "E-mails", "E-mailadresse", "email", "email")}
        ${repSection("addresses", "home", "Adresser", "Adresse", "text")}
        ${repSection("urls", "globe", "Websider", "Webadresse", "url", "url")}
        <fieldset class="fieldset">
          <legend class="block-title">${icon("cake")}Fødselsdag og note</legend>
          <div class="grid-2">${textField("birthday", "Fødselsdag", { type: "date", ac: "bday", extra: ` max="${new Date().toISOString().slice(0, 10)}"` })}</div>
          <div class="field">
            <label class="label" for="f-note">Note</label>
            <textarea class="textarea" id="f-note" data-bind="note" rows="4">${esc(d.note)}</textarea>
          </div>
        </fieldset>
        <button type="submit" hidden tabindex="-1">Gem</button>
      </form>`;
    foot.hidden = false;
    foot.innerHTML = `
      <button type="button" class="btn" data-act="cancel-edit" data-fk="cancel">${icon("close")}<span class="btn-label">Annuller</span></button>
      <span class="spacer"></span>
      <button type="button" class="btn btn-primary" data-act="save" data-fk="save">${icon("check")}<span class="btn-label">Gem</span></button>`;
  }

  function getPath(o, path) { return path.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) {
    const ks = path.split(".");
    const last = ks.pop();
    const t = ks.reduce((a, k) => a[k], o);
    t[last] = v;
  }
  function markDirty() {
    if (S.dirty) return;
    S.dirty = true;
    const head = $("#detail-head");
    head.insertAdjacentHTML("beforeend", `<span class="unsaved-star blink" aria-hidden="true">★</span><span class="badge" role="status">Ikke gemt</span>`);
    $("#bezel-text").textContent = "★ Ikke gemt";
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validateField(path) {
    const v = (getPath(S.draft, path) || "").trim();
    if (/^emails\.\d+\.value$/.test(path)) {
      if (v && !EMAIL_RE.test(v)) S.errors[path] = "Det ligner ikke en e-mailadresse. Den skal indeholde @ og et domæne, fx navn@mail.dk.";
      else delete S.errors[path];
    }
    if (/^phones\.\d+\.value$/.test(path)) {
      if (v && !/^\+?[\d\s()-]{4,}$/.test(v)) S.errors[path] = "Et telefonnummer må kun indeholde tal, mellemrum og evt. + foran.";
      else delete S.errors[path];
    }
  }
  function validateAll() {
    const d = S.draft;
    S.errors = {};
    d.emails.forEach((e, i) => validateField(`emails.${i}.value`));
    d.phones.forEach((p, i) => validateField(`phones.${i}.value`));
    const any = [d.given, d.family, d.org, ...d.phones.map((p) => p.value), ...d.emails.map((e) => e.value)].some((v) => (v || "").trim());
    if (!any) S.errors = Object.assign({ given: "Giv kontakten mindst et navn, et firma, et telefonnummer eller en e-mail." }, S.errors);
    return !Object.keys(S.errors).length;
  }
  /** Gentegner kun formularens krop — hoved og fod (Gem/Annuller) bevares. */
  function refreshFormErrors(focusSummary) {
    const y = $("#detail-body").scrollTop;
    const scratchHead = document.createElement("div"), scratchFoot = document.createElement("div");
    keepFocus(() => renderForm(scratchHead, $("#detail-body"), scratchFoot));
    if (focusSummary) { const s = $("#error-summary"); if (s) { $("#detail-body").scrollTop = 0; s.focus(); } }
    else $("#detail-body").scrollTop = y;
  }

  function normalizedDraft() {
    const d = clone(S.draft);
    for (const k of ["prefix", "given", "middle", "family", "suffix", "nickname", "title", "org", "note"]) d[k] = (d[k] || "").trim();
    d.phones = d.phones.filter((p) => p.value.trim()).map((p) => ({ type: p.type, value: p.value.trim() }));
    d.emails = d.emails.filter((e) => e.value.trim()).map((e) => ({ type: e.type, value: e.value.trim() }));
    d.urls = d.urls.filter((u) => u.value.trim()).map((u) => ({ type: u.type, value: /^https?:\/\//i.test(u.value.trim()) ? u.value.trim() : "https://" + u.value.trim() }));
    d.addresses = d.addresses.filter((a) => [a.street, a.postal, a.city].some((v) => (v || "").trim()));
    return d;
  }
  function save() {
    if (!validateAll()) { play("error"); refreshFormErrors(true); return; }
    const orig = S.mode === "edit" ? getContact(S.contactId) : null;
    if (orig && orig._conflict) { openConflict(orig); return; }
    commit();
  }
  function commit() {
    const d = normalizedDraft();
    delete d._conflict;
    let target;
    if (S.mode === "new") {
      d.id = "k" + Date.now().toString(36);
      d.etag = '"1"';
      S.contacts.push(d);
      target = d;
    } else {
      const i = S.contacts.findIndex((c) => c.id === S.contactId);
      d.etag = '"' + (Date.now() % 100000) + '"';
      S.contacts[i] = d;
      target = d;
    }
    S.dirty = false;
    play("save");
    toast("GEMT!", S.mode === "new" ? `${displayName(target)} er tilføjet til ${bookName(target.book)}.` : `${displayName(target)} er opdateret.`, "check");
    const bookId = S.bookId !== "alle" && S.bookId !== target.book ? target.book : S.bookId;
    go({ bookId, contactId: target.id, mode: "view" });
    setTimeout(() => { const t = $("#detail-title"); t && t.focus({ preventScroll: true }); }, 0);
  }
  function cancelEdit() {
    const leave = () => { S.dirty = false; go(S.mode === "new" ? { bookId: S.bookId, contactId: null, mode: null } : { bookId: S.bookId, contactId: S.contactId, mode: "view" }); };
    if (S.dirty) confirmDiscard(leave); else leave();
  }

  /* ---------- Konsol (mobil) ---------- */
  function renderConsole() {
    const btn = (act, ic, label, cls = "") => `<button type="button" class="btn ${cls}" data-act="${act}" data-fk="c-${act}">${icon(ic)}<span class="btn-label">${label}</span></button>`;
    let html;
    if (S.loading) html = btn("drawer-open", "menu", "Bøger");
    else if (editing()) html = btn("cancel-edit", "close", "Annuller") + btn("save", "check", "Gem", "btn-primary");
    else if (S.contactId) html = btn("back", "back", "Tilbage") + btn("edit", "edit", "Rediger") + btn("delete", "trash", "Slet", "btn-danger");
    else html = btn("drawer-open", "book", "Bøger") + btn("new", "plus", "Ny", "btn-primary");
    $("#console").innerHTML = html;
  }

  /* ==========================================================================
     Dialoger (RPG-tekstbokse)
     ========================================================================== */
  const dlg = () => $("#dlg");
  let dlgCancel = null;
  function openDialog({ speaker, text, body = "", choices = [], actions = "", onCancel, focus }) {
    const el = dlg();
    dlgCancel = onCancel || null;
    el.innerHTML = `
      <div class="rpg-inner">
        ${speaker ? `<span class="rpg-speaker">${esc(speaker)}</span>` : ""}
        <p class="rpg-text" id="dlg-text" data-type="${esc(text)}">${esc(text)}</p>
        ${body ? `<div class="rpg-body">${body}</div>` : ""}
        ${choices.length ? `<div class="choices" role="group" aria-label="Valg">${choices.map((c, i) => `
          <button type="button" class="choice${c.danger ? " choice-danger" : ""}" data-choice="${i}">${esc(c.label)}${c.hint ? `<span class="choice-hint">${esc(c.hint)}</span>` : ""}</button>`).join("")}</div>` : ""}
        ${actions ? `<div class="rpg-actions">${actions}</div>` : ""}
      </div>`;
    el.setAttribute("aria-labelledby", "dlg-text");
    $$("[data-choice]", el).forEach((b) => b.addEventListener("click", () => choices[+b.dataset.choice].run()));
    if (!el.open) el.showModal();
    const textEl = $("#dlg-text", el);
    const finish = typewriter(textEl, { instant: IS_DEMO });
    textEl.addEventListener("click", finish);
    const f = focus ? $(focus, el) : $("[data-choice]", el) || $(".btn", el);
    if (f) f.focus();
  }
  function closeDialog() { const el = dlg(); if (el.open) el.close(); dlgCancel = null; }

  function confirmDiscard(onYes) {
    openDialog({
      speaker: "Advarsel",
      text: "Du har ændringer, der ikke er gemt. Vil du kassere dem?",
      choices: [
        { label: "JA", hint: "Kassér ændringerne", danger: true, run: () => { closeDialog(); onYes(); } },
        { label: "NEJ", hint: "Fortsæt redigeringen", run: () => closeDialog() },
      ],
      focus: '[data-choice="1"]',
    });
  }

  function openDelete() {
    const c = getContact(S.contactId);
    if (!c) return;
    openDialog({
      speaker: "Slet kontakt",
      text: `Vil du virkelig slette ${displayName(c)}? Kontakten forsvinder også fra serveren og dine andre enheder.`,
      choices: [
        { label: "JA", hint: "Slet kontakten", danger: true, run: () => { closeDialog(); doDelete(c); } },
        { label: "NEJ", hint: "Behold den", run: () => closeDialog() },
      ],
      focus: '[data-choice="1"]',
    });
  }
  function doDelete(c) {
    const i = S.contacts.findIndex((x) => x.id === c.id);
    const removed = S.contacts.splice(i, 1)[0];
    play("delete");
    toast("GAME OVER", `Kontakt slettet: ${displayName(removed)}.`, "trash", {
      action: "Fortryd",
      onAction: () => { S.contacts.splice(i, 0, removed); toast("CONTINUE?", `${displayName(removed)} er tilbage.`, "heart"); go({ bookId: S.bookId, contactId: removed.id, mode: "view" }); },
      ms: 6000,
    });
    go({ bookId: S.bookId, contactId: null, mode: null });
  }

  function openConflict(orig) {
    const sv = D.SERVER_VERSIONS[orig.id] || { updatedBy: "en anden enhed", updatedAt: "for nylig" };
    const changes = [];
    if (sv.title) changes.push(`<li><span class="tag">Stilling</span> ${esc(sv.title)}</li>`);
    if (sv.phones) sv.phones.forEach((p, i) => { if (!orig.phones[i] || orig.phones[i].value !== p.value) changes.push(`<li><span class="tag">${esc(TYPE_LABEL[p.type])}</span> <span class="od-nowrap">${esc(p.value)}</span></li>`); });
    openDialog({
      speaker: "Serveren",
      text: `Kontakten er ændret på en anden enhed. ${displayName(orig)} blev opdateret fra ${sv.updatedBy} ${sv.updatedAt}, mens du redigerede.`,
      body: changes.length ? `<p class="label">Ændret på serveren</p><ul class="od-stack" style="--od-gap: 8px">${changes.join("")}</ul>` : "",
      choices: [
        { label: "Genindlæs", hint: "Hent serverens version. Dine ændringer kasseres.", run: () => {
          closeDialog();
          const c = getContact(orig.id);
          if (sv.title) c.title = sv.title;
          if (sv.phones) c.phones = clone(sv.phones);
          delete c._conflict;
          S.dirty = false;
          toast("GENINDLÆST", `${displayName(c)} viser nu serverens version.`, "import");
          go({ bookId: S.bookId, contactId: c.id, mode: "view" });
        } },
        { label: "Overskriv", hint: "Gem din version oven i serverens.", danger: true, run: () => { closeDialog(); delete getContact(orig.id)._conflict; commit(); } },
      ],
      actions: `<button type="button" class="btn btn-ghost btn-s" data-act="dlg-close">Tilbage til redigering</button>`,
    });
  }

  /* ---------- Import ---------- */
  function openImport(state) {
    S.imp = state || { step: "pick", target: S.bookId === "alle" ? "personlige" : S.bookId };
    renderImport();
  }
  function renderImport() {
    const s = S.imp;
    const cancel = `<button type="button" class="btn" data-act="dlg-close">${icon("close")}<span class="btn-label">Annuller</span></button>`;
    if (s.step === "pick") {
      openDialog({
        speaker: "Import",
        text: "Vælg en .vcf-fil med kontakter. Jeg tæller dem, før noget bliver importeret.",
        body: `<label class="drop" id="drop">
            ${icon("import", "ic-l")}
            <span class="t-ui">Vælg .vcf-fil</span>
            <span class="help">eller træk filen herind</span>
            <input type="file" accept=".vcf,text/vcard,text/x-vcard" id="imp-file" class="sr-only">
          </label>
          ${s.error ? `<p class="error-text">${icon("alert")}<span>${esc(s.error)}</span></p>` : ""}`,
        actions: cancel,
        onCancel: () => { S.imp = null; },
        focus: "#imp-file",
      });
      const drop = $("#drop");
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); const f = e.dataTransfer.files[0]; if (f) readImportFile(f); });
      $("#imp-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) readImportFile(f); });
      return;
    }
    if (s.step === "ready") {
      openDialog({
        speaker: "Import",
        text: `Fandt ${s.parsed.total} kontakter i filen. Hvilken adressebog skal de i?`,
        body: `<div class="file-pill">${icon("note", "ic-m")}<span><strong class="t-data">${esc(s.fileName)}</strong><span class="t-data-s t-soft">${s.parsed.total} kontakter · ${(s.size / 1024).toFixed(1).replace(".", ",")} kB</span></span><button type="button" class="btn btn-ghost btn-s" data-act="imp-repick">Skift</button></div>
          <fieldset class="fieldset">
            <legend class="label">Importér til</legend>
            <div class="radio-menu">${D.BOOKS.map((b) => `<label><input type="radio" name="imp-book" value="${b.id}"${b.id === s.target ? " checked" : ""}><span class="cursor" aria-hidden="true"></span><span>${esc(b.name)}</span><span class="count">${countIn(b.id)}</span></label>`).join("")}</div>
          </fieldset>`,
        actions: cancel + `<button type="button" class="btn btn-primary" data-act="imp-start">${icon("import")}<span class="btn-label">Importér ${s.parsed.total}</span></button>`,
        onCancel: () => { S.imp = null; },
        focus: 'input[name="imp-book"]:checked',
      });
      $$('input[name="imp-book"]').forEach((r) => r.addEventListener("change", () => { s.target = r.value; }));
      return;
    }
    if (s.step === "progress") {
      const total = s.parsed.total;
      openDialog({
        speaker: "Import",
        text: `Importerer til ${bookName(s.target)}…`,
        body: hpBar(s.done, total),
        actions: `<button type="button" class="btn" data-act="imp-abort">${icon("close")}<span class="btn-label">Afbryd</span></button>`,
        onCancel: () => { s.aborted = true; },
        focus: '[data-act="imp-abort"]',
      });
      return;
    }
    if (s.step === "result") {
      const fails = s.parsed.failures;
      openDialog({
        speaker: "Import færdig",
        text: s.aborted ? `Import afbrudt. ${s.ok} kontakter nåede at lande i ${bookName(s.target)}.` : fails.length ? `Næsten perfekt! ${s.ok} nye kontakter er landet i ${bookName(s.target)}.` : `Perfekt! Alle ${s.ok} kontakter er landet i ${bookName(s.target)}.`,
        body: `<p class="result-line"><span class="result-ok">${s.ok} importeret</span>${fails.length ? `<span class="result-fail">${fails.length} fejlede</span>` : ""}</p>
          ${fails.length ? `<div class="od-stack"><p class="label">Kunne ikke læses</p><ul class="fail-list">${fails.map((f) => `<li>Kort ${f.index} (linje ${f.line}): ${esc(f.reason)}</li>`).join("")}</ul></div>` : ""}
          ${hpBar(s.done, s.parsed.total, true)}`,
        actions: `<button type="button" class="btn btn-primary" data-act="imp-done">${icon("check")}<span class="btn-label">Færdig</span></button>`,
        onCancel: () => { S.imp = null; },
        focus: '[data-act="imp-done"]',
      });
    }
  }
  function hpBar(done, total, finished) {
    const segs = 20, on = Math.round((done / Math.max(1, total)) * segs);
    return `<div class="hp">
      <div class="hp-top"><span class="od-row" style="--od-gap:8px">${icon("heart", "ic-s")}<span id="hp-label">${finished ? "Færdig" : "Import"}</span></span><span class="t-tabular" id="hp-num">${done} / ${total}</span></div>
      <div class="hp-bar" role="progressbar" aria-labelledby="hp-label" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-valuetext="${done} af ${total} kontakter">${Array.from({ length: segs }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</div>
    </div>`;
  }
  function readImportFile(f) {
    if (!/\.vcf$/i.test(f.name) && !/vcard/i.test(f.type)) { S.imp.error = `»${f.name}« er ikke en .vcf-fil.`; play("error"); renderImport(); return; }
    const r = new FileReader();
    r.onload = () => {
      const parsed = parseVcf(String(r.result));
      if (!parsed.total) { S.imp.error = `Fandt ingen kontakter i »${f.name}«.`; play("error"); renderImport(); return; }
      Object.assign(S.imp, { step: "ready", fileName: f.name, size: f.size, parsed, error: null });
      renderImport();
    };
    r.readAsText(f);
  }
  function startImport() {
    const s = S.imp;
    const items = [...s.parsed.cards.map((c) => ({ c })), ...s.parsed.failures.map((f) => ({ f }))];
    Object.assign(s, { step: "progress", done: 0, ok: 0, aborted: false });
    renderImport();
    const tick = () => {
      if (!S.imp || s.aborted) { finishImport(); return; }
      const it = items[s.done];
      if (it && it.c) {
        const c = Object.assign({ id: "i" + Date.now().toString(36) + s.done, book: s.target, etag: '"1"' }, it.c);
        S.contacts.push(c);
        s.ok++;
      }
      s.done++;
      const bar = $(".hp-bar");
      if (bar) {
        const on = Math.round((s.done / items.length) * 20);
        $$(".hp-bar > i").forEach((seg, i) => seg.classList.toggle("on", i < on));
        bar.setAttribute("aria-valuenow", s.done);
        bar.setAttribute("aria-valuetext", `${s.done} af ${items.length} kontakter`);
        $("#hp-num").textContent = `${s.done} / ${items.length}`;
      }
      if (s.done < items.length) setTimeout(tick, settings.motion ? 55 : 0);
      else finishImport();
    };
    setTimeout(tick, 200);
  }
  function finishImport() {
    const s = S.imp;
    if (!s) return;
    s.step = "result";
    if (!s.aborted) s.parsed.failures = s.parsed.failures.slice();
    else s.parsed.failures = [];
    play(s.parsed.failures.length ? "select" : "done");
    render();
    renderImport();
  }

  /* ---------- Eksport ---------- */
  function doExport() {
    const list = sortContacts(S.contacts.filter((c) => inBook(c)));
    if (!list.length) { toast("TOMT", `Der er ingen kontakter at eksportere i ${bookName(S.bookId)}.`, "alert"); return; }
    const name = `pixelbog-${S.bookId}.vcf`;
    const blob = new Blob([toVcf(list, displayName)], { type: "text/vcard;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("EKSPORTERET!", `${list.length} kontakter gemt som ${name}.`, "export");
  }

  /* ---------- Toast ---------- */
  function toast(title, msg, ic = "check", opts = {}) {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${icon(ic)}<div class="toast-text"><strong class="toast-title">${esc(title)}</strong><span class="toast-msg">${esc(msg)}</span>${opts.action ? `<span><button type="button" class="btn btn-s">${esc(opts.action)}</button></span>` : ""}</div>`;
    if (opts.action) el.querySelector("button").addEventListener("click", () => { remove(); opts.onAction(); });
    box.append(el);
    let timer = null;
    function remove() {
      clearTimeout(timer);
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), document.documentElement.classList.contains("fx-still") ? 0 : 180);
    }
    if (!opts.sticky) timer = setTimeout(remove, opts.ms || 3200);
    return el;
  }

  /* ---------- Skuffe ---------- */
  function setDrawer(open, doRender = true) {
    S.drawer = open;
    if (doRender) {
      renderSidebar();
      renderListHead();
      if (open) { const f = $(".menu-item[aria-current='true']"); f && f.focus(); }
      else { const b = $(mqMobile.matches ? '[data-fk="c-drawer-open"]' : '[data-fk="drawer-open"]'); b && b.focus(); }
    }
  }

  /* ==========================================================================
     Hændelser
     ========================================================================== */
  document.addEventListener("click", (e) => {
    const mi = e.target.closest(".menu-item");
    if (mi && S.drawer && mi.getAttribute("href") === location.hash) { setDrawer(false); return; }
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    switch (act) {
      case "new": go({ bookId: S.bookId, contactId: null, mode: "new" }); break;
      case "edit": go({ bookId: S.bookId, contactId: S.contactId, mode: "edit" }); break;
      case "delete": openDelete(); break;
      case "back": go({ bookId: S.bookId, contactId: null, mode: null }); break;
      case "cancel-edit": cancelEdit(); break;
      case "save": save(); break;
      case "drawer-open": setDrawer(true); break;
      case "drawer-close": setDrawer(false); break;
      case "usermenu": S.usermenu = !S.usermenu; keepFocus(renderSidebar); break;
      case "theme": settings.theme = t.dataset.v; saveSettings(); applySettings(); keepFocus(renderSidebar); break;
      case "toggle": settings[t.dataset.k] = !settings[t.dataset.k]; saveSettings(); applySettings(); keepFocus(renderSidebar); if (t.dataset.k === "sound" && settings.sound) sfx("select"); break;
      case "logout":
        S.authed = false; S.user = ""; S.usermenu = false; S.drawer = false; S.loginError = null; S.loginFieldErrors = {};
        history.replaceState(null, "", location.pathname + location.search);
        renderLogin();
        toast("Logget ud", "Vi ses! Dine kontakter ligger trygt på serveren.", "logout");
        break;
      case "import": if (S.drawer) setDrawer(false, false), render(); openImport(); break;
      case "export": doExport(); break;
      case "clear-search": S.query = ""; $("#q").value = ""; renderListHead(); renderList(); $("#q").focus(); break;
      case "row-add": {
        const list = t.dataset.list;
        const blank = list === "addresses" ? { type: "hjem", street: "", postal: "", city: "", region: "", country: "Danmark" } : { type: TYPE_OPTIONS[list][0], value: "" };
        S.draft[list].push(blank);
        markDirty();
        refreshFormErrors();
        const idx = S.draft[list].length - 1;
        const f = $(list === "addresses" ? `#f-addresses-${idx}-street` : `#f-${list}-${idx}`);
        f && f.focus();
        break;
      }
      case "row-remove": {
        const list = t.dataset.list, i = +t.dataset.i;
        S.draft[list].splice(i, 1);
        Object.keys(S.errors).filter((k) => k.startsWith(list + ".")).forEach((k) => delete S.errors[k]);
        markDirty();
        refreshFormErrors();
        const next = $(`[data-fk="rm-${list}-${Math.min(i, S.draft[list].length - 1)}"]`) || $(`[data-fk="add-${list}"]`);
        next && next.focus();
        break;
      }
      case "more-names": S.moreNames = !S.moreNames; t.setAttribute("aria-expanded", S.moreNames); $("#more-names").hidden = !S.moreNames; if (S.moreNames) $("#f-prefix").focus(); break;
      case "photo-pick": $("#photo-input").click(); break;
      case "photo-remove": S.draft.photo = null; markDirty(); refreshFormErrors(); $('[data-fk="photo-pick"]').focus(); break;
      case "jump": e.preventDefault(); { const f = document.getElementById(t.dataset.target); if (f) f.focus(); } break;
      case "dlg-close": { const cb = dlgCancel; closeDialog(); if (cb) cb(); if (S.imp && S.imp.step !== "progress") S.imp = null; break; }
      case "imp-repick": S.imp.step = "pick"; renderImport(); break;
      case "imp-start": startImport(); break;
      case "imp-abort": S.imp.aborted = true; break;
      case "imp-done": { const target = S.imp.target; S.imp = null; closeDialog(); go({ bookId: target, contactId: null, mode: null }); break; }
    }
  });

  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "login-form") submitLogin(e.target);
    if (e.target.id === "contact-form") save();
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "q") { S.query = t.value; renderListHead(); renderList(); return; }
    if (t.dataset && t.dataset.bind && S.draft) {
      setPath(S.draft, t.dataset.bind, t.value);
      markDirty();
    }
  });
  document.addEventListener("focusout", (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.bind || !S.draft) return;
    const p = t.dataset.bind;
    const had = !!S.errors[p];
    validateField(p);
    if (had !== !!S.errors[p]) updateFieldError(t, p);
  });
  /** Opdaterer ét felts fejltekst på stedet (ingen gentegning, så klik ikke går tabt). */
  function updateFieldError(input, path) {
    const id = "err-" + path.replace(/\./g, "-");
    const old = document.getElementById(id);
    if (old) old.remove();
    if (S.errors[path]) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", id);
      input.insertAdjacentHTML("afterend", fieldErr(path));
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }
  document.addEventListener("change", (e) => {
    if (e.target.id !== "photo-input") return;
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    const r = new FileReader();
    r.onload = () => { img.onload = () => { S.draft.photo = quantizePhoto(img); markDirty(); refreshFormErrors(); }; img.src = r.result; };
    r.readAsDataURL(f);
  });

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key === "Escape" && S.drawer) { setDrawer(false); return; }
    if (e.key === "/" && S.authed && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !dlg().open) { e.preventDefault(); $("#q").focus(); return; }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && (t.classList.contains("row") || t.classList.contains("choice") || t.classList.contains("menu-item"))) {
      const sel = t.classList.contains("row") ? ".row" : t.classList.contains("choice") ? ".choice" : ".menu-item";
      const all = $$(sel, t.closest(".panel-body, .choices, .menu") || document);
      const i = all.indexOf(t);
      const n = all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length];
      if (n) { e.preventDefault(); n.focus(); if (settings.sound) sfx("select"); }
    }
    if (e.key === "ArrowDown" && t.id === "q") { const r = $(".row"); if (r) { e.preventDefault(); r.focus(); } }
  });
  document.addEventListener("cancel", (e) => {
    if (e.target.id !== "dlg") return;
    if (S.imp && S.imp.step === "progress") { e.preventDefault(); S.imp.aborted = true; return; }
    const cb = dlgCancel; dlgCancel = null; if (cb) cb();
  }, true);
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("beforeunload", (e) => { if (editing() && S.dirty) { e.preventDefault(); e.returnValue = ""; } });
  mqCompact.addEventListener("change", () => { if (S.authed) { if (!mqCompact.matches) S.drawer = false; renderSidebar(); } });

  /* ==========================================================================
     Opstart + demo-tilstande (skærmoversigt)
     ========================================================================== */
  function setRoute(r) { history.replaceState(null, "", location.pathname + location.search + hashFor(r)); }
  function boot() {
    if (!DEMO || DEMO.startsWith("login")) {
      if (DEMO === "login-auth") { S.loginError = "auth"; S.loginUser = "sofie"; }
      if (DEMO === "login-server") { S.loginError = "server"; S.loginUser = "sofie"; }
      if (!DEMO && sessionStorage.getItem("pixelbog.session")) { /* ingen rigtig session i prototypen */ }
      render();
      return;
    }
    S.authed = true; S.user = D.USER;
    const r = { bookId: "alle", contactId: null, mode: null };
    const editMette = () => {
      Object.assign(r, { contactId: "k001", mode: "edit" });
      setRoute(r); applyRoute(r);
      S.draft.nickname = "Mette K.";
      S.draft.phones.push({ type: "arbejde", value: "+45 70 26 " });
      S.dirty = true;
      render();
    };
    switch (DEMO) {
      case "list": break;
      case "none": break;
      case "view": r.contactId = "k001"; r.mode = "view"; break;
      case "view-photo": Object.assign(r, { bookId: "arbejde", contactId: "k012", mode: "view" }); break;
      case "view-nameless": Object.assign(r, { bookId: "personlige", contactId: "k010", mode: "view" }); break;
      case "view-long": Object.assign(r, { bookId: "arbejde", contactId: "k015", mode: "view" }); break;
      case "new": Object.assign(r, { bookId: "personlige", mode: "new" }); break;
      case "empty-book": r.bookId = "familie"; S.contacts = S.contacts.filter((c) => c.book !== "familie"); break;
      case "no-results": S.query = "zebra"; break;
      case "drawer": Object.assign(r, { contactId: "k001", mode: "view" }); break;
      case "usermenu": Object.assign(r, { contactId: "k001", mode: "view" }); S.usermenu = true; break;
      default: break;
    }
    if (DEMO === "loading") {
      S.loading = true; mountShell(); render(); return;
    }
    if (DEMO === "edit-dirty" || DEMO === "discard") {
      editMette();
      if (DEMO === "discard") confirmDiscard(() => {});
      return;
    }
    if (DEMO === "new-errors") {
      Object.assign(r, { bookId: "personlige", mode: "new" });
      setRoute(r); applyRoute(r);
      S.draft.emails[0].value = "mette@mail";
      S.dirty = true;
      validateAll();
      S.errors = { given: "Giv kontakten mindst et navn, et firma, et telefonnummer eller en e-mail.", "emails.0.value": "Det ligner ikke en e-mailadresse. Den skal indeholde @ og et domæne, fx navn@mail.dk." };
      render();
      return;
    }
    if (DEMO === "conflict") {
      Object.assign(r, { bookId: "arbejde", contactId: "k011", mode: "edit" });
      setRoute(r); applyRoute(r);
      S.draft.title = "Produktdirektør"; S.dirty = true; render();
      openConflict(getContact("k011"));
      return;
    }
    setRoute(r);
    applyRoute(r);
    if (DEMO === "drawer") { S.drawer = true; renderSidebar(); renderListHead(); }
    if (DEMO === "delete") { r.contactId = "k001"; setRoute(Object.assign(r, { mode: "view" })); applyRoute(r); openDelete(); }
    if (DEMO === "toast") { setRoute(Object.assign(r, { contactId: "k001", mode: "view" })); applyRoute(r); toast("GEMT!", "Mette Kristensen er opdateret.", "check", { sticky: true }); }
    if (DEMO === "toast-delete") toast("GAME OVER", "Kontakt slettet: Thomas Vestergaard.", "trash", { sticky: true, action: "Fortryd", onAction: () => {} });
    if (DEMO && DEMO.startsWith("import")) {
      const text = D.sampleVcf();
      const parsed = parseVcf(text);
      const base = { fileName: "eksempel-kontakter.vcf", size: text.length, parsed, target: "arbejde" };
      if (DEMO === "import-pick") openImport({ step: "pick", target: "arbejde" });
      if (DEMO === "import-ready") openImport(Object.assign(base, { step: "ready" }));
      if (DEMO === "import-progress") openImport(Object.assign(base, { step: "progress", done: 23, ok: 22 }));
      if (DEMO === "import-result") openImport(Object.assign(base, { step: "result", done: 44, ok: 42 }));
    }
  }
  boot();
})();

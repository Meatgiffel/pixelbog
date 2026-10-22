/* ==========================================================================
   PIXELBOG — pixel-hjælpere
   Ikoner (8×8), identicons, ?-blok, foto-kvantisering, 8-bit-lyde,
   skrivemaskine-effekt og vCard-parser/-serializer.
   Ingen afhængigheder. Eksponeres som window.Pixel.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- Ikoner: 8×8 bitmaps ('#' = pixel) ---------- */
  const ICONS = {
    phone:   ["##......", "###.....", ".##.....", ".##.....", "..##....", "..###.##", "...#####", "....###."],
    mail:    ["........", "########", "##....##", "#.#..#.#", "#..##..#", "#......#", "########", "........"],
    home:    ["...##...", "..####..", ".######.", "########", ".#....#.", ".#.##.#.", ".#.##.#.", ".#.##.#."],
    cake:    [".#..#..#", ".#..#..#", "########", "#..#..#.", "########", "#......#", "#......#", "########"],
    globe:   ["..####..", ".#.##.#.", "#..##..#", "########", "#..##..#", ".#.##.#.", "..####..", "........"],
    search:  [".####...", "#....#..", "#....#..", "#....#..", "#....#..", ".#####..", ".....##.", "......##"],
    edit:    ["......##", ".....###", "....###.", "...###..", "..###...", ".###....", "#.#.....", "##......"],
    trash:   ["..####..", "########", ".######.", ".#.##.#.", ".#.##.#.", ".#.##.#.", ".#.##.#.", "..####.."],
    plus:    ["...##...", "...##...", "...##...", "########", "########", "...##...", "...##...", "...##..."],
    close:   ["##....##", "###..###", ".######.", "..####..", "..####..", ".######.", "###..###", "##....##"],
    back:    ["...#....", "..##....", ".#######", "########", ".#######", "..##....", "...#....", "........"],
    chevron: [".##.....", "..##....", "...##...", "....##..", "...##...", "..##....", ".##.....", "........"],
    import:  ["...##...", "...##...", "...##...", ".######.", "..####..", "...##...", "#......#", "########"],
    export:  ["...##...", "..####..", ".######.", "...##...", "...##...", "...##...", "#......#", "########"],
    logout:  ["#####...", "#...#...", "#...#.#.", "#.#.####", "#...#.#.", "#...#...", "#...#...", "#####..."],
    user:    ["..####..", "..####..", "..####..", "...##...", ".######.", "########", "########", "########"],
    book:    [".#######", "#.#....#", "#.#.##.#", "#.#....#", "#.#....#", "#.#....#", "#.######", ".#######"],
    note:    ["######..", "#....##.", "#.##..##", "#......#", "#.####.#", "#......#", "#.####.#", "########"],
    work:    ["..####..", "..#..#..", "########", "#......#", "########", "#..##..#", "#......#", "########"],
    star:    ["...##...", "...##...", "########", ".######.", "..####..", ".##..##.", ".#....#.", "........"],
    check:   [".......#", "......##", "#....##.", "##..##..", ".####...", "..##....", "........", "........"],
    alert:   ["########", "#..##..#", "#..##..#", "#..##..#", "#......#", "#..##..#", "#......#", "########"],
    menu:    ["########", "########", "........", "########", "########", "........", "########", "########"],
    camera:  ["..###...", "########", "#..##..#", "#.#..#.#", "#.#..#.#", "#..##..#", "########", "........"],
    sound:   ["...#....", "..##..#.", "####.#..", "####.#.#", "####.#.#", "####.#..", "..##..#.", "...#...."],
    plug:    [".#..#...", ".#..#...", "######..", "######..", ".####...", "..##....", "..##....", "..####.."],
    brand:   [".#######", "##.....#", "##.#...#", "##.##..#", "##.###.#", "##.##..#", "##.#...#", ".#######"],
    ghost:   ["..####..", ".######.", "##.##.##", "##.##.##", "########", "########", "########", "#.#..#.#"],
    chest:   ["########", "#......#", "########", "#......#", "#..##..#", "#......#", "#......#", "########"],
    pin:     ["..####..", ".##..##.", ".##..##.", "..####..", "..####..", "...##...", "...##...", "........"],
    heart:   [".##.##..", "#######.", "#######.", "#######.", ".#####..", "..###...", "...#....", "........"],
  };

  function bitmapPath(rows) {
    let d = "";
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] === "#") {
          let w = 1;
          while (row[x + w] === "#") w++;
          d += `M${x} ${y}h${w}v1h-${w}z`;
          x += w;
        } else x++;
      }
    });
    return d;
  }
  const pathCache = {};
  function icon(name, cls = "") {
    const rows = ICONS[name];
    if (!rows) return "";
    const d = pathCache[name] || (pathCache[name] = bitmapPath(rows));
    return `<svg class="od-icon ${cls}" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  }

  /* ---------- Hash ---------- */
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /* ---------- Identicon: 8×8, spejlsymmetrisk (venstre 4 kolonner = 32 bit) ---------- */
  function identicon(seed, label) {
    const s = (seed || "?").trim().toLowerCase();
    let bits = fnv1a(s);
    const colour = 1 + (fnv1a(s.split("").reverse().join("") + "#") % 5);
    // sikre en "krop": midterkolonnerne i rækkerne 2–5 er altid fyldt
    let d = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const bit = (bits >>> (y * 4 + x)) & 1;
        const forced = x === 3 && y >= 2 && y <= 5;
        const edge = y === 0 && x === 0;
        if ((bit || forced) && !edge) {
          d += `M${x} ${y}h1v1h-1z`;
          d += `M${7 - x} ${y}h1v1h-1z`;
        }
      }
    }
    const title = label ? `<title>${esc(label)}</title>` : "";
    return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" role="img" aria-label="${esc(label || "Avatar")}">${title}<rect class="av-bg" width="8" height="8"/><path class="av-c${colour}" d="${d}"/></svg>`;
  }

  /* ---------- ?-blok til kontakter uden navn (16×16) ---------- */
  const Q_ROWS = [
    ".##############.",
    "#..............#",
    "#.#..........#.#",
    "#.....####.....#",
    "#....##..##....#",
    "#....##..##....#",
    "#........##....#",
    "#.......##.....#",
    "#......##......#",
    "#......##......#",
    "#..............#",
    "#......##......#",
    "#......##......#",
    "#.#..........#.#",
    "#..............#",
    ".##############.",
  ];
  const Q_PATH = bitmapPath(Q_ROWS);
  function questionBlock(label) {
    return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-label="${esc(label || "Kontakt uden navn")}"><rect class="av-q-bg" x="1" y="1" width="14" height="14"/><path class="av-q-fg" d="${Q_PATH}"/></svg>`;
  }

  /* ---------- Foto-kvantisering (uploads) ---------- */
  const RAMPS = {
    light: ["#0F380F", "#306230", "#8BAC0F", "#C9D89A"],
    dark: ["#0B0E1A", "#1D2B53", "#83769C", "#C2C3C7", "#FFF1E8"],
  };
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  /** Tager et HTMLImageElement, beskærer centreret kvadrat, nedskalerer til 40×40
   *  og mapper luminans til temaets rampe. Returnerer { light, dark } data-URL'er. */
  function quantizePhoto(img, size = 40) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - s) / 2;
    const sy = Math.max(0, (img.naturalHeight - s) / 2 - s * 0.08); // let mod ansigtet
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
    const src = ctx.getImageData(0, 0, size, size);
    const lum = new Float32Array(size * size);
    for (let i = 0; i < lum.length; i++) {
      const r = src.data[i * 4], g = src.data[i * 4 + 1], b = src.data[i * 4 + 2];
      lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const sorted = Array.from(lum).sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.floor(sorted.length * 0.98)] || 255;
    const out = {};
    for (const [name, ramp] of Object.entries(RAMPS)) {
      const rgb = ramp.map(hexToRgb);
      const dst = ctx.createImageData(size, size);
      for (let i = 0; i < lum.length; i++) {
        const t = Math.min(1, Math.max(0, (lum[i] - lo) / Math.max(1, hi - lo)));
        const k = Math.min(rgb.length - 1, Math.floor(t * rgb.length));
        dst.data[i * 4] = rgb[k][0]; dst.data[i * 4 + 1] = rgb[k][1]; dst.data[i * 4 + 2] = rgb[k][2]; dst.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(dst, 0, 0);
      out[name] = c.toDataURL("image/png");
    }
    return out;
  }

  /* ---------- 8-bit-lyde (firkantbølge, WebAudio) ---------- */
  let audioCtx = null;
  function tones(seq) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      let t = audioCtx.currentTime + 0.01;
      for (const [freq, dur] of seq) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.06, t);
        g.gain.setValueAtTime(0, t + dur - 0.005);
        o.connect(g).connect(audioCtx.destination);
        o.start(t); o.stop(t + dur);
        t += dur;
      }
    } catch (e) { /* lyd er valgfri */ }
  }
  const SOUNDS = {
    save:   [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.14]],
    delete: [[392, 0.09], [311, 0.09], [262, 0.09], [196, 0.22]],
    error:  [[147, 0.12], [117, 0.18]],
    select: [[880, 0.04]],
    done:   [[659, 0.08], [784, 0.08], [988, 0.08], [1319, 0.2]],
  };
  function sfx(name) { if (SOUNDS[name]) tones(SOUNDS[name]); }

  /* ---------- Skrivemaskine ---------- */
  function typewriter(el, opts = {}) {
    const full = el.getAttribute("data-type") || el.textContent;
    const still = opts.instant || document.documentElement.classList.contains("fx-still") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.setAttribute("aria-label", full);
    if (still) { el.textContent = full; return () => {}; }
    let i = 0, timer = null;
    const speed = opts.speed || 24;
    const visible = document.createElement("span");
    visible.setAttribute("aria-hidden", "true");
    const caret = document.createElement("span");
    caret.className = "caret blink";
    caret.setAttribute("aria-hidden", "true");
    el.textContent = "";
    el.append(visible, caret);
    const step = () => {
      i = Math.min(full.length, i + 1);
      visible.textContent = full.slice(0, i);
      if (i < full.length) timer = setTimeout(step, full[i - 1] === "." || full[i - 1] === "?" ? speed * 6 : speed);
    };
    step();
    return function finish() { clearTimeout(timer); visible.textContent = full; i = full.length; };
  }

  /* ---------- vCard ---------- */
  const TYPE_FROM_VCARD = { CELL: "mobil", MOBILE: "mobil", HOME: "hjem", WORK: "arbejde" };
  const TYPE_TO_VCARD = { mobil: "CELL", hjem: "HOME", arbejde: "WORK", andet: "OTHER" };

  function unescapeV(s) { return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }
  function escapeV(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1"); }
  function splitV(s) { return s.split(/(?<!\\);/).map(unescapeV); }

  function typeOf(params) {
    const m = params.match(/TYPE=([^;:]+)/i);
    if (!m) return "andet";
    for (const t of m[1].toUpperCase().split(",")) if (TYPE_FROM_VCARD[t]) return TYPE_FROM_VCARD[t];
    return "andet";
  }

  /** Returnerer { cards: [kontakt…], failures: [{ index, line, reason }], total } */
  function parseVcf(text) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const cards = [], failures = [];
    let cur = null, startLine = 0, idx = 0;
    const finish = () => {
      const c = cur;
      const hasName = c.given || c.family || c.org || c.fn;
      if (!hasName && !c.phones.length && !c.emails.length) {
        failures.push({ index: c._idx, line: c._line, reason: "Kortet har hverken navn, telefon eller e-mail" });
      } else {
        if (!c.given && !c.family && c.fn && !c.org) {
          const parts = c.fn.split(" ");
          c.family = parts.length > 1 ? parts.pop() : "";
          c.given = parts.join(" ");
        }
        delete c.fn; delete c._idx; delete c._line;
        cards.push(c);
      }
    };
    lines.forEach((raw, n) => {
      const line = raw.trimEnd();
      if (!line) return;
      if (/^BEGIN:VCARD$/i.test(line)) {
        if (cur) failures.push({ index: cur._idx, line: cur._line, reason: "Mangler END:VCARD" });
        idx++;
        cur = { _idx: idx, _line: n + 1, prefix: "", given: "", middle: "", family: "", suffix: "", nickname: "", title: "", org: "", fn: "",
          phones: [], emails: [], addresses: [], urls: [], birthday: "", note: "", photo: null };
        return;
      }
      if (/^END:VCARD$/i.test(line)) { if (cur) finish(); cur = null; return; }
      if (!cur) return;
      const colon = line.indexOf(":");
      if (colon < 0) return;
      const head = line.slice(0, colon), value = line.slice(colon + 1);
      const [nameRaw, ...paramParts] = head.split(";");
      const name = nameRaw.replace(/^item\d+\./i, "").toUpperCase();
      const params = paramParts.join(";");
      switch (name) {
        case "FN": cur.fn = unescapeV(value); break;
        case "N": { const p = splitV(value); cur.family = p[0] || ""; cur.given = p[1] || ""; cur.middle = p[2] || ""; cur.prefix = p[3] || ""; cur.suffix = p[4] || ""; break; }
        case "NICKNAME": cur.nickname = unescapeV(value); break;
        case "TITLE": cur.title = unescapeV(value); break;
        case "ORG": cur.org = splitV(value).filter(Boolean).join(", "); break;
        case "TEL": cur.phones.push({ type: typeOf(params), value: value.trim() }); break;
        case "EMAIL": cur.emails.push({ type: typeOf(params), value: value.trim() }); break;
        case "URL": cur.urls.push({ type: typeOf(params), value: unescapeV(value) }); break;
        case "ADR": { const p = splitV(value); cur.addresses.push({ type: typeOf(params), street: [p[1], p[2]].filter(Boolean).join(", "), city: p[3] || "", region: p[4] || "", postal: p[5] || "", country: p[6] || "" }); break; }
        case "BDAY": { const m = value.replace(/-/g, "").match(/^(\d{4})(\d{2})(\d{2})/); if (m) cur.birthday = `${m[1]}-${m[2]}-${m[3]}`; break; }
        case "NOTE": cur.note = unescapeV(value); break;
      }
    });
    if (cur) failures.push({ index: cur._idx, line: cur._line, reason: "Mangler END:VCARD" });
    return { cards, failures, total: cards.length + failures.length };
  }

  function toVcf(contacts, fullName) {
    const out = [];
    for (const c of contacts) {
      out.push("BEGIN:VCARD", "VERSION:3.0");
      out.push(`N:${[c.family, c.given, c.middle, c.prefix, c.suffix].map(escapeV).join(";")}`);
      out.push(`FN:${escapeV(fullName(c))}`);
      if (c.nickname) out.push(`NICKNAME:${escapeV(c.nickname)}`);
      if (c.org) out.push(`ORG:${escapeV(c.org)}`);
      if (c.title) out.push(`TITLE:${escapeV(c.title)}`);
      for (const p of c.phones) out.push(`TEL;TYPE=${TYPE_TO_VCARD[p.type] || "OTHER"}:${p.value}`);
      for (const e of c.emails) out.push(`EMAIL;TYPE=${TYPE_TO_VCARD[e.type] || "OTHER"}:${e.value}`);
      for (const a of c.addresses) out.push(`ADR;TYPE=${TYPE_TO_VCARD[a.type] || "OTHER"}:;;${[a.street, a.city, a.region, a.postal, a.country].map(escapeV).join(";")}`);
      for (const u of c.urls) out.push(`URL;TYPE=${TYPE_TO_VCARD[u.type] || "OTHER"}:${u.value}`);
      if (c.birthday) out.push(`BDAY:${c.birthday}`);
      if (c.note) out.push(`NOTE:${escapeV(c.note)}`);
      out.push(`UID:${c.id}`, "END:VCARD");
    }
    return out.join("\r\n") + "\r\n";
  }

  /* ---------- Diverse ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  window.Pixel = { icon, identicon, questionBlock, quantizePhoto, sfx, typewriter, parseVcf, toVcf, esc, fnv1a, ICONS };
})();

/* ==========================================================================
   PIXELBOG — pixel-hjælpere
   Ikoner (8×8), identicons, ?-blok, foto-kvantisering, 8-bit-lyde og
   skrivemaskine-effekt.
   ========================================================================== */
import { useEffect, useState } from "react";

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
} as const;

export type IconName = keyof typeof ICONS;

function bitmapPath(rows: readonly string[]): string {
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

const pathCache = new Map<IconName, string>();

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  let d = pathCache.get(name);
  if (!d) { d = bitmapPath(ICONS[name]); pathCache.set(name, d); }
  return (
    <svg className={`od-icon ${className}`.trim()} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

/* ---------- Hash ---------- */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* ---------- Identicon: 8×8, spejlsymmetrisk (venstre 4 kolonner = 32 bit) ---------- */
const identiconCache = new Map<string, { d: string; colour: number }>();

export function Identicon({ seed, label }: { seed: string; label?: string }) {
  const s = (seed || "?").trim().toLowerCase();
  let ic = identiconCache.get(s);
  if (!ic) {
    const bits = fnv1a(s);
    const colour = 1 + (fnv1a(s.split("").reverse().join("") + "#") % 5);
    let d = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const bit = (bits >>> (y * 4 + x)) & 1;
        // sikre en "krop": midterkolonnerne i rækkerne 2–5 er altid fyldt
        const forced = x === 3 && y >= 2 && y <= 5;
        const edge = y === 0 && x === 0;
        if ((bit || forced) && !edge) d += `M${x} ${y}h1v1h-1zM${7 - x} ${y}h1v1h-1z`;
      }
    }
    ic = { d, colour };
    identiconCache.set(s, ic);
  }
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" role="img" aria-label={label || "Avatar"}>
      {label ? <title>{label}</title> : null}
      <rect className="av-bg" width="8" height="8" />
      <path className={`av-c${ic.colour}`} d={ic.d} />
    </svg>
  );
}

/* ---------- ?-blok til kontakter uden navn (16×16) ---------- */
const Q_PATH = bitmapPath([
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
]);

export function QuestionBlock({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" role="img" aria-label={label || "Kontakt uden navn"}>
      <rect className="av-q-bg" x="1" y="1" width="14" height="14" />
      <path className="av-q-fg" d={Q_PATH} />
    </svg>
  );
}

/* ---------- Foto-kvantisering ---------- */
const RAMPS = {
  light: ["#0F380F", "#306230", "#8BAC0F", "#C9D89A"],
  dark: ["#0B0E1A", "#1D2B53", "#83769C", "#C2C3C7", "#FFF1E8"],
};
const hexToRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export interface PixelPhoto { light: string; dark: string }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Billedet kunne ikke indlæses"));
    img.src = src;
  });
}

/** Beskærer centreret kvadrat, nedskalerer til 40×40 og mapper luminans til temaets rampe. */
export function quantizeImage(img: HTMLImageElement, size = 40): PixelPhoto {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = Math.max(0, (img.naturalHeight - s) / 2 - s * 0.08); // let mod ansigtet
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  const src = ctx.getImageData(0, 0, size, size);
  const lum = new Float32Array(size * size);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = 0.2126 * src.data[i * 4] + 0.7152 * src.data[i * 4 + 1] + 0.0722 * src.data[i * 4 + 2];
  }
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)] || 255;
  const out = {} as PixelPhoto;
  for (const [name, ramp] of Object.entries(RAMPS) as [keyof PixelPhoto, string[]][]) {
    const rgb = ramp.map(hexToRgb);
    const dst = ctx.createImageData(size, size);
    for (let i = 0; i < lum.length; i++) {
      const t = Math.min(1, Math.max(0, (lum[i] - lo) / Math.max(1, hi - lo)));
      const k = Math.min(rgb.length - 1, Math.floor(t * rgb.length));
      dst.data.set([rgb[k][0], rgb[k][1], rgb[k][2], 255], i * 4);
    }
    ctx.putImageData(dst, 0, 0);
    out[name] = c.toDataURL("image/png");
  }
  return out;
}

// Rigtige fotos gemmes uændret i vCard'et; den pixelerede version laves kun til visning
const photoCache = new Map<string, Promise<PixelPhoto | null>>();
const photoDone = new Map<string, PixelPhoto | null>();

function cacheKey(src: string) {
  return `${src.length}:${fnv1a(src)}`;
}

export function pixelPhoto(src: string): Promise<PixelPhoto | null> {
  const k = cacheKey(src);
  let p = photoCache.get(k);
  if (!p) {
    p = loadImage(src).then((img) => quantizeImage(img)).catch(() => null)
      .then((r) => { photoDone.set(k, r); return r; });
    photoCache.set(k, p);
  }
  return p;
}

/** Returnerer den pixelerede udgave, når den er klar (null imens og ved fejl). */
export function usePixelPhoto(src: string | null): PixelPhoto | null {
  const [, force] = useState(0);
  const k = src ? cacheKey(src) : "";
  const ready = src ? photoDone.get(k) : null;
  useEffect(() => {
    if (!src || photoDone.has(k)) return;
    let live = true;
    pixelPhoto(src).then(() => { if (live) force((n) => n + 1); });
    return () => { live = false; };
  }, [src, k]);
  return ready ?? null;
}

/** Skalerer et uploadet billede ned til et kvadratisk JPEG, der er pænt på telefonen. */
export async function resizeForVCard(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- 8-bit-lyde (firkantbølge, WebAudio) ---------- */
let audioCtx: AudioContext | null = null;
function tones(seq: [number, number][]) {
  try {
    audioCtx = audioCtx || new AudioContext();
    let t = audioCtx.currentTime + 0.01;
    for (const [freq, dur] of seq) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.06, t);
      g.gain.setValueAtTime(0, t + dur - 0.005);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur);
      t += dur;
    }
  } catch { /* lyd er valgfri */ }
}
const SOUNDS = {
  save:   [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.14]],
  delete: [[392, 0.09], [311, 0.09], [262, 0.09], [196, 0.22]],
  error:  [[147, 0.12], [117, 0.18]],
  select: [[880, 0.04]],
  done:   [[659, 0.08], [784, 0.08], [988, 0.08], [1319, 0.2]],
} satisfies Record<string, [number, number][]>;
export type SoundName = keyof typeof SOUNDS;
export function sfx(name: SoundName) { tones(SOUNDS[name]); }

/* ---------- Skrivemaskine ---------- */
/** Skriver `full` frem tegn for tegn. Returnerer synlig tekst og en funktion, der springer til slut. */
export function useTypewriter(full: string, still: boolean, speed = 12): [string, boolean, () => void] {
  const [i, setI] = useState(still ? full.length : 0);
  useEffect(() => { setI(still ? full.length : 0); }, [full, still]);
  useEffect(() => {
    if (i >= full.length) return;
    const prev = full[i - 1];
    const t = setTimeout(() => setI((n) => Math.min(full.length, n + 1)), prev === "." || prev === "?" ? speed * 6 : speed);
    return () => clearTimeout(t);
  }, [i, full, speed]);
  return [full.slice(0, i), i < full.length, () => setI(full.length)];
}

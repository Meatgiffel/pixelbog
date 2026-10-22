/**
 * PIXELBOG design-tokens til React/TypeScript.
 * Spejler styles/tokens.css og tokens/tokens.json.
 * Brug CSS-variablerne (var(--c-panel) osv.) i komponenter, og disse
 * konstanter hvor JS har brug for værdien (canvas-kvantisering, identicons).
 */

export const palette = {
  dmg0: "#0F380F",
  dmg1: "#306230",
  dmg2: "#8BAC0F",
  dmg3: "#C9D89A",
  dmg4: "#E6EECB",
  dmg5: "#F5F8EC",
  wine: "#7E2553",
  crt0: "#0B0E1A",
  crt1: "#1D2B53",
  crt2: "#83769C",
  crt3: "#C2C3C7",
  crt4: "#FFF1E8",
  blue: "#29ADFF",
  green: "#00E436",
  yellow: "#FFEC27",
  pink: "#FF77A8",
  red: "#FF004D",
} as const;

export type ThemeName = "light" | "dark";

export interface ThemeRoles {
  ground: string;
  panel: string;
  panelHi: string;
  hover: string;
  frame: string;
  shadow: string;
  text: string;
  textSoft: string;
  line: string;
  selectBg: string;
  selectText: string;
  selectBar: string;
  cursor: string;
  focus: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  danger: string;
  onDanger: string;
  dangerText: string;
  ok: string;
  badgeBg: string;
  badgeText: string;
  toastBg: string;
  toastText: string;
  hp: string;
  hpEmpty: string;
  link: string;
  backdrop: string;
  bezel: string;
  bezelText: string;
  bezelShadow: string;
  avatarBg: string;
  avatarFg: readonly string[];
}

export const themes: Record<ThemeName, ThemeRoles> = {
  light: {
    ground: palette.dmg3,
    panel: palette.dmg4,
    panelHi: palette.dmg5,
    hover: palette.dmg5,
    frame: palette.dmg1,
    shadow: palette.dmg2,
    text: palette.dmg0,
    textSoft: palette.dmg1,
    line: palette.dmg2,
    selectBg: palette.dmg3,
    selectText: palette.dmg0,
    selectBar: palette.dmg1,
    cursor: palette.dmg0,
    focus: palette.wine,
    primary: palette.dmg1,
    onPrimary: palette.dmg5,
    secondary: palette.dmg5,
    onSecondary: palette.dmg0,
    danger: palette.wine,
    onDanger: palette.dmg5,
    dangerText: palette.wine,
    ok: palette.dmg0,
    badgeBg: palette.wine,
    badgeText: palette.dmg5,
    toastBg: palette.dmg0,
    toastText: palette.dmg5,
    hp: palette.dmg1,
    hpEmpty: palette.dmg5,
    link: palette.dmg0,
    backdrop: "rgba(15, 56, 15, .35)",
    bezel: palette.dmg3,
    bezelText: palette.dmg0,
    bezelShadow: palette.dmg2,
    avatarBg: palette.dmg5,
    avatarFg: [palette.dmg0, palette.dmg1, palette.wine, palette.dmg0, palette.dmg1],
  },
  dark: {
    ground: palette.crt0,
    panel: palette.crt1,
    panelHi: palette.crt0,
    hover: "rgba(255, 241, 232, .07)",
    frame: palette.crt2,
    shadow: palette.crt0,
    text: palette.crt4,
    textSoft: palette.crt3,
    line: "rgba(131, 118, 156, .55)",
    selectBg: palette.crt0,
    selectText: palette.crt4,
    selectBar: palette.blue,
    cursor: palette.yellow,
    focus: palette.yellow,
    primary: palette.blue,
    onPrimary: palette.crt0,
    secondary: palette.crt0,
    onSecondary: palette.crt4,
    danger: palette.red,
    onDanger: palette.crt0,
    dangerText: palette.pink,
    ok: palette.green,
    badgeBg: palette.yellow,
    badgeText: palette.crt0,
    toastBg: palette.crt4,
    toastText: palette.crt0,
    hp: palette.green,
    hpEmpty: palette.crt0,
    link: palette.blue,
    backdrop: "rgba(11, 14, 26, .7)",
    bezel: palette.crt0,
    bezelText: palette.crt4,
    bezelShadow: palette.crt0,
    avatarBg: palette.crt0,
    avatarFg: [palette.blue, palette.green, palette.yellow, palette.pink, palette.crt4],
  },
};

/** Luminans-ramper til foto-kvantisering (mørk → lys). */
export const photoRamp: Record<ThemeName, readonly string[]> = {
  light: [palette.dmg0, palette.dmg1, palette.dmg2, palette.dmg3],
  dark: [palette.crt0, palette.crt1, palette.crt2, palette.crt3, palette.crt4],
};

export const font = {
  /** Kun logo og titelskærm. */
  display: '"Press Start 2P", "Silkscreen", monospace',
  /** Korte overskrifter: paneltitler, A/B/C, sektioner, toast-titel. */
  pixel: '"Silkscreen", "Press Start 2P", monospace',
  /** Knapper, labels, menu, chips (vægt 600). */
  ui: '"IBM Plex Mono", ui-monospace, monospace',
  data: '"IBM Plex Mono", ui-monospace, monospace',
  dialog: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

/** Pixel-skrifter er kun skarpe på multipla af 8 px. */
export const fontSize = {
  displayXl: 32,
  displayL: 24,
  displayM: 16,
  ui: 16,
  dataL: 20,
  data: 16,
  dataS: 14,
  dialog: 18,
} as const;

export const lineHeight = { data: 1.5, ui: 1.25 } as const;

/** Pixel-grid: multipla af 4 px. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const border = { panel: 2, field: 2 } as const;
export const shadow = { offset: 4, press: 2 } as const;

export const size = {
  avatarS: 40,
  avatarM: 64,
  avatarL: 160,
  touch: 44,
  iconS: 16,
  iconM: 24,
  sidebar: 264,
  list: 384,
} as const;

export const motion = {
  press: 80,
  fast: 160,
  base: 240,
  exit: 160,
  blink: 1000,
  typePerChar: 12,
} as const;

export const breakpoint = { tablet: 768, desktop: 1024 } as const;

/**
 * Pixel-ramme med trappetrins-hjørner + hård skygge, som box-shadow.
 * Elementets egen flade er indholdsfladen; rammen ligger udenfor (husk margin).
 */
export function pixelFrame(frame: string, shadowColor?: string, bw = border.panel, off = shadow.offset): string {
  const ring = [`0 -${bw}px 0 0 ${frame}`, `0 ${bw}px 0 0 ${frame}`, `-${bw}px 0 0 0 ${frame}`, `${bw}px 0 0 0 ${frame}`];
  if (!shadowColor) return ring.join(", ");
  const drop = [`${off}px ${bw + off}px 0 0 ${shadowColor}`, `${bw + off}px ${off}px 0 0 ${shadowColor}`];
  return [...ring, ...drop].join(", ");
}

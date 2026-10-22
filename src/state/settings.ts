/* Indstillinger fra brugermenuen. Gemmes kun i denne browser. */
import { sfx, type SoundName } from "../lib/pixel";
import { createStore } from "./store";

export type ThemeSetting = "light" | "dark" | "system";

export interface Settings {
  theme: ThemeSetting;
  scan: boolean;
  motion: boolean;
  sound: boolean;
}

const KEY = "pixelbog.settings.v1";
const defaults: Settings = { theme: "system", scan: true, motion: true, sound: false };

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return defaults;
  }
}

export const settings = createStore<Settings>(load());

const mqDark = window.matchMedia("(prefers-color-scheme: dark)");

export function resolvedTheme(): "light" | "dark" {
  const t = settings.get().theme;
  return t === "system" ? (mqDark.matches ? "dark" : "light") : t;
}

function apply() {
  const s = settings.get();
  const html = document.documentElement;
  const theme = resolvedTheme();
  html.dataset.theme = theme;
  html.classList.toggle("fx-scan", s.scan && theme === "dark");
  html.classList.toggle("fx-still", !s.motion);
}

export function updateSettings(patch: Partial<Settings>) {
  settings.set(patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings.get())); } catch { /* privat tilstand */ }
}

export function play(name: SoundName) {
  if (settings.get().sound) sfx(name);
}

export function motionOff(): boolean {
  return !settings.get().motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

settings.subscribe(apply);
mqDark.addEventListener("change", apply);
apply();

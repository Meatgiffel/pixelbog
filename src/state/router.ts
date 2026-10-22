/* Hash-routing: #/bog/<bog>[/ny | /<kontakt>[/rediger]] */
import { createStore } from "./store";

export type Mode = "view" | "edit" | "new" | null;

export interface Route {
  bookId: string; // "alle" eller en bogs id
  contactId: string | null;
  mode: Mode;
}

export function parseHash(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  if (h[0] !== "bog") return { bookId: "alle", contactId: null, mode: null };
  const bookId = h[1] || "alle";
  if (h[2] === "ny") return { bookId, contactId: null, mode: "new" };
  if (h[2]) return { bookId, contactId: h[2], mode: h[3] === "rediger" ? "edit" : "view" };
  return { bookId, contactId: null, mode: null };
}

export function hashFor(r: Route): string {
  let s = "#/bog/" + encodeURIComponent(r.bookId);
  if (r.mode === "new") s += "/ny";
  else if (r.contactId) {
    s += "/" + encodeURIComponent(r.contactId);
    if (r.mode === "edit") s += "/rediger";
  }
  return s;
}

export const router = createStore<{ route: Route }>({ route: parseHash() });

/** Formularen sætter en vagt, mens der er ugemte ændringer. */
type Guard = (proceed: () => void) => boolean;
let guard: Guard | null = null;

export function setGuard(g: Guard | null) {
  guard = g;
}

export function go(r: Route, opts: { force?: boolean } = {}) {
  const h = hashFor(r);
  if (opts.force) guard = null;
  if (location.hash === h) { apply(r); return; }
  location.hash = h;
}

function apply(r: Route) {
  router.set({ route: r });
}

window.addEventListener("hashchange", () => {
  const next = parseHash();
  const cur = router.get().route;
  if (hashFor(next) === hashFor(cur)) return;
  if (guard && guard(() => go(next, { force: true }))) {
    // bliv stående, mens dialogen spørger
    history.replaceState(null, "", hashFor(cur));
    return;
  }
  apply(next);
});

export function resetRoute() {
  history.replaceState(null, "", location.pathname + location.search);
  apply({ bookId: "alle", contactId: null, mode: null });
}

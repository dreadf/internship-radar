// Tiny UI runtime: toast, anchored menu, filter panel (both anchored popovers at every width).
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let toastT;
export function toast(msg) {
  const t = $("#status"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
}

const root = () => $("#overlay");
let cur = null; // {kind, anchor, render, handler, popover}
const GAP = 6, MARGIN = 8;

/**
 * Anchor `panel` (position: fixed) to `anchor` using the trigger's bounding rect, in viewport coordinates.
 * Opens below the trigger, flips above when there is more room there, aligns to the trigger's nearer edge,
 * and clamps inside the viewport (shrinking max-height if neither side fits). Must run while the panel is visible.
 */
export function place(panel, anchor) {
  if (!anchor || !anchor.isConnected) return;
  panel.style.top = panel.style.left = "0px"; panel.style.maxHeight = "";
  const r = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const w = panel.offsetWidth, natural = panel.offsetHeight;
  const below = vh - r.bottom - GAP - MARGIN, above = r.top - GAP - MARGIN;
  const up = natural > below && above > below;
  const room = Math.max(120, up ? above : below);
  if (natural > room) panel.style.maxHeight = `${Math.floor(room)}px`;
  const hh = panel.offsetHeight;
  const top = up ? r.top - GAP - hh : r.bottom + GAP;
  const alignRight = r.left + r.width / 2 > vw / 2;
  const left = alignRight ? r.right - w : r.left;
  panel.style.top = `${Math.round(Math.max(MARGIN, Math.min(top, vh - hh - MARGIN)))}px`;
  panel.style.left = `${Math.round(Math.max(MARGIN, Math.min(left, vw - w - MARGIN)))}px`;
}
function mount(kind, anchor, render, handler, label) {
  close(false);
    cur = { kind, anchor, render, handler, t: performance.now() };
  root().innerHTML = `<div class="backdrop ${kind}-bd" data-close="1"></div><div class="${kind}" role="${kind === "sheet" ? "dialog" : "menu"}" ${kind === "sheet" ? 'aria-modal="true"' : ""} aria-label="${label}"></div>`;
  root().hidden = false; // measure while visible (offsetWidth is 0 under [hidden])
  paint();
  const panel = root().lastElementChild;
  place(panel, anchor);
  const f = panel.querySelector("button, select, input, a[href]");
  if (f) f.focus({ preventScroll: true });
  addEventListener("scroll", onScroll, true);
  addEventListener("resize", onResize);
}
const onScroll = (e) => {
  if (!cur || performance.now() - cur.t < 250 || (e.target instanceof Node && root().contains(e.target))) return; // ignore the settling scroll right after opening
  if (cur.kind === "menu") close(); // menus follow their trigger only until the page moves
};
const onResize = () => {
  if (!cur) return;
  if (cur.kind === "menu") close(); else place(root().lastElementChild, cur.anchor);
};
function paint() {
  if (!cur) return;
  const panel = root().lastElementChild;
  const a = document.activeElement;
  const key = a && panel.contains(a) ? a.dataset.k : null;
  const sc = panel.scrollTop;
  panel.innerHTML = cur.render();
  panel.scrollTop = sc;
  if (key) { const el = panel.querySelector(`[data-k="${CSS.escape(key)}"]`); if (el) el.focus({ preventScroll: true }); }
}
export const sheet = {
  open: (anchor, render, handler, label = "Filters") => mount("sheet", anchor, render, handler, label),
  refresh: paint,
};
export const menu = { open: (anchor, render, handler, label = "Menu") => mount("menu", anchor, render, handler, label) };
export function isOpen() { return !!cur; }
export function close(restore = true) {
  if (!cur) { if (root()) root().hidden = true; return; }
  const a = cur.anchor; cur = null;
  removeEventListener("scroll", onScroll, true); removeEventListener("resize", onResize);
  root().hidden = true; root().innerHTML = "";
  document.body.classList.remove("noscroll");
  if (restore && a && document.contains(a)) a.focus({ preventScroll: true });
}
/** Route events that happened inside the overlay to the open sheet/menu handler. Returns true if consumed. */
export function overlayEvent(e) {
  if (!cur || !root().contains(e.target)) return false;
  if (e.type === "click" && e.target.closest("[data-close]")) { close(); return true; }
  const el = e.target.closest("[data-s]");
  if (el && cur.handler) {
    const closeAfter = cur.handler(el, e) === "close";
    if (closeAfter) close(); else if (cur) paint();
  }
  return true;
}

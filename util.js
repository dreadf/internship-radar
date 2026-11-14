// Small helpers: escaping templates, dates, number formatting.

export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ENT[c]);

function val(v) {
  if (v == null || v === false) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join("");
  return esc(v);
}
/** Tagged template: interpolations are escaped unless wrapped in raw()/html``. */
export function html(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Raw(out);
}

export function safeUrl(u) {
  try {
    const x = new URL(u, location.href);
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : "";
  } catch (e) { return ""; }
}

const WIB_MS = 7 * 3600e3;
export const todayDay = () => Math.floor((Date.now() + WIB_MS) / 864e5);
export function isoDay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 864e5);
}
/** Days from today (WIB) to an ISO date; null if unknown. */
export function daysUntil(iso) {
  const d = isoDay(iso);
  return d == null ? null : d - todayDay();
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso) {
  const d = isoDay(iso);
  if (d == null) return "";
  const t = new Date(d * 864e5);
  return `${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
export function fmtMonth(ym) {
  if (!ym || !/^\d{4}-\d{2}/.test(ym)) return "";
  return `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

/** Short "closes" label for a deadline; null when unknown or past. tone: urgent <=3d, soon <=7d. */
export function closes(iso) {
  const n = daysUntil(iso);
  if (n == null || n < 0) return null;
  const text = n === 0 ? "Closes today" : n === 1 ? "Closes tomorrow" : n <= 60 ? `Closes in ${n} d` : `Closes ${fmtDate(iso).slice(0, -5)}`;
  return { text, n, cls: n <= 3 ? "urgent" : n <= 7 ? "soon" : "" };
}
export function countdown(iso) {
  const n = daysUntil(iso);
  if (n == null) return { text: "No deadline", cls: "", n: null };
  if (n < 0) return { text: "Closed", cls: "", n };
  const c = closes(iso);
  return { text: c.text, cls: c.cls, n };
}

export function fmtIdr(n) {
  if (n == null || !isFinite(n)) return "";
  const trim = (x) => String(x).replace(".", ",").replace(/,0$/, "");
  if (n >= 1e9) return `Rp ${trim((n / 1e9).toFixed(1))} M`;
  if (n >= 1e6) return `Rp ${n >= 1e8 ? Math.round(n / 1e6) : trim((n / 1e6).toFixed(1))} jt`;
  if (n >= 1e3) return `Rp ${Math.round(n / 1e3)} rb`;
  return `Rp ${n}`;
}
export const fmtIdrFull = (n) => (n == null ? "" : "Rp " + Number(n).toLocaleString("id-ID"));

export function ago(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export const num = (v, d = null) => (typeof v === "number" && isFinite(v) ? v : d);
/** Compare helper: nulls always last. dir = 1 asc, -1 desc */
export function cmpNull(a, b, dir = 1) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a === b ? 0 : (a < b ? -dir : dir);
}

const VIEWS = ["overview", "today", "internships", "competitions", "tracker", "item"];
/** Pure: location.hash -> {view, id, params}. The hash always wins; "today" is a legacy alias of overview; unknown view -> overview. */
export function parseRoute(hash) {
  let h = String(hash || "").replace(/^#\/?/, "");
  const qi = h.indexOf("?");
  const query = qi < 0 ? "" : h.slice(qi + 1);
  if (qi >= 0) h = h.slice(0, qi);
  const i = h.indexOf("/");
  const name = i < 0 ? h : h.slice(0, i);
  const view = name === "today" ? "overview" : VIEWS.includes(name) ? name : "overview";
  let id = "";
  if (view === "item" && i >= 0) { try { id = decodeURIComponent(h.slice(i + 1)); } catch (e) { id = h.slice(i + 1); } }
  const params = {};
  try { new URLSearchParams(query).forEach((v, k) => { params[k] = v; }); } catch (e) { /* ignore bad query */ }
  if (params.from === "today") params.from = "overview";
  return { view, id, params };
}
/** Inverse of parseRoute. Empty / false params are dropped. */
export function buildHash(view, params = {}, id = null) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v != null && v !== false) qs.set(k, String(v));
  const s = qs.toString();
  return `#/${view}${id != null ? "/" + encodeURIComponent(id) : ""}${s ? "?" + s : ""}`;
}

/** Navigate by hash. replace=true rewrites the current history entry and re-renders without a new entry. */
export function go(hash, replace = false) {
  if (replace) { history.replaceState(null, "", hash); dispatchEvent(new Event("hashchange")); } else location.hash = hash;
}

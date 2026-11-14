// localStorage access that never throws; tracker state; last-visit tracking.
const mem = {};
export function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
  catch (e) { return k in mem ? mem[k] : d; }
}
export function lsSet(k, v) {
  mem[k] = v;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
}

export const STATUSES = [
  { v: "saved", label: "Saved" },
  { v: "applied", label: "Applied" },
  { v: "interview", label: "Interview" },
  { v: "rejected", label: "Rejected" },
  { v: "ignored", label: "Ignored" },
];
const KEY = "ir.tracker.v1";
let cache = null;
const all = () => (cache ||= lsGet(KEY, {}) || {});
const persist = () => lsSet(KEY, all());

export const tracker = {
  all,
  get: (id) => all()[id] || null,
  status: (id) => (all()[id] ? all()[id].status || "" : ""),
  /** patch: {status?, note?}; snap: {title,kind,url,company} stored so items survive data refresh. */
  set(id, patch, snap) {
    const cur = all()[id] || {};
    const next = { ...cur, ...(snap || {}), ...patch, t: Date.now() };
    if (!next.status && !next.note) delete all()[id]; else all()[id] = next;
    persist();
  },
  clear(id) { delete all()[id]; persist(); },
  exportJson: () => JSON.stringify({ version: 1, exported_at: new Date().toISOString(), items: all() }, null, 2),
  importJson(text) {
    const d = JSON.parse(text);
    const items = d && d.items && typeof d.items === "object" ? d.items : null;
    if (!items) throw new Error("No items found");
    let n = 0;
    for (const [id, rec] of Object.entries(items)) {
      if (!rec || typeof rec !== "object") continue;
      const cur = all()[id];
      if (!cur || (rec.t || 0) >= (cur.t || 0)) { all()[id] = rec; n++; }
    }
    persist();
    return n;
  },
};

/**
 * Visit tracking. A "visit" is a session: reloads within 30 minutes keep the same
 * `prev` (the timestamp of the previous visit), so "New since your last visit"
 * does not vanish on refresh. Returns prev (ms epoch) or null on first ever visit.
 */
export function recordVisit(now = Date.now()) {
  const v = lsGet("ir.visit", null);
  if (v && typeof v.cur === "number" && now - v.cur < 30 * 60e3) {
    lsSet("ir.visit", { prev: v.prev ?? null, cur: now });
    return v.prev ?? null;
  }
  const prev = v && typeof v.cur === "number" ? v.cur : null;
  lsSet("ir.visit", { prev, cur: now });
  return prev;
}

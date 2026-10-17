// Internships + Competitions list views: segmented lane / tabs, sticky pill bar, toolbar, filter sheet, master/detail.
import { html, raw, buildHash, go, fmtIdr } from "./util.js";
import { icon } from "./icons.js";
import { lsGet, lsSet } from "./store.js";
import { rowFor } from "./cards.js";
import { detailFor } from "./detail.js";
import {
  D, CAT, MORE_ROLES, ROLE_PILLS, LANES, JOB_SORTS, JOB_PARAMS, COMP_SORTS, COMP_PARAMS, COMP_THEMES, MODE,
  jobMatches, sortJobs, roleCounts, laneCounts, compMatches, sortComps, isSoon, isMuted,
} from "./model.js";
import { sheet, menu, close as closeOverlay } from "./ui.js";

const PAGE = 40;
const limits = new Map();
let current = null; // {view, st}
const has = (p) => Object.keys(p).some((k) => k !== "from" && p[k] !== "");
const csv = (v) => (v ? String(v).split(",").filter(Boolean) : []);
const lastKey = (v) => `ir.last.${v}`;

/* ------------------------------------------------------------------ state <-> params */
export function jobState(p, item = null) {
  const bare = !item && !has(p), saved = lsGet(lastKey("internships"), {}) || {};
  const pick = (k, d) => p[k] || (bare ? saved[k] : "") || d;
  const sort = pick("sort", "fit");
  const st = { lane: item ? p.lane || item.lane : pick("lane", "take_now"), role: pick("role", "all"), sort: JOB_SORTS.some((s) => s.v === sort) ? sort : "fit" };
  if (item && !p.role && isMuted(item)) st.role = item.category;
  for (const k of JOB_PARAMS) if (!(k in st)) st[k] = p[k] || "";
  if (!["all", ...LANES.map((l) => l.v)].includes(st.lane)) st.lane = "take_now";
  return st;
}
export function compState(p, item = null) {
  const bare = !item && !has(p), saved = lsGet(lastKey("competitions"), {}) || {};
  const pick = (k, d) => p[k] || (bare ? saved[k] : "") || d;
  const sort = pick("sort", "fit");
  const st = { tab: item ? p.tab || (isSoon(item) ? "soon" : "open") : pick("tab", "open"), theme: pick("theme", "all"), sort: COMP_SORTS.some((s) => s.v === sort) ? sort : "fit" };
  for (const k of COMP_PARAMS) if (!(k in st)) st[k] = p[k] || "";
  if (st.tab !== "soon") st.tab = "open";
  return st;
}
const clean = (st) => Object.fromEntries(Object.entries(st).filter(([, v]) => v !== "" && v != null));
export const stateParams = (st) => clean(st);

function remember(view, st, keys) {
  // Muted roles (web development, unclassified) are never restored implicitly.
  lsSet(lastKey(view), Object.fromEntries(keys.map((k) => [k, k === "role" && MORE_ROLES.includes(st[k]) ? "all" : st[k]])));
}
function patch(view, patchObj, { replace = false, drop = [] } = {}) {
  const st = { ...current.st, ...patchObj };
  for (const k of drop) delete st[k];
  go(buildHash(view, clean(st)), replace);
}

/* ------------------------------------------------------------------ shared pieces */
function pill(label, count, href, on, cls = "") {
  return html`<a class="pill ${cls} ${on ? "on" : ""}" href="${href}" ${on ? raw('aria-current="true"') : ""}><span>${label}</span>${count != null ? html`<span class="n num">${count}</span>` : ""}</a>`;
}
function toolbar(view, st, sorts, placeholder, filterN) {
  return html`<div class="toolbar" role="search">
    <label class="search">${icon("search")}<span class="sr">Search</span><input type="search" id="q" data-k="q" value="${st.q}" placeholder="${placeholder}" autocomplete="off" enterkeyhint="search" aria-keyshortcuts="/"></label>
    <label class="sel"><span class="sr">Sort by</span><select data-act="sort" aria-label="Sort by">${sorts.map((s) => html`<option value="${s.v}" ${st.sort === s.v ? "selected" : ""}>${s.label}</option>`)}</select>${icon("down")}</label>
    <button class="btn btn-quiet filters-btn" type="button" data-act="filters" aria-haspopup="dialog">${icon("sliders")}<span class="lbl">Filters</span>${filterN ? html`<span class="badge num" aria-label="${filterN} active">${filterN}</span>` : ""}</button>
  </div>`;
}
function chipsRow(chips) {
  if (!chips.length) return "";
  return html`<div class="active-chips" aria-label="Active filters">${chips.map((c) => html`<button class="chip removable" type="button" data-act="rm" data-key="${c.key}" data-val="${c.val || ""}">${c.label}${icon("x")}<span class="sr"> remove filter</span></button>`)}
    <button class="link-btn" type="button" data-act="clear-filters">Clear all</button></div>`;
}
function skeleton() {
  return html`<div class="list">${[1, 2, 3, 4].map(() => html`<div class="row skel" aria-hidden="true"><div class="row-body"><i class="sk w70"></i><i class="sk w40"></i><i class="sk w90"></i></div></div>`)}</div>`;
}
export { skeleton };

function emptyState(view, st, suggest) {
  return html`<div class="empty"><p class="empty-t">${suggest.title}</p>${suggest.link ? html`<p><a class="btn" href="${suggest.link.href}">${suggest.link.label}${icon("arrow")}</a></p>` : ""}${suggest.clear ? html`<p><button class="link-btn" type="button" data-act="clear-filters">Clear filters</button></p>` : ""}</div>`;
}

/* ------------------------------------------------------------------ chrome shared by both views */
function layout(view, ctx, listHtml, detailHtml, sig) {
  const wide = ctx.wide;
  return html`<div class="browse ${wide ? "two-pane" : ""}">
    <section class="pane-list" id="pane-list" data-sig="${sig}" data-scroll="list">${listHtml}</section>
    ${wide ? html`<div class="splitter" id="splitter" role="separator" aria-orientation="vertical" aria-label="Resize list" tabindex="0" title="Drag to resize. Double-click to reset."></div>` : ""}
    ${wide ? html`<section class="pane-detail" id="pane-detail" data-scroll="detail" aria-label="Details">${detailHtml}</section>` : ""}
  </div>`;
}
function placeholder(label) {
  return html`<div class="detail-empty"><p>${label}</p><p class="muted-t">Use <kbd>j</kbd>/<kbd>k</kbd> to move, <kbd>Enter</kbd> to open, <kbd>s</kbd> to save.</p></div>`;
}
function setDetail(view, ctx) {
  const it = ctx.selectedId ? D.byId.get(ctx.selectedId) : null;
  const back = buildHash(view, clean(current.st));
  if (it) return detailFor(it, { back });
  return placeholder(view === "internships" ? "Select an internship to see details" : "Select a competition to see details");
}
function paintSelection(ctx) {
  document.querySelectorAll("#pane-list [data-row]").forEach((r) => {
    const on = r.dataset.row === ctx.selectedId;
    r.classList.toggle("selected", on);
    if (on) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current");
  });
}

/* ------------------------------------------------------------------ resizable list pane (>= 1024px) */
const LISTW_KEY = "ir.listw", LISTW_DEFAULT = 520, LISTW_MIN = 340, LISTW_STEP = 16;
let listW = null;
const browseEl = () => document.querySelector(".browse.two-pane");
const maxListW = () => { const b = browseEl(); return Math.max(LISTW_MIN, Math.floor((b ? b.clientWidth : document.documentElement.clientWidth) * 0.65)); };
const clampW = (w) => Math.round(Math.max(LISTW_MIN, Math.min(maxListW(), w)));
function applyListW(w, persist = false) {
  listW = clampW(w);
  document.documentElement.style.setProperty("--list-w", `${listW}px`);
  const sp = document.getElementById("splitter");
  if (sp) {
    sp.setAttribute("aria-valuemin", String(LISTW_MIN)); sp.setAttribute("aria-valuemax", String(maxListW()));
    sp.setAttribute("aria-valuenow", String(listW)); sp.setAttribute("aria-valuetext", `${listW} pixels`);
  }
  if (persist) lsSet(LISTW_KEY, listW);
}
const savedListW = () => { const v = Number(lsGet(LISTW_KEY, null)); return Number.isFinite(v) && v > 0 ? v : LISTW_DEFAULT; };
function initSplitter() {
  let drag = null;
  document.addEventListener("pointerdown", (e) => {
    const sp = e.target.closest && e.target.closest("#splitter");
    if (!sp || e.button > 0) return;
    e.preventDefault();
    drag = { id: e.pointerId, left: browseEl().getBoundingClientRect().left, sp };
    try { sp.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    sp.classList.add("active"); document.body.classList.add("resizing");
  });
  document.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) applyListW(e.clientX - drag.left); });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    try { drag.sp.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    drag.sp.classList.remove("active"); document.body.classList.remove("resizing");
    drag = null; lsSet(LISTW_KEY, listW);
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  document.addEventListener("dblclick", (e) => {
    if (e.target.closest && e.target.closest("#splitter")) { lsSet(LISTW_KEY, null); applyListW(LISTW_DEFAULT); }
  });
  document.addEventListener("keydown", (e) => {
    if (!e.target.closest || !e.target.closest("#splitter")) return;
    const step = e.shiftKey ? LISTW_STEP * 4 : LISTW_STEP, cur = listW || savedListW();
    const next = { ArrowLeft: cur - step, ArrowRight: cur + step, Home: LISTW_MIN, End: maxListW() }[e.key];
    if (next == null) return;
    e.preventDefault(); applyListW(next, true);
  });
  addEventListener("resize", () => { if (browseEl()) applyListW(listW || savedListW()); });
}
initSplitter();

/** Render into `main`. If only the selected item changed on a wide screen, update the detail pane in place. */
function mountView(main, view, ctx, sig, listHtml) {
  const pane = document.getElementById("pane-list");
  if (ctx.wide && pane && pane.dataset.sig === sig && !pane.dataset.stale && main.querySelector(".browse.two-pane")) {
    paintSelection(ctx);
    applyListW(listW || savedListW());
    const d = document.getElementById("pane-detail");
    d.innerHTML = setDetail(view, ctx).toString();
    d.scrollTop = 0;
    return;
  }
  const keepSearch = document.activeElement && document.activeElement.id === "q";
  const caret = keepSearch ? document.activeElement.selectionStart : 0;
  const prevScroll = pane && pane.dataset.sig === sig ? pane.scrollTop : 0;
  const od = document.getElementById("pane-detail");
  const prevDetail = od && od.querySelector("[data-detail]") && od.querySelector("[data-detail]").dataset.detail === ctx.selectedId ? od.scrollTop : 0;
  main.innerHTML = layout(view, ctx, listHtml, ctx.wide ? setDetail(view, ctx) : "", sig).toString();
  if (ctx.wide) applyListW(listW || savedListW());
  const np = document.getElementById("pane-list");
  if (prevScroll && np) np.scrollTop = prevScroll;
  const nd = document.getElementById("pane-detail");
  if (prevDetail && nd) nd.scrollTop = prevDetail;
  const bar = main.querySelector(".pills");
  const on = bar && bar.querySelector(".pill.on");
  if (on) bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2);
  if (keepSearch) { const q = document.getElementById("q"); if (q) { q.focus(); q.setSelectionRange(caret, caret); } }
  if (ctx.selectedId && ctx.wide) {
    const r = main.querySelector(`[data-row="${CSS.escape(ctx.selectedId)}"]`);
    if (r && !prevScroll) r.scrollIntoView({ block: "nearest" });
  }
}

/* ------------------------------------------------------------------ INTERNSHIPS */
function jobChips(st) {
  const c = [];
  if (st.q) c.push({ key: "q", label: `“${st.q}”` });
  for (const m of csv(st.mode)) c.push({ key: "mode", val: m, label: MODE[m] || m });
  for (const m of csv(st.pay)) c.push({ key: "pay", val: m, label: m === "paid" ? "Paid" : m === "unpaid" ? "Unpaid" : "Pay unknown" });
  if (st.elig === "ok") c.push({ key: "elig", label: "Eligible only" });
  if (st.city) c.push({ key: "city", label: st.city });
  if (st.src) c.push({ key: "src", label: st.src });
  if (st.due) c.push({ key: "due", label: `Closes ≤ ${st.due} d` });
  if (st.new) c.push({ key: "new", label: "New since last visit" });
  return c;
}
const jobFilterCount = (st) => jobChips(st).filter((c) => c.key !== "q").length;

function jobSheet() {
  const st = current.st;
  const laneItems = D.jobs.filter((j) => jobMatches(j, { lane: st.lane, role: st.role }, { skipRole: false }));
  const cnt = (get) => { const m = new Map(); for (const j of laneItems) { const v = get(j); if (v) m.set(v, (m.get(v) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30); };
  const sel = (list, k) => list.includes(k);
  const tog = (key, val, label, on) => html`<button class="chip toggle ${on ? "on" : ""}" type="button" data-s="toggle:${key}:${val}" data-k="${key}-${val}" aria-pressed="${on}">${label}</button>`;
  const n = D.jobs.filter((j) => jobMatches(j, st)).length;
  const modes = csv(st.mode), pays = csv(st.pay);
  return html`<div class="sh-head"><h2>Filters</h2><button class="icon-btn" type="button" data-close="1" aria-label="Close filters">${icon("x")}</button></div>
    <div class="sh-body">
      <fieldset><legend>Work mode</legend><div class="tagrow">${["remote", "hybrid", "onsite"].map((m) => tog("mode", m, MODE[m], sel(modes, m)))}</div></fieldset>
      <fieldset><legend>Pay</legend><div class="tagrow">${[["paid", "Paid"], ["unpaid", "Unpaid"], ["unknown", "Unknown"]].map(([v, l]) => tog("pay", v, l, sel(pays, v)))}</div></fieldset>
      <fieldset><legend>Other</legend><div class="tagrow">
        ${tog("elig", "ok", "Hide unclear eligibility", st.elig === "ok")}${tog("due", "14", "Closes within 14 days", st.due === "14")}${tog("new", "1", "New since last visit", !!st.new)}</div></fieldset>
      <label class="field"><span>City</span><select data-s="set:city" data-k="city"><option value="">Any city</option>${cnt((j) => j.city).map(([v, k]) => html`<option value="${v}" ${st.city === v ? "selected" : ""}>${v} (${k})</option>`)}</select></label>
      <label class="field"><span>Source</span><select data-s="set:src" data-k="src"><option value="">Any source</option>${cnt((j) => j.source_label).map(([v, k]) => html`<option value="${v}" ${st.src === v ? "selected" : ""}>${v} (${k})</option>`)}</select></label>
    </div>
    <div class="sh-foot"><button class="btn btn-quiet" type="button" data-s="clear">Clear</button><button class="btn btn-primary" type="button" data-s="done">Show ${n} result${n === 1 ? "" : "s"}</button></div>`;
}
function sheetHandler(view, keys) {
  return (el, e) => {
    const [op, key, ...rest] = el.dataset.s.split(":");
    const val = rest.join(":");
    const st = { ...current.st };
    if (op === "done") return "close";
    if (op === "clear") { for (const k of keys) st[k] = ""; }
    else if (op === "set") st[key] = el.value;
    else if (op === "toggle") {
      if (key === "mode" || key === "pay") {
        const a = csv(st[key]); const i = a.indexOf(val); if (i >= 0) a.splice(i, 1); else a.push(val); st[key] = a.join(",");
      } else st[key] = st[key] === val ? "" : val;
    }
    go(buildHash(view, clean(st)), true);
    return null;
  };
}
const JOB_SHEET_KEYS = ["mode", "pay", "elig", "city", "src", "due", "new"];

export function renderInternships(main, ctx) {
  const item = ctx.item || null;
  const st = jobState(ctx.params, item);
  current = { view: "internships", st };
  if (has(ctx.params) && !item) remember("internships", st, ["lane", "role", "sort"]);
  if (!has(ctx.params) && !item) history.replaceState(null, "", buildHash("internships", clean(st)));
  const sig = "i:" + JSON.stringify(clean(st));
  if (!limits.has(sig)) { limits.clear(); limits.set(sig, PAGE); }

  const hrefFor = (patchObj) => buildHash("internships", clean({ ...st, ...patchObj }));
  const lc = laneCounts({ ...st, role: st.role });
  const rc = roleCounts(st);
  const items = sortJobs(D.jobs.filter((j) => jobMatches(j, st)), st.sort);
  const lane = LANES.find((l) => l.v === st.lane);
  const moreOn = MORE_ROLES.includes(st.role);
  const rowCtx = { from: "internships", params: clean(st), selectedId: ctx.selectedId || "", wide: ctx.wide };
  const shown = items.slice(0, limits.get(sig));
  const roleLabel = st.role === "all" ? "" : CAT[st.role];

  let body;
  if (!items.length) {
    const alt = LANES.filter((l) => l.v !== st.lane && D.jobs.some((j) => jobMatches(j, { ...st, lane: l.v })));
    const best = alt.map((l) => ({ l, n: D.jobs.filter((j) => jobMatches(j, { ...st, lane: l.v })).length })).sort((a, b) => b.n - a.n)[0];
    body = emptyState("internships", st, {
      title: `No ${roleLabel ? roleLabel + " " : ""}internships ${lane ? "in " + lane.label : "match"}${jobChips(st).length ? " with these filters" : ""}${best ? ` — ${best.n} in ${best.l.label}` : ""}.`,
      link: best ? { href: hrefFor({ lane: best.l.v }), label: `Open ${best.l.label}` } : null,
      clear: jobChips(st).length > 0,
    });
  } else {
    body = html`<div class="list" role="list">${shown.map((j) => html`<div role="listitem">${rowFor(j, rowCtx)}</div>`)}</div>
      ${items.length > shown.length ? html`<div class="more-wrap"><button class="btn" type="button" data-act="more">Show ${Math.min(PAGE, items.length - shown.length)} more <span class="muted-t">of ${items.length - shown.length} left</span></button></div>` : ""}`;
  }
  const listHtml = html`
    <div class="controls">
      <nav class="seg" aria-label="Lane">${LANES.map((l) => html`<a href="${hrefFor({ lane: l.v })}" class="${st.lane === l.v ? "on" : ""}" ${st.lane === l.v ? raw('aria-current="true"') : ""}><span>${l.label}</span><span class="n num">${lc[l.v]}</span></a>`)}</nav>
      <p class="help">${lane ? lane.help : html`Showing every lane. Pick one to narrow down.`}</p>
    </div>
    <div class="pillbar"><div class="pills" aria-label="Role">
      ${pill("All", rc.all || 0, hrefFor({ role: "all" }), st.role === "all")}
      ${ROLE_PILLS.map((r) => pill(CAT[r], rc[r] || 0, hrefFor({ role: r }), st.role === r, (rc[r] || 0) === 0 ? "zero" : ""))}
      <button class="pill more ${moreOn ? "on" : ""}" type="button" data-act="more-roles" aria-haspopup="menu"><span>${moreOn ? CAT[st.role] : "More"}</span>${moreOn ? html`<span class="n num">${rc[st.role] || 0}</span>` : ""}${icon("down")}</button>
    </div></div>
    ${toolbar("internships", st, JOB_SORTS, "Search", jobFilterCount(st))}
    ${chipsRow(jobChips(st))}
    <p class="result-count" aria-live="polite">${items.length} internship${items.length === 1 ? "" : "s"}${roleLabel ? ` · ${roleLabel}` : ""}</p>
    ${body}`;
  mountView(main, "internships", ctx, sig, listHtml);
}

/* ------------------------------------------------------------------ COMPETITIONS */
function compChips(st) {
  const c = [];
  if (st.q) c.push({ key: "q", label: `“${st.q}”` });
  if (st.team) c.push({ key: "team", label: st.team === "solo" ? "Solo OK" : "Team 2–3 OK" });
  if (st.scope) c.push({ key: "scope", label: { global: "Global", indonesia: "Indonesia", students: "Students" }[st.scope] || st.scope });
  if (st.plat) c.push({ key: "plat", label: st.plat });
  if (st.prize) c.push({ key: "prize", label: `Prize ≥ ${fmtIdr(Number(st.prize))}` });
  return c;
}
const compFilterCount = (st) => compChips(st).filter((c) => c.key !== "q").length;

function compSheet() {
  const st = current.st;
  const plats = new Map();
  for (const c of D.comps) if (c.platform) plats.set(c.platform, (plats.get(c.platform) || 0) + 1);
  const tog = (key, val, label) => html`<button class="chip toggle ${st[key] === val ? "on" : ""}" type="button" data-s="toggle:${key}:${val}" data-k="${key}-${val}" aria-pressed="${st[key] === val}">${label}</button>`;
  const n = D.comps.filter((c) => compMatches(c, st)).length;
  return html`<div class="sh-head"><h2>Filters</h2><button class="icon-btn" type="button" data-close="1" aria-label="Close filters">${icon("x")}</button></div>
    <div class="sh-body">
      <fieldset><legend>Team</legend><div class="tagrow">${tog("team", "solo", "Solo OK")}${tog("team", "team", "Team 2–3 OK")}</div></fieldset>
      <fieldset><legend>Scope</legend><div class="tagrow">${tog("scope", "global", "Global")}${tog("scope", "indonesia", "Indonesia")}${tog("scope", "students", "Students")}</div></fieldset>
      <fieldset><legend>Minimum prize</legend><div class="tagrow">${tog("prize", "10000000", "Rp 10 jt+")}${tog("prize", "100000000", "Rp 100 jt+")}${tog("prize", "1000000000", "Rp 1 M+")}</div></fieldset>
      <label class="field"><span>Platform</span><select data-s="set:plat" data-k="plat"><option value="">Any platform</option>${[...plats.entries()].sort((a, b) => b[1] - a[1]).map(([v, k]) => html`<option value="${v}" ${st.plat === v ? "selected" : ""}>${v} (${k})</option>`)}</select></label>
    </div>
    <div class="sh-foot"><button class="btn btn-quiet" type="button" data-s="clear">Clear</button><button class="btn btn-primary" type="button" data-s="done">Show ${n} result${n === 1 ? "" : "s"}</button></div>`;
}
const COMP_SHEET_KEYS = ["team", "scope", "plat", "prize"];

export function renderCompetitions(main, ctx) {
  const item = ctx.item || null;
  const st = compState(ctx.params, item);
  current = { view: "competitions", st };
  if (has(ctx.params) && !item) remember("competitions", st, ["theme", "sort"]);
  if (!has(ctx.params) && !item) history.replaceState(null, "", buildHash("competitions", clean(st)));
  const sig = "c:" + JSON.stringify(clean(st));
  if (!limits.has(sig)) { limits.clear(); limits.set(sig, PAGE); }
  const hrefFor = (patchObj) => buildHash("competitions", clean({ ...st, ...patchObj }));

  const base = D.comps.filter((c) => compMatches(c, st, { skipTab: true, skipTheme: true }));
  const open = base.filter((c) => !isSoon(c)), soon = base.filter(isSoon);
  const tabItems = st.tab === "soon" ? soon : open;
  const themeCount = (t) => tabItems.filter((c) => t === "all" || c.theme === t).length;
  const items = sortComps(tabItems.filter((c) => st.theme === "all" || c.theme === st.theme), st.sort);
  const rowCtx = { from: "competitions", params: clean(st), selectedId: ctx.selectedId || "", wide: ctx.wide };
  const shown = items.slice(0, limits.get(sig));
  const filtersOn = compChips(st).length > 0 || st.np;

  let body;
  if (!items.length) {
    const other = st.tab === "soon" ? open : soon;
    body = emptyState("competitions", st, {
      title: `No competitions ${st.tab === "soon" ? "opening soon" : "open now"} match${filtersOn ? " these filters" : ""}${other.length ? ` — ${other.length} in ${st.tab === "soon" ? "Open now" : "Opening soon"}` : ""}.`,
      link: other.length ? { href: hrefFor({ tab: st.tab === "soon" ? "open" : "soon" }), label: st.tab === "soon" ? "Open now" : "Opening soon" } : null,
      clear: filtersOn,
    });
  } else {
    body = html`<div class="list" role="list">${shown.map((c) => html`<div role="listitem">${rowFor(c, rowCtx)}</div>`)}</div>
      ${items.length > shown.length ? html`<div class="more-wrap"><button class="btn" type="button" data-act="more">Show ${Math.min(PAGE, items.length - shown.length)} more <span class="muted-t">of ${items.length - shown.length} left</span></button></div>` : ""}`;
  }
  const listHtml = html`
    <div class="controls">
      <nav class="seg" aria-label="Competition status"><a href="${hrefFor({ tab: "open" })}" class="${st.tab === "open" ? "on" : ""}" ${st.tab === "open" ? raw('aria-current="true"') : ""}><span>Open now</span><span class="n num">${open.length}</span></a>
        <a href="${hrefFor({ tab: "soon" })}" class="${st.tab === "soon" ? "on" : ""}" ${st.tab === "soon" ? raw('aria-current="true"') : ""}><span>Opening soon</span><span class="n num">${soon.length}</span></a></nav>
      ${st.tab === "soon" ? html`<p class="help">Opening soon = calendar estimates of yearly competitions. Dates are approximate.</p>` : ""}
    </div>
    <div class="pillbar"><div class="pills" aria-label="Theme">
      <a class="pill np ${st.np ? "on" : ""}" href="${hrefFor({ np: st.np ? "" : "1" })}" role="switch" aria-checked="${!!st.np}">${icon("check")}<span>Online · No pitch</span></a>
      ${pill("All", themeCount("all"), hrefFor({ theme: "all" }), st.theme === "all")}
      ${COMP_THEMES.map(([v, l]) => pill(l, themeCount(v), hrefFor({ theme: v }), st.theme === v, themeCount(v) === 0 ? "zero" : ""))}
    </div></div>
    ${toolbar("competitions", st, COMP_SORTS, "Search", compFilterCount(st))}
    ${chipsRow(compChips(st))}
    <p class="result-count" aria-live="polite">${items.length} competition${items.length === 1 ? "" : "s"}</p>
    ${body}`;
  mountView(main, "competitions", ctx, sig, listHtml);
}

/* ------------------------------------------------------------------ events (delegated from app.js) */
let searchT;
export function browseInput(e) {
  if (!current || e.target.id !== "q") return false;
  clearTimeout(searchT);
  const v = e.target.value.trim();
  searchT = setTimeout(() => patch(current.view, { q: v }, { replace: true }), 180);
  return true;
}
export function browseChange(e) {
  const el = e.target;
  if (!current || el.dataset.act !== "sort") return false;
  patch(current.view, { sort: el.value }, { replace: true });
  return true;
}
export function browseClick(e) {
  if (!current) return false;
  const b = e.target.closest("[data-act]");
  if (!b) return false;
  const act = b.dataset.act, view = current.view;
  if (act === "filters") {
    sheet.open(b, view === "internships" ? jobSheet : compSheet, sheetHandler(view, view === "internships" ? JOB_SHEET_KEYS : COMP_SHEET_KEYS));
    return true;
  }
  if (act === "more-roles") {
    const rc = roleCounts(current.st);
    menu.open(b, () => html`${MORE_ROLES.map((r) => html`<button role="menuitemradio" aria-checked="${current.st.role === r}" class="menu-item" type="button" data-s="role:${r}"><span>${CAT[r]}</span><span class="n num">${rc[r] || 0}</span></button>`)}`,
      (el) => { go(buildHash("internships", clean({ ...current.st, role: el.dataset.s.split(":")[1] }))); return "close"; }, "More roles");
    return true;
  }
  if (act === "rm") {
    const st = { ...current.st }, k = b.dataset.key, v = b.dataset.val;
    if (v && ["mode", "pay"].includes(k)) st[k] = csv(st[k]).filter((x) => x !== v).join(","); else st[k] = "";
    go(buildHash(view, clean(st)), true);
    return true;
  }
  if (act === "clear-filters") {
    const st = { ...current.st };
    for (const k of (view === "internships" ? [...JOB_SHEET_KEYS, "q"] : [...COMP_SHEET_KEYS, "q", "np"])) st[k] = "";
    go(buildHash(view, clean(st)), true);
    return true;
  }
  if (act === "more") {
    const sig = [...limits.keys()][0];
    limits.set(sig, (limits.get(sig) || PAGE) + PAGE);
    invalidate();
    go(location.hash, true);
    return true;
  }
  return false;
}
/** Force the next render to rebuild the list pane (e.g. after a tracker change). */
export function invalidate() { const p = document.getElementById("pane-list"); if (p) p.dataset.stale = "1"; }
export function leaveBrowse() { current = null; closeOverlay(false); }
export const browseState = () => current;
export function refreshSheet() { sheet.refresh(); }

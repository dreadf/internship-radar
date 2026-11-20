// Boot, router, global events. List state lives in the URL hash; see util.js parseRoute/buildHash.
import { html, parseRoute, buildHash, go, safeUrl } from "./util.js";
import { icon } from "./icons.js";
import { tracker, recordVisit } from "./store.js";
import { D, loadData } from "./model.js";
import { detailFor } from "./detail.js";
import { renderOverview, overviewSkeleton } from "./overview.js";
import { renderTracker, trackerClick, trackedCount, initTrackerDnD } from "./tracker.js";
import {
  renderInternships, renderCompetitions, browseClick, browseInput, browseChange, invalidate, leaveBrowse, skeleton,
} from "./browse.js";
import { $, $$, toast, overlayEvent, close as closeOverlay, isOpen, sheet } from "./ui.js";

const main = $("#main");
const WIDE = matchMedia("(min-width: 1024px)");
const snap = (it) => ({ title: it.title, kind: it._kind, url: it.apply_url || "", company: it.company || it.organizer || "" });
let lastKey = "";
let loadedAt = Date.now();

/* ------------------------------------------------------------------ theme */
function themeIsDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}
function paintTheme() {
  const b = $("#theme-btn"); if (!b) return;
  const dark = themeIsDark();
  b.innerHTML = icon(dark ? "sun" : "moon").toString();
  b.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}
$("#theme-btn").addEventListener("click", () => {
  const next = themeIsDark() ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ir.theme", next); } catch (e) { /* storage unavailable */ }
  paintTheme();
});

/* ------------------------------------------------------------------ nav */
function paintNav(view) {
  $$("#nav a").forEach((a) => {
    const on = a.dataset.view === view;
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const n = trackedCount(), b = $("#nav-count");
  if (b) { b.textContent = String(n); b.hidden = n === 0; b.setAttribute("aria-label", `${n} saved or applied`); }
}

/* ------------------------------------------------------------------ routing */
function listParams(p) { const { from, ...rest } = p; return rest; }
function setTitle(t) { document.title = t ? `${t} · Inra` : "Inra"; }

function renderItem(r) {
  const it = D.byId.get(r.id);
  const p = listParams(r.params);
  if (!it) {
    const t = tracker.get(r.id);
    const u = t && safeUrl(t.url);
    main.className = "page";
    main.innerHTML = html`<div class="empty narrow"><p class="empty-t">${t ? `“${t.title}” is no longer listed.` : "This posting is not in the current list."}</p>
      <p class="muted-t">It may have closed or been filtered out.</p>
      <p>${u ? html`<a class="btn" href="${u}" target="_blank" rel="noopener noreferrer">Open original link${icon("external")}</a> ` : ""}<a class="btn" href="#/overview">Go to Overview</a></p></div>`.toString();
    setTitle("Not found");
    return;
  }
  setTitle(it.title);
  const from = r.params.from || (it._kind === "job" ? "internships" : "competitions");
  const listFrom = from === "internships" || from === "competitions";
  if (WIDE.matches && listFrom) {
    main.className = "page page-wide";
    const ctx = { params: p, item: it, selectedId: String(it.id), wide: true };
    (from === "internships" ? renderInternships : renderCompetitions)(main, ctx);
    return;
  }
  main.className = "page page-narrow";
  const back = from === "overview" ? "#/overview" : buildHash(from === "tracker" || listFrom ? from : "overview", p);
  main.innerHTML = detailFor(it, { back }).toString();
  main.scrollTop = 0;
}

function route() {
  // Legacy alias: #/today[...] -> #/overview[...] (rewrite in place so old links and bookmarks keep working).
  if (/^#\/today(?=[/?]|$)/.test(location.hash)) history.replaceState(null, "", location.hash.replace("#/today", "#/overview"));
  const r = parseRoute(location.hash);
  const navView = r.view === "item" ? (r.params.from || (D.byId.get(r.id)?._kind === "comp" ? "competitions" : "internships")) : r.view;
  paintNav(["overview", "internships", "competitions", "tracker"].includes(navView) ? navView : "internships");
  const f = r.params.from || "";
  const key = r.view === "item" && !(WIDE.matches && (f === "internships" || f === "competitions")) ? "item:" + f : r.view === "item" ? f : r.view;
  if (key !== lastKey) { leaveBrowse(); closeOverlay(false); window.scrollTo(0, 0); }
  lastKey = key;
  if (!D.loaded) {
    const ov = r.view === "overview" && !D.error;
    main.className = ov ? "page page-ov" : "page";
    main.innerHTML = D.error ? errorHtml() : ov ? overviewSkeleton().toString() : html`<div class="page-pad">${skeleton()}</div>`.toString();
    return;
  }
  if (D.error && !D.jobs.length && !D.comps.length) { main.className = "page"; main.innerHTML = errorHtml(); return; }
  switch (r.view) {
    case "item": renderItem(r); break;
    case "internships":
      setTitle("Internships"); main.className = WIDE.matches ? "page page-wide" : "page";
      renderInternships(main, { params: r.params, selectedId: "", wide: WIDE.matches }); break;
    case "competitions":
      setTitle("Competitions"); main.className = WIDE.matches ? "page page-wide" : "page";
      renderCompetitions(main, { params: r.params, selectedId: "", wide: WIDE.matches }); break;
    case "tracker": setTitle("Tracker"); main.className = "page"; renderTracker(main, r.params); break;
    default: setTitle("Overview"); main.className = "page page-ov"; renderOverview(main);
  }
  if (isOpen()) sheet.refresh();
}
function errorHtml() {
  return html`<div class="empty narrow"><p class="empty-t">${D.error || "Could not load data."}</p><p><button class="btn" type="button" data-act="reload">Try again</button></p></div>`.toString();
}
addEventListener("hashchange", route);
WIDE.addEventListener("change", () => { lastKey = ""; route(); });

/** Re-render in place after a tracker change, keeping scroll positions. */
function rerender() {
  const y = scrollY;
  invalidate();
  route();
  scrollTo(0, y);
}

initTrackerDnD(rerender);

/* ------------------------------------------------------------------ tracker actions */
function trackerAction(act, id, value) {
  const it = D.byId.get(id);
  if (!it && act !== "note") return;
  const s = tracker.status(id);
  if (act === "save") {
    if (s === "" || s === "ignored") { tracker.set(id, { status: "saved" }, snap(it)); toast("Saved"); }
    else if (s === "saved") { tracker.set(id, { status: "" }, snap(it)); toast("Removed from tracker"); }
    else toast("Change its status in the detail view");
  } else if (act === "ignore") {
    tracker.set(id, { status: s === "ignored" ? "" : "ignored" }, snap(it));
    toast(s === "ignored" ? "No longer ignored" : "Ignored. It is hidden from lists.");
  } else if (act === "status") {
    tracker.set(id, { status: value }, it ? snap(it) : undefined);
  }
  rerender();
}

/* ------------------------------------------------------------------ events */
document.addEventListener("click", (e) => {
  if (overlayEvent(e)) return;
  const t = e.target.closest("[data-act]");
  if (t && ["save", "ignore"].includes(t.dataset.act)) { e.preventDefault(); trackerAction(t.dataset.act, t.dataset.id); return; }
  if (t && t.dataset.act === "reload") { loadAndRoute(); return; }
  if (browseClick(e)) { e.preventDefault(); return; }
  if (trackerClick(e, rerender)) e.preventDefault();
});
document.addEventListener("change", (e) => {
  if (overlayEvent(e)) return;
  const t = e.target;
  if (t.dataset && t.dataset.act === "status") { trackerAction("status", t.dataset.id, t.value); return; }
  browseChange(e);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.act === "note") {
    const it = D.byId.get(t.dataset.id);
    tracker.set(t.dataset.id, { note: t.value }, it ? snap(it) : undefined);
    paintNav(parseRoute(location.hash).view);
    return;
  }
  browseInput(e);
});

const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (isOpen()) { closeOverlay(); e.preventDefault(); return; }
    const r = parseRoute(location.hash);
    if (r.view === "item" && !typing(document.activeElement)) {
      const back = $(".back, .d-head .back");
      const from = r.params.from;
      if (WIDE.matches && (from === "internships" || from === "competitions")) go(buildHash(from, listParams(r.params)));
      else if (back && back.offsetParent) back.click();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
  if (e.key === "/") { const q = $("#q"); if (q) { e.preventDefault(); q.focus(); q.select(); } return; }
  if (e.key === "j" || e.key === "k") {
    const links = $$("#main [data-row] .row-link");
    if (!links.length) return;
    const cur = links.findIndex((a) => a === document.activeElement);
    const sel = cur < 0 ? links.findIndex((a) => a.closest("[data-row]").classList.contains("selected")) : cur;
    const next = Math.max(0, Math.min(links.length - 1, (sel < 0 ? (e.key === "j" ? -1 : links.length) : sel) + (e.key === "j" ? 1 : -1)));
    links[next].focus(); e.preventDefault();
    return;
  }
  if (e.key === "s") {
    const row = document.activeElement && document.activeElement.closest("[data-row]");
    const id = row ? row.dataset.row : parseRoute(location.hash).view === "item" ? parseRoute(location.hash).id : "";
    if (id && D.byId.has(id)) { e.preventDefault(); trackerAction("save", id); }
  }
});

/* ------------------------------------------------------------------ boot */
async function loadAndRoute() {
  D.loaded = false; D.error = "";
  route();
  await loadData();
  loadedAt = Date.now();
  route();
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && D.loaded && Date.now() - loadedAt > 10 * 60e3) {
    const before = D.generated;
    await loadData();
    loadedAt = Date.now();
    if (D.generated !== before) route();
  }
});
paintTheme();
D.prevVisit = recordVisit();
loadAndRoute();
$(".skip").addEventListener("click", (e) => { e.preventDefault(); main.focus(); });

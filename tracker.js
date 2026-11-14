// Tracker: Saved / Applied / Interview / Done board. Four columns on wide screens, status tabs on phones.
// Data lives in localStorage (store.js, unchanged). Status moves: "Move" menu on every card, plus drag and drop on desktop.
import { html, buildHash, daysUntil, go } from "./util.js";
import { icon } from "./icons.js";
import { tracker, STATUSES } from "./store.js";
import { D } from "./model.js";
import { menu, toast } from "./ui.js";

const COLS = [
  { v: "saved", label: "Saved", st: ["saved"], hint: "Save items from Internships or Competitions" },
  { v: "applied", label: "Applied", st: ["applied"], hint: "Move items here after you apply" },
  { v: "interview", label: "Interview", st: ["interview"], hint: "Move items here once you hear back" },
  { v: "done", label: "Done", st: ["rejected", "ignored"], hint: "Rejected and ignored items end up here", drop: "rejected" },
];
const ACTIVE = ["saved", "applied", "interview"];
const label = (v) => (STATUSES.find((s) => s.v === v) || { label: v }).label;
const FINE = () => matchMedia("(hover: hover) and (pointer: fine)").matches;

export function trackedCount() {
  return Object.values(tracker.all()).filter((r) => r.status === "saved" || r.status === "applied").length;
}
/** Sort key: upcoming deadlines soonest first, then past ones, then none. */
const dkey = (iso) => { const n = iso ? daysUntil(iso) : null; return n == null ? 2e9 : n < 0 ? 1e9 - n : n; };
function records() {
  return Object.entries(tracker.all()).filter(([, r]) => STATUSES.some((s) => s.v === r.status)).map(([id, r]) => {
    const live = D.byId.get(id);
    return { id, rec: r, it: live || null, title: live ? live.title : r.title || id, company: live ? live.company || live.organizer || "" : r.company || "", deadline: live ? live.deadline_iso : null, kind: live ? live._kind : r.kind };
  }).sort((a, b) => dkey(a.deadline) - dkey(b.deadline) || (b.rec.t || 0) - (a.rec.t || 0));
}
function deadlineChip(iso) {
  const n = iso ? daysUntil(iso) : null;
  if (n == null) return "";
  if (n < 0) return html`<span class="chip" title="Deadline passed">${icon("timer")}Closed</span>`;
  const text = n === 0 ? "Today" : n === 1 ? "Tomorrow" : `${n} d`;
  return html`<span class="chip ${n <= 3 ? "red" : n <= 7 ? "amber" : ""} num" title="Closes in ${n} day${n === 1 ? "" : "s"}">${icon("timer")}${text}</span>`;
}
function card(r, drag) {
  const note = (r.rec.note || "").trim();
  const href = r.it ? buildHash("item", { from: "tracker" }, r.id) : "";
  const comp = r.kind === "comp";
  return html`<article class="tcard" data-tid="${r.id}" ${drag ? html`draggable="true"` : ""}>
    <h3 class="tcard-t">${href ? html`<a class="tcard-link" href="${href}" draggable="false">${r.title}</a>` : r.title}</h3>
    <div class="tcard-sub"><span class="tcard-ty" title="${comp ? "Competition" : "Internship"}">${icon(comp ? "trophy" : "briefcase")}</span><span class="tcard-co">${r.company || (r.it ? "" : "No longer listed")}</span></div>
    ${note ? html`<p class="tcard-note">${note}</p>` : ""}
    <div class="tcard-f">${deadlineChip(r.deadline)}${!r.it && r.company ? html`<span class="chip" title="This posting is no longer in the list">Unlisted</span>` : ""}
      <button class="move-btn" type="button" data-act="move" data-id="${r.id}" aria-haspopup="menu" aria-label="Move: ${r.title}">${icon("move")}<span>Move</span></button></div>
  </article>`;
}
function group(name, rows, drag) {
  return rows.length ? html`<details class="tgroup"><summary>${name} <span class="n num">${rows.length}</span></summary><div class="tcards">${rows.map((r) => card(r, drag))}</div></details>` : "";
}

export function renderTracker(main, params) {
  const all = records();
  const drag = FINE();
  const tab = COLS.some((c) => c.v === params.tab) ? params.tab : "saved";
  const cols = COLS.map((c) => ({ ...c, rows: all.filter((r) => c.st.includes(r.rec.status)) }));
  const active = all.filter((r) => ACTIVE.includes(r.rec.status));
  const due = active.filter((r) => { const n = r.deadline ? daysUntil(r.deadline) : null; return n != null && n >= 0 && n <= 7; }).length;
  const sum = active.length ? `${active.length} tracked${due ? ` · ${due} due this week` : ""}` : "Nothing tracked yet";
  const body = (c) => {
    if (!c.rows.length) return html`<p class="col-empty">${c.hint}</p>`;
    if (c.v !== "done") return html`<div class="tcards">${c.rows.map((r) => card(r, drag))}</div>`;
    return html`${group("Rejected", c.rows.filter((r) => r.rec.status === "rejected"), drag)}${group("Ignored", c.rows.filter((r) => r.rec.status === "ignored"), drag)}`;
  };
  main.innerHTML = html`<div class="tracker tk">
    <header class="tk-head"><div><h1>Tracker</h1><p class="tk-sum">${sum}</p></div>
      <button class="icon-btn bordered" type="button" data-act="tracker-menu" aria-haspopup="menu" aria-label="Tracker options">${icon("more")}</button></header>
    <nav class="seg tabs-only" aria-label="Status">${cols.map((c) => html`<a href="${buildHash("tracker", { tab: c.v })}" class="${tab === c.v ? "on" : ""}" ${tab === c.v ? html`aria-current="true"` : ""}><span>${c.label}</span><span class="n num">${c.rows.length}</span></a>`)}</nav>
    <div class="tk-board">${cols.map((c) => html`<section class="col col-${c.v} ${tab === c.v ? "on" : ""}" data-col="${c.v}" aria-label="${c.label}">
      <h2 class="col-h"><span class="col-dot" aria-hidden="true"></span>${c.label} <span class="n num">${c.rows.length}</span></h2>${body(c)}</section>`)}</div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
  </div>`.toString();
}

/** Apply a status change. Live items store a snapshot so the card survives data refreshes. */
function setStatus(id, status) {
  const it = D.byId.get(id);
  const snap = it ? { title: it.title, kind: it._kind, url: it.apply_url || "", company: it.company || it.organizer || "" } : undefined;
  tracker.set(id, { status }, snap);
}

export function trackerClick(e, rerender) {
  const mv = e.target.closest("[data-act=move]");
  if (mv) {
    const id = mv.dataset.id, cur = tracker.status(id);
    menu.open(mv, () => STATUSES.filter((s) => s.v !== cur).map((s) => html`<button class="menu-item" role="menuitem" type="button" data-s="to:${s.v}">${s.label}</button>`),
      (el) => {
        const to = el.dataset.s.split(":")[1];
        setStatus(id, to); toast(`Moved to ${label(to)}`); rerender();
        const nb = document.querySelector(`[data-act=move][data-id="${CSS.escape(id)}"]`); if (nb) nb.focus({ preventScroll: true });
        return "close";
      }, "Move to");
    return true;
  }
  const b = e.target.closest("[data-act=tracker-menu]");
  if (!b) return false;
  menu.open(b, () => html`<button class="menu-item" role="menuitem" type="button" data-s="export">${icon("download")}<span>Export JSON</span></button>
    <button class="menu-item" role="menuitem" type="button" data-s="import">${icon("upload")}<span>Import JSON</span></button>`, (el) => {
    if (el.dataset.s === "export") {
      const url = URL.createObjectURL(new Blob([tracker.exportJson()], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "inra-tracker.json" });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Exported tracker");
    } else {
      const f = document.getElementById("import-file");
      f.onchange = async () => {
        try { const n = tracker.importJson(await f.files[0].text()); toast(`Imported ${n} item${n === 1 ? "" : "s"}`); rerender(); }
        catch (err) { toast("Import failed: " + err.message); }
      };
      f.click();
    }
    return "close";
  }, "Tracker options");
  return true;
}

/** Desktop drag and drop between columns (HTML5 DnD). The Move menu remains the accessible path. Call once. */
export function initTrackerDnD(rerender) {
  let dragId = "";
  const clear = () => document.querySelectorAll(".col.drop, .tcard.dragging").forEach((n) => n.classList.remove("drop", "dragging"));
  document.addEventListener("dragstart", (e) => {
    const c = e.target.closest && e.target.closest(".tcard[data-tid]");
    if (!c) return;
    dragId = c.dataset.tid;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch (err) { /* ignore */ }
    c.classList.add("dragging");
  });
  document.addEventListener("dragend", () => { dragId = ""; clear(); });
  document.addEventListener("dragover", (e) => {
    const col = dragId && e.target.closest && e.target.closest(".col[data-col]");
    if (!col) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    if (!col.classList.contains("drop")) { document.querySelectorAll(".col.drop").forEach((n) => n.classList.remove("drop")); col.classList.add("drop"); }
  });
  document.addEventListener("dragleave", (e) => {
    const col = e.target.closest && e.target.closest(".col[data-col]");
    if (col && !col.contains(e.relatedTarget)) col.classList.remove("drop");
  });
  document.addEventListener("drop", (e) => {
    const col = dragId && e.target.closest && e.target.closest(".col[data-col]");
    if (!col) return;
    e.preventDefault();
    const id = dragId, c = COLS.find((x) => x.v === col.dataset.col);
    dragId = ""; clear();
    const to = c.drop || c.v;
    if (!c.st.includes(tracker.status(id))) { setStatus(id, to); toast(`Moved to ${label(to)}`); rerender(); }
  });
}
export { go };

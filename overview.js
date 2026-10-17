// Overview: a one-screen dashboard. Header band, optional emergency strip, KPI tiles, three panels, role strip.
// Only what is needed to act is shown; empty things collapse or disappear.
import { html, buildHash, daysUntil, ago, closes } from "./util.js";
import { icon } from "./icons.js";
import { itemHref, scoreRing, saveBtn, modeText, payText, periodText, formatText, prizeText } from "./cards.js";
import { D, CAT, CORE, ROLE_PILLS, isMuted, isIgnored, isNew, jobOpen, compOpen, isSoon, jobMatches } from "./model.js";
import { fmtMonth } from "./util.js";
import { tracker } from "./store.js";

const MAX = 5;
const days = (it) => daysUntil(it.deadline_iso);
const CTX = { from: "overview" };
const byFit = (a, b) => b.fit_score - a.fit_score;

/** Meta line: parts = [{t, cls?}], rendered as spans separated by a middle dot (CSS). */
const meta = (parts) => html`<div class="orow-m">${parts.filter((p) => p && p.t).map((p) => html`<span class="${p.cls || ""}">${p.t}</span>`)}</div>`;

function chipFor(it) {
  const n = days(it);
  if (n == null || n < 0) return "";
  const text = n === 0 ? "Today" : n === 1 ? "Tomorrow" : `${n} d`;
  return html`<span class="chip ${n <= 3 ? "red" : n <= 7 ? "amber" : ""} num" title="${closes(it.deadline_iso)?.text || ""}">${icon("timer")}${text}</span>`;
}

function jobFact(j, skipDeadline) {
  const dl = closes(j.deadline_iso);
  if (!skipDeadline && dl && dl.n <= 14) return { t: dl.text, cls: dl.cls };
  const pay = payText(j);
  if (pay) return { t: pay.text, cls: pay.cls };
  const per = periodText(j);
  return per.muted ? null : { t: per.text };
}
function compFact(c, skipDeadline) {
  const dl = closes(c.deadline_iso);
  if (!skipDeadline && dl && dl.n <= 14) return { t: dl.text, cls: dl.cls };
  const p = prizeText(c);
  return p && !p.muted ? { t: p.text } : null;
}

/** One compact row. mode "closing" swaps the ring for a countdown chip and adds a type icon. */
function orow(it, mode = "") {
  const job = it._kind === "job";
  const closing = mode === "closing";
  const fmt = job ? null : formatText(it);
  const parts = job
    ? [{ t: it.company }, { t: modeText(it) }, jobFact(it, closing)]
    : [{ t: it.organizer || it.platform }, fmt ? { t: fmt.text, cls: fmt.cls === "hl" ? "good" : "" } : null, compFact(it, closing)];
  const href = itemHref(it.id, CTX);
  return html`<div class="orow ${job && isMuted(it) ? "muted-item" : ""}" data-row="${it.id}">
    <div class="orow-main">
      <div class="orow-t">${closing ? html`<span class="orow-type" title="${job ? "Internship" : "Competition"}">${icon(job ? "briefcase" : "trophy")}</span>` : ""}<a class="row-link" href="${href}">${it.title}</a></div>
      ${meta(parts)}
    </div>
    <div class="orow-r">${closing ? chipFor(it) : ""}<span class="orow-score">${scoreRing(it.fit_score, job && isMuted(it))}</span>${saveBtn(it, "icon-btn orow-save")}</div>
  </div>`;
}

function panel(title, icn, items, total, seeAll, hint, mode = "") {
  return html`<section class="panel" aria-label="${title}">
    <header class="panel-h"><h2>${icn ? icon(icn) : ""}${title}</h2><span class="n num">${total}</span>
      ${total ? html`<a class="see-all" href="${seeAll}">See all${icon("arrow")}</a>` : ""}</header>
    ${items.length ? html`<div class="orows" role="list">${items.slice(0, MAX).map((it) => html`<div role="listitem">${orow(it, mode)}</div>`)}</div>`
      : html`<p class="panel-empty">${hint}</p>`}
  </section>`;
}

function kpi(label, n, href, sub, tone = "") {
  return html`<a class="kpi ${tone}" href="${href}"><span class="kpi-l">${label}</span><span class="kpi-n num">${n}</span>${sub ? html`<span class="kpi-s">${sub}</span>` : ""}${icon("arrow")}</a>`;
}

export function overviewSkeleton() {
  const sk = html`<i class="sk w70"></i><i class="sk w40"></i>`;
  return html`<div class="ov-head"><div class="ov-wrap"><i class="sk w40" style="height:28px;width:180px"></i><i class="sk w70" style="margin-top:10px"></i></div></div>
    <div class="ov ov-wrap" aria-hidden="true"><div class="ov-kpis">${[1, 2, 3, 4].map(() => html`<div class="kpi skel">${sk}</div>`)}</div>
      <div class="ov-grid">${[1, 2, 3].map(() => html`<div class="panel skel">${[1, 2, 3, 4, 5].map(() => html`<div class="orow">${sk}</div>`)}</div>`)}</div></div>`;
}

export function renderOverview(main) {
  const jobs = D.jobs.filter((j) => jobOpen(j) && !isIgnored(j) && !isMuted(j));
  const comps = D.comps.filter((c) => !isIgnored(c) && (isSoon(c) || compOpen(c)));
  const openComps = comps.filter((c) => !isSoon(c));
  const opening = comps.filter(isSoon).sort((a, b) => (a.registration_opens_iso || "9").localeCompare(b.registration_opens_iso || "9"));

  const emergencies = [...jobs, ...openComps].filter((x) => x.is_emergency).sort(byFit);
  const takeNow = jobs.filter((j) => j.lane === "take_now").sort((a, b) => Number(CORE.has(b.category)) - Number(CORE.has(a.category)) || byFit(a, b));
  const bestComps = [...openComps].sort((a, b) => Number(b.no_pitch_online) - Number(a.no_pitch_online) || byFit(a, b));
  const closing = [...jobs, ...openComps].filter((x) => days(x) != null && days(x) >= 0 && days(x) <= 14)
    .sort((a, b) => days(a) - days(b) || byFit(a, b));
  const week = closing.filter((x) => days(x) <= 7);
  const weekJobs = week.filter((x) => x._kind === "job").length;
  const fresh = jobs.filter(isNew).length;
  const tracked = Object.values(tracker.all()).filter((r) => r.status === "saved" || r.status === "applied").length;

  const parts = [];
  if (takeNow.length) parts.push(html`<strong class="num">${takeNow.length}</strong> to take now`);
  if (week.length) parts.push(html`<strong class="num">${week.length}</strong> closing this week`);
  if (D.generated) parts.push(`updated ${ago(D.generated)}`);

  const roles = ROLE_PILLS.map((r) => ({
    r, now: D.jobs.filter((j) => jobMatches(j, { lane: "take_now", role: r })).length,
    later: D.jobs.filter((j) => jobMatches(j, { lane: "plan_ahead", role: r })).length,
  }));

  main.innerHTML = html`<div class="ov-head"><div class="ov-wrap">
      <h1>Overview</h1>
      <p class="ov-sum">${parts.length ? parts.map((p, i) => html`${i ? html`<span class="dotsep" aria-hidden="true">·</span>` : ""}${p}`) : "Nothing to show yet."}</p>
    </div></div>
    <div class="ov ov-wrap">
      ${emergencies.length ? html`<section class="ov-alert" aria-label="Needs action now">
        <span class="ov-alert-t">${icon("zap")}Needs action now <span class="num">${emergencies.length}</span></span>
        <div class="ov-alert-items">${emergencies.slice(0, 3).map((x) => html`<a class="ov-alert-link" href="${itemHref(x.id, CTX)}"><span>${x.title}</span>${chipFor(x)}</a>`)}</div>
        <a class="see-all" href="${buildHash("internships", { lane: "all", sort: "deadline" })}">See all${icon("arrow")}</a>
      </section>` : ""}
      <div class="ov-kpis">
        ${kpi("Take now", takeNow.length, buildHash("internships", { lane: "take_now", sort: "fit" }), "", "accent")}
        ${kpi("Closing this week", week.length, buildHash("internships", { lane: "all", due: 7, sort: "deadline" }), week.length ? `${weekJobs} internship${weekJobs === 1 ? "" : "s"} · ${week.length - weekJobs} comp.` : "", week.length ? "warn" : "")}
        ${kpi("New since last visit", fresh, buildHash("internships", { lane: "all", new: 1, sort: "newest" }), "")}
        ${kpi("Tracked", tracked, buildHash("tracker"), "saved + applied")}
      </div>
      <div class="ov-grid">
        ${panel("Top picks · Take now", "", takeNow, takeNow.length, buildHash("internships", { lane: "take_now", sort: "fit" }), "No take-now internships yet")}
        ${panel("Best competitions", "", bestComps, bestComps.length, buildHash("competitions", { np: 1, sort: "fit" }), "No open competitions right now")}
        ${panel("Closing soon", "", closing, closing.length, buildHash("internships", { lane: "all", due: 14, sort: "deadline" }), "Nothing closes in the next two weeks", "closing")}
      </div>
      <section class="panel roles" aria-label="Browse by role">
        <header class="panel-h"><h2>Browse by role</h2><span class="hint">Take now · Plan ahead</span></header>
        <div class="role-tiles">${roles.map((x) => html`<a class="role ${x.now + x.later ? "" : "zero"}" href="${buildHash("internships", { lane: "take_now", role: x.r })}" aria-label="${CAT[x.r]}: ${x.now} take now, ${x.later} plan ahead">
          <span class="role-n">${CAT[x.r]}</span><span class="role-c num"><b>${x.now}</b> · ${x.later}</span></a>`)}</div>
      </section>
      ${opening.length ? html`<section class="panel soon" aria-label="Opening soon">
        <h2>${icon("calendar")}Opening soon</h2>
        <div class="soon-items">${opening.slice(0, 6).map((c) => html`<a class="soon-i" href="${itemHref(c.id, CTX)}"><span>${c.title}</span>${c.registration_opens_iso ? html`<span class="muted-t">~${fmtMonth(c.registration_opens_iso.slice(0, 7))}</span>` : ""}</a>`)}</div>
        <a class="see-all" href="${buildHash("competitions", { tab: "soon" })}">See all${icon("arrow")}</a>
      </section>` : ""}
    </div>`.toString();
}

// Detail pages (deep-link target of phone alerts). Sticky header with Apply; sticky bottom bar on phones.
import { html, safeUrl, fmtDate, ago, fmtIdrFull, closes, daysUntil } from "./util.js";
import { icon } from "./icons.js";
import { tracker, STATUSES } from "./store.js";
import { CAT, LANES, MODE, THEME, isMuted } from "./model.js";
import { applyLink, saveBtn, scoreRing, periodText, payText, prizeText, teamText, formatText, winText, joined } from "./cards.js";

function statusSelect(it, cls = "") {
  const s = tracker.status(it.id);
  return html`<label class="sel ${cls}"><span class="sr">Tracker status</span><select data-act="status" data-id="${it.id}" aria-label="Tracker status">
    <option value="" ${s === "" ? "selected" : ""}>Not tracked</option>
    ${STATUSES.map((o) => html`<option value="${o.v}" ${s === o.v ? "selected" : ""}>${o.label}</option>`)}</select>${icon("down")}</label>`;
}
const row = (k, v, cls = "") => (v == null || v === "" ? "" : html`<div class="kv ${cls}"><dt>${k}</dt><dd>${v}</dd></div>`);
const list = (arr) => (arr.length ? html`<ul class="bullets">${arr.map((x) => html`<li>${x}</li>`)}</ul>` : "");

function head(it, sub, back) {
  const known = (it.fit_flags || []).includes("well_known_company");
  return html`<header class="d-head">
    <a class="back only-narrow" href="${back}">${icon("back")}<span>Back</span></a>
    <div class="d-title">
      <h1>${it.title}</h1>
      <p class="d-sub">${sub}${known ? html` <span class="known">${icon("verified")}Well-known</span>` : ""}</p>
    </div>
    <div class="d-actions only-wide">${applyLink(it)}${saveBtn(it, "icon-btn bordered")}${statusSelect(it)}</div>
    <div class="d-score">${scoreRing(it.fit_score, isMuted(it))}</div>
  </header>`;
}
function bottomBar(it) {
  return html`<div class="bottombar only-narrow">${applyLink(it, "btn btn-primary grow")}${saveBtn(it, "icon-btn bordered")}${statusSelect(it, "compact")}</div>`;
}
function notes(it) {
  const t = tracker.get(it.id);
  return html`<section class="d-sec"><h2>Notes</h2><textarea class="notes" data-act="note" data-id="${it.id}" rows="3" placeholder="Contact, referral, what to prepare..." aria-label="Notes">${t ? t.note || "" : ""}</textarea>
    <p class="hint">Stored only in this browser.</p></section>`;
}

export function jobDetail(j, ctx) {
  const per = periodText(j), pay = payText(j), dl = closes(j.deadline_iso);
  const lane = LANES.find((l) => l.v === j.lane);
  const watch = [];
  if (j.eligibility === "unclear") watch.push(`Eligibility unclear${j.eligibility_reason ? ": " + j.eligibility_reason : ""}`);
  if (j.pay_status === "unpaid") watch.push("Unpaid");
  if (j.trust_score < 60) watch.push(`Check legitimacy (trust ${j.trust_score}/100)${j.scam_flags.length ? ": " + j.scam_flags.join(", ") : ""}`);
  if (per.muted) watch.push("Dates unclear");
  if (j.deadline_iso && daysUntil(j.deadline_iso) < 0) watch.push("Deadline has passed");
  const alts = j.alt_apply_urls.map(safeUrl).filter(Boolean);
  const posted = j.posted_at ? ago(j.posted_at) : j.age_days != null ? `${j.age_days} d ago` : "";
  return html`<article class="detail" data-detail="${j.id}">
    ${head(j, html`${j.company}${j.source_label ? html` · ${j.source_label}` : ""}`, ctx.back)}
    <div class="d-body">
      ${isMuted(j) ? html`<p class="callout">${CAT[j.category]} role. Shown for reference only, not part of your target roles.</p>` : ""}
      <dl class="grid">
        ${row("Lane", lane ? lane.label : j.lane)}${row("Category", CAT[j.category])}
        ${row("Mode", MODE[j.work_mode])}${row("City", j.city || (j.work_mode === "remote" ? "" : j.location) || "Not stated", j.city ? "" : "muted")}
        ${row("Period", per.text, per.muted ? "muted" : "")}${row("Hours", j.hours_per_week ? `${j.hours_per_week} h/week` : "Not stated", j.hours_per_week ? "" : "muted")}
        ${row("Pay", pay ? (j.compensation_idr_month ? fmtIdrFull(j.compensation_idr_month) + " / month" : j.compensation_raw && j.compensation_raw !== "Paid" ? j.compensation_raw : pay.text) : "Not stated", pay ? pay.cls : "muted")}
        ${row("Deadline", j.deadline_iso ? html`${fmtDate(j.deadline_iso)}${dl ? html` <span class="due ${dl.cls}">${dl.text}</span>` : ""}` : "Not stated", j.deadline_iso ? "" : "muted")}
        ${row("Eligibility", j.eligibility === "eligible" ? `Eligible${j.eligibility_reason ? ": " + j.eligibility_reason : ""}` : `Unclear${j.eligibility_reason ? ": " + j.eligibility_reason : ""}`, j.eligibility === "eligible" ? "" : "warn")}
        ${row("Source", j.source_label)}${row("Posted", posted)}
      </dl>
      ${watch.length ? html`<section class="d-sec watch"><h2>${icon("alert")}Watch out</h2>${list(watch)}</section>` : ""}
      ${j.fit_reasons.length ? html`<section class="d-sec"><h2>Why it fits</h2>${list(j.fit_reasons)}</section>` : ""}
      ${j.job_desc_summary.length ? html`<section class="d-sec"><h2>Responsibilities</h2>${list(j.job_desc_summary)}</section>` : ""}
      ${j.requirements.length ? html`<section class="d-sec"><h2>Requirements</h2><div class="tagrow">${j.requirements.map((r) => html`<span class="chip">${r}</span>`)}</div></section>` : ""}
      ${alts.length ? html`<section class="d-sec"><h2>Also listed on</h2><ul class="bullets">${alts.map((u) => html`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${new URL(u).hostname.replace(/^www\./, "")}</a></li>`)}</ul></section>` : ""}
      ${notes(j)}
      <p class="d-foot"><button class="link-btn" type="button" data-act="ignore" data-id="${j.id}">${tracker.status(j.id) === "ignored" ? "Stop ignoring this posting" : "Ignore this posting"}</button></p>
    </div>
    ${bottomBar(j)}
  </article>`;
}

const SCOPE = { global: "Open globally", indonesia: "Indonesia", students: "Students", indonesian_students: "Indonesian students", unknown: "" };
export function compDetail(c, ctx) {
  const prize = prizeText(c), team = teamText(c), fmt = formatText(c), win = winText(c), dl = closes(c.deadline_iso);
  const tier = c.prestige_tier === 1 ? "Top tier" : c.prestige_tier === 2 ? "Well known" : "";
  return html`<article class="detail" data-detail="${c.id}">
    ${head(c, html`${c.organizer || c.platform}${c.organizer && c.platform ? html` · ${c.platform}` : ""}`, ctx.back)}
    <div class="d-body">
      <dl class="grid">
        ${row("Theme", THEME[c.theme])}${row("Prestige", tier)}
        ${row("Deadline", c.deadline_iso ? html`${fmtDate(c.deadline_iso)}${dl ? html` <span class="due ${dl.cls}">${dl.text}</span>` : ""}` : "")}
        ${row(c.is_calendar_estimate ? "Registration opens about" : "Registration opens", c.registration_opens_iso ? fmtDate(c.registration_opens_iso) : "")}
        ${row("Prize", prize ? prize.text : "", prize && prize.muted ? "muted" : "")}
        ${row("Team", team ? team.text : "", team ? team.cls : "")}${row("Format", fmt ? fmt.text : c.is_online ? "Online" : "", fmt ? fmt.cls : "")}
        ${row("Open to", SCOPE[c.eligibility_scope] || "")}${row("Platform", c.platform)}
        ${row("Win chance", win ? `${win.label} (${win.w}/100)` : "")}${row("Participants", c.participants > 0 ? joined(c.participants).replace(" joined", "") : "")}
      </dl>
      ${c.fit_reasons.length ? html`<section class="d-sec"><h2>Why it fits</h2>${list(c.fit_reasons)}</section>` : ""}
      ${c.description ? html`<section class="d-sec"><h2>About</h2><p class="prose">${c.description}</p></section>` : ""}
      ${c.tags.length ? html`<section class="d-sec"><h2>Tags</h2><div class="tagrow">${c.tags.map((t) => html`<span class="chip">${t}</span>`)}</div></section>` : ""}
      ${notes(c)}
      <p class="d-foot"><button class="link-btn" type="button" data-act="ignore" data-id="${c.id}">${tracker.status(c.id) === "ignored" ? "Stop ignoring this competition" : "Ignore this competition"}</button></p>
    </div>
    ${bottomBar(c)}
  </article>`;
}
export const detailFor = (it, ctx) => (it._kind === "job" ? jobDetail(it, ctx) : compDetail(it, ctx));

// Detail pages (deep-link target of phone alerts). Sticky header with Apply; sticky bottom bar on phones.
// The lean list item renders instantly; the richer lazy file (d/<id>.json) fills the [data-dyn] slot when it arrives.
import { html, raw, esc, safeUrl, fmtDate, ago, fmtIdr, fmtIdrFull, closes, daysUntil } from "./util.js";
import { icon } from "./icons.js";
import { tracker, STATUSES, lsGet, lsSet } from "./store.js";
import { CAT, LANES, LOWER, isMuted, isVerified, verifiedWhy, isIneligible, isPractice, isRestricted, isRolling, cachedDetail, fetchDetail } from "./model.js";
import { applyLink, saveBtn, scoreRing, periodText, payText, prizeText, teamText, formatText, modeText, joined, ODDS_LABEL, fmtPct, fmtRange, effortChip } from "./cards.js";
import { toast } from "./ui.js";

/* ------------------------------------------------------------------ small pieces */
function statusSelect(it, cls = "") {
  const s = tracker.status(it.id);
  return html`<label class="sel ${cls}"><span class="sr">Tracker status</span><select data-act="status" data-id="${it.id}" aria-label="Tracker status">
    <option value="" ${s === "" ? "selected" : ""}>Not tracked</option>
    ${STATUSES.map((o) => html`<option value="${o.v}" ${s === o.v ? "selected" : ""}>${o.label}</option>`)}</select>${icon("down")}</label>`;
}
const list = (arr) => (arr.length ? html`<ul class="bullets">${arr.map((x) => html`<li>${inline(String(x))}</li>`)}</ul>` : "");
const fc = (k, v, cls = "") => (v == null || v === "" ? "" : html`<div class="fc ${cls}"><dt>${k}</dt><dd>${v}</dd></div>`);
const sec = (title, body, cls = "") => (body === "" || body == null ? "" : html`<section class="d-sec ${cls}"><h2>${title}</h2>${body}</section>`);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== "") : []);
const IG_RE = /^[A-Za-z0-9_-]{5,}$/;
const igCode = (it) => (it.ig_shortcode && IG_RE.test(it.ig_shortcode) ? it.ig_shortcode : "");
const igPostUrl = (sc) => `https://www.instagram.com/p/${sc}/`;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };

/* ------------------------------------------------------------------ safe rich text */
const URL_OR_MAIL = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/** Escape `s` and turn URLs / emails into links. Output is an HTML string made only of escaped text and our own <a> tags. */
function inline(s) {
  let out = "", last = 0;
  for (const m of s.matchAll(URL_OR_MAIL)) {
    let t = m[0], trail = "";
    const tm = t.match(/[.,;:!?)\]'"]+$/);
    if (tm) { trail = tm[0]; t = t.slice(0, -trail.length); }
    out += esc(s.slice(last, m.index));
    if (!/^(https?:|www\.)/i.test(t) && t.includes("@")) out += `<a href="mailto:${esc(t)}">${esc(t)}</a>`;
    else {
      const u = safeUrl(/^www\./i.test(t) ? "https://" + t : t);
      out += u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : esc(t);
    }
    out += esc(trail);
    last = m.index + m[0].length;
  }
  return raw(out + esc(s.slice(last)));
}
const BULLET = /^\s*(?:[-*\u2022\u25aa\u25cf\u25e6\u2013\u2014\u2713\u2714\u27a2\u27a4\u25ba]|\d{1,2}[.)])\s+/;
/** Plain text -> paragraphs and bullet lists. Returns {html, lines} (lines = rough rendered line count). */
function prose(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let p = [], ul = [], n = 0;
  const flushP = () => { if (p.length) { out.push(html`<p>${p.map((l, i) => html`${i ? raw("<br>") : ""}${inline(l)}`)}</p>`); p = []; } };
  const flushU = () => { if (ul.length) { out.push(html`<ul class="bullets">${ul.map((l) => html`<li>${inline(l)}</li>`)}</ul>`); ul = []; } };
  for (const raw0 of lines) {
    const l = raw0.trim();
    if (!l) { flushP(); flushU(); n += 1; continue; }
    n += Math.ceil(l.length / 85);
    if (BULLET.test(l)) { flushP(); ul.push(l.replace(BULLET, "")); } else { flushU(); p.push(l); }
  }
  flushP(); flushU();
  return { html: html`${out}`, lines: n };
}
const expanded = new Set();
let uid = 0;
/** Long text collapses to ~12 lines with a Read more toggle. */
function rich(key, text, collapse = true) {
  const t = str(text);
  if (!t) return "";
  const { html: body, lines } = prose(t);
  if (!collapse || lines <= 15) return html`<div class="rich">${body}</div>`;
  const open = expanded.has(key), id = `rt${++uid}`;
  return html`<div class="rich clamp ${open ? "open" : ""}" id="${id}">${body}</div>
    <button class="link-btn more-btn" type="button" data-act="d-more" data-key="${key}" aria-expanded="${open}" aria-controls="${id}">${open ? "Show less" : "Read more"}</button>`;
}
const skeleton = () => html`<div class="d-sec" aria-hidden="true"><i class="sk w40"></i><i class="sk w90"></i><i class="sk w90"></i><i class="sk w70"></i></div>`;

/* ------------------------------------------------------------------ header + bars */
function head(it, sub, back, actions) {
  return html`<header class="d-head">
    <a class="back only-narrow" href="${back}">${icon("back")}<span>Back</span></a>
    <div class="d-title">
      <h1>${it.title}</h1>
      <p class="d-sub">${sub}</p>
    </div>
    <div class="d-actions only-wide">${actions}${saveBtn(it, "icon-btn bordered")}${statusSelect(it)}</div>
    <div class="d-score">${scoreRing(it.fit_score, isMuted(it) || isIneligible(it))}</div>
  </header>`;
}
function bottomBar(it, label, primary = true) {
  return html`<div class="bottombar only-narrow">${applyLink(it, primary ? "btn btn-primary grow" : "btn grow", label)}${saveBtn(it, "icon-btn bordered")}${statusSelect(it, "compact")}</div>`;
}
function notes(it) {
  const t = tracker.get(it.id);
  return html`<section class="d-sec"><h2>Notes</h2><textarea class="notes" data-act="note" data-id="${it.id}" rows="3" placeholder="Contact, referral, what to prepare..." aria-label="Notes">${t ? t.note || "" : ""}</textarea>
    <p class="hint">Stored only in this browser.</p></section>`;
}
const dueChip = (iso) => { const dl = closes(iso); return dl ? html` <span class="chip ${dl.cls === "urgent" ? "red" : dl.cls === "soon" ? "amber" : ""}">${dl.text}</span>` : ""; };

/* ------------------------------------------------------------------ INTERNSHIP */
const WA_TEXT = (j) => `Halo, saya tertarik dengan posisi ${j.title}${j.company ? " di " + j.company : ""}. Apakah lowongan ini masih dibuka?`;
export function waNumber(raw0) {
  let d = String(raw0 || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("0")) d = "62" + d.slice(1);
  d = d.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : "";
}
const cbtn = (value, label) => html`<button class="btn btn-quiet sm" type="button" data-act="d-copy" data-value="${value}" aria-label="Copy ${label}: ${value}">${icon("copy")}<span>Copy ${label}</span></button>`;
function howToApply(j, s) {
  const c = s.contact || {};
  const emails = arr(c.emails), phones = arr(c.phones), was = arr(c.whatsapp);
  const links = arr(c.links).map(safeUrl).filter(Boolean);
  const handle = typeof c.dm_handle === "string" && /^@?[A-Za-z0-9._]{1,30}$/.test(c.dm_handle.trim()) ? c.dm_handle.trim().replace(/^@/, "") : "";
  const text = str(s.how_to_apply);
  const rows = [];
  for (const u of links.slice(0, 3)) rows.push(html`<a class="btn sm" href="${u}" target="_blank" rel="noopener noreferrer">${icon("external")}<span>Open ${hostOf(u)}</span></a>`);
  for (const e of emails.slice(0, 3)) {
    rows.push(html`<a class="btn sm" href="mailto:${e}?subject=${encodeURIComponent("Lamaran magang: " + j.title)}">${icon("mail")}<span>Email ${e}</span></a>`, cbtn(e, "email"));
  }
  const nums = [...new Set([...was, ...phones].map(String))];
  for (const n of nums.slice(0, 3)) {
    const wa = waNumber(n);
    if (wa && (was.includes(n) || phones.includes(n))) rows.push(html`<a class="btn sm" href="https://wa.me/${wa}?text=${encodeURIComponent(WA_TEXT(j))}" target="_blank" rel="noopener noreferrer">${icon("chat")}<span>WhatsApp ${n}</span></a>`);
    rows.push(cbtn(n, "number"));
  }
  if (handle) rows.push(html`<a class="btn sm" href="https://www.instagram.com/${handle}/" target="_blank" rel="noopener noreferrer">${icon("chat")}<span>DM @${handle}</span></a>`);
  if (!text && !rows.length) return "";
  return sec("How to apply", html`${text ? rich(`${j.id}:apply`, text, false) : ""}${rows.length ? html`<div class="btnrow">${rows}</div>` : ""}`);
}
function reqBlock(items) {
  if (!items.length) return "";
  return items.every((r) => String(r).length <= 42) ? html`<div class="tagrow">${items.map((r) => html`<span class="chip">${r}</span>`)}</div>` : list(items);
}
function jobDyn(j, d) {
  if (d === undefined && j.has_detail) return skeleton();
  const s = (d && d.sections) || {};
  const desc = str(d && d.description_full) || str(s.about);
  const resp = arr(s.responsibilities).length ? arr(s.responsibilities) : d ? [] : j.job_desc_summary;
  const reqs = arr(s.requirements).length ? arr(s.requirements) : arr(d && d.requirements).length ? arr(d.requirements) : j.requirements;
  return html`${sec("About", rich(`${j.id}:about`, desc))}
    ${sec("Responsibilities", list(resp))}${sec("Requirements", reqBlock(reqs))}${sec("Benefits", list(arr(s.benefits)))}
    ${sec("Selection process", rich(`${j.id}:sel`, s.selection_process, false))}
    ${howToApply(j, s)}
    ${isVerified(j) && d && d.ig_decision ? whyReal(d.ig_decision) : ""}`;
}
const REASON = {
  internship_in_headline: "The word “internship” (or magang) is in the headline",
  opening_wording_next_to_internship: "Opening wording sits next to “internship”",
  recruiting_cue: "Recruiting wording such as “hiring” or “open recruitment”",
  apply_link_or_email: "Has an apply link or contact email",
};
function whyReal(dec) {
  const rs = arr(dec.reasons);
  if (!rs.length) return "";
  const conf = typeof dec.confidence === "number" ? ` · ${Math.round(dec.confidence * 100)}% confident` : "";
  return html`<details class="why-real muted-t"><summary>Why this counts as a real internship${conf}</summary>
    <ul class="bullets">${rs.map((r) => html`<li>${REASON[r] || String(r).replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase())}</li>`)}</ul></details>`;
}
function postFrame(j, sc) {
  return html`<div class="post-frame"><iframe src="https://www.instagram.com/p/${sc}/embed/" title="Instagram post for ${j.title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>
    <p class="hint">Can't load? <a href="${igPostUrl(sc)}" target="_blank" rel="noopener noreferrer">Open on Instagram ↗</a></p>`;
}
const autoPost = () => { try { return sessionStorage.getItem("ir.post.auto") === "1"; } catch (e) { return false; } };
function originalPost(j) {
  const sc = igCode(j);
  if (!sc) return "";
  const poster = safeUrl(j.poster_url || "");
  return html`<section class="d-sec" data-post="${sc}"><h2>Original post</h2>
    ${poster ? html`<img class="poster" src="${poster}" alt="Poster from the original post" loading="lazy" referrerpolicy="no-referrer">` : ""}
    <div class="post-slot">${autoPost() ? postFrame(j, sc) : html`<div class="btnrow"><button class="btn sm" type="button" data-act="d-post" data-id="${j.id}">${icon("image")}<span>Show original post</span></button>
      <a class="btn btn-quiet sm" href="${igPostUrl(sc)}" target="_blank" rel="noopener noreferrer">${icon("external")}<span>Open on Instagram</span></a></div>
      <p class="hint">Loads the post from instagram.com only when you ask.</p>`}</div></section>`;
}

export function jobDetail(j, ctx) {
  const per = periodText(j), pay = payText(j);
  const lane = LANES.find((l) => l.v === j.lane);
  const sc = igCode(j);
  const watch = [];
  if (j.eligibility === "unclear") watch.push(`Eligibility unclear${j.eligibility_reason ? ": " + j.eligibility_reason : ""}`);
  if (j.pay_status === "unpaid") watch.push("Unpaid");
  if (j.trust_score < 60) watch.push(`Check legitimacy (trust ${j.trust_score}/100)${j.scam_flags.length ? ": " + j.scam_flags.join(", ") : ""}`);
  if (j.deadline_iso && daysUntil(j.deadline_iso) < 0) watch.push("Deadline has passed");
  const fits = j.fit_reasons.filter((r) => !/^Verified internship/i.test(r));
  const alts = j.alt_apply_urls.map(safeUrl).filter(Boolean);
  const posted = j.posted_at ? ago(j.posted_at) : j.age_days != null ? `${j.age_days} d ago` : "";
  const known = (j.fit_flags || []).includes("well_known_company");
  const mode = modeText(j) || (j.work_mode === "unknown" ? j.location || "" : "");
  const payV = pay ? (j.compensation_idr_month ? fmtIdrFull(j.compensation_idr_month) + " / month" : j.compensation_raw && j.compensation_raw !== "Paid" ? j.compensation_raw : pay.text) : "";
  const sub = html`${j.company}${known ? html` <span class="known">${icon("verified")}Well-known</span>` : ""}${isVerified(j) ? html` <span class="vfy-inline">${icon("check")}Verified</span>` : ""}${j.source_label ? html` · ${j.source_label}` : ""}${posted ? html` · ${posted}` : ""}`;
  const srcLink = sc ? html`<a class="btn btn-quiet" href="${igPostUrl(sc)}" target="_blank" rel="noopener noreferrer">Open source post${icon("external")}<span class="sr"> (opens in new tab)</span></a>` : "";
  return html`<article class="detail" data-detail="${j.id}">
    ${head(j, sub, ctx.back, html`${applyLink(j)}${srcLink}`)}
    <div class="d-body">
      ${isMuted(j) ? html`<p class="callout">${CAT[j.category]} role. Shown for reference only, not part of your target roles.</p>` : ""}
      ${isVerified(j) ? html`<p class="vfy-note muted-t">${icon("check")}<span>Verified internship${LOWER.has(j.category) ? ` · ${CAT[j.category]}` : ""}: ${verifiedWhy(j)}.</span></p>` : ""}
      <section class="d-sec" aria-label="At a glance"><h2>At a glance</h2>
        <dl class="glance">
          ${fc("Lane", lane ? lane.label : j.lane)}${fc("Where", mode)}
          ${per.muted ? "" : fc("Period", per.text)}${fc("Hours", j.hours_per_week ? `${j.hours_per_week} h/week` : "")}
          ${fc("Pay", payV, pay ? pay.cls : "")}
          ${fc("Deadline", j.deadline_iso ? html`${fmtDate(j.deadline_iso)}${dueChip(j.deadline_iso)}` : "")}
          ${fc("Eligibility", j.eligibility === "eligible" ? `Eligible${j.eligibility_reason ? ": " + j.eligibility_reason : ""}` : "Unclear", j.eligibility === "eligible" ? "" : "warn")}
          ${fc("Category", CAT[j.category])}${fc("Source", j.source_label)}
        </dl>
        ${per.muted ? html`<p class="muted-t small gnote">${icon("calendar")}Dates unclear</p>` : ""}
      </section>
      ${watch.length ? html`<section class="d-sec watch"><h2>${icon("alert")}Watch out</h2>${list(watch)}</section>` : ""}
      ${sec("Why it fits", list(fits))}
      <div class="d-dyn" data-dyn aria-live="polite">${jobDyn(j, cachedDetail(j.id))}</div>
      ${originalPost(j)}
      ${alts.length ? html`<section class="d-sec"><h2>Also listed on</h2><ul class="bullets">${alts.map((u) => html`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${hostOf(u)}</a></li>`)}</ul></section>` : ""}
      ${notes(j)}
      <p class="d-foot"><button class="link-btn" type="button" data-act="ignore" data-id="${j.id}">${tracker.status(j.id) === "ignored" ? "Stop ignoring this posting" : "Ignore this posting"}</button></p>
    </div>
    ${bottomBar(j, "Apply")}
  </article>`;
}

/* ------------------------------------------------------------------ COMPETITION */
const SCOPE = { global: "Open globally", indonesia: "Indonesia", students: "Students", indonesian_students: "Indonesian students", unknown: "" };
const SRC_WORD = { registrations: "registrations", teams: "teams", submissions: "submissions" };
const EFFORT_LONG = { weekend: "a weekend", "1-2 weeks": "1–2 weeks", "month+": "a month or more" };
const oddsPos = (p) => Math.max(0, Math.min(1, Math.log1p(Math.max(0, p)) / Math.log1p(50))) * 100;
const SCALE = [0, 1, 5, 10, 25, 50];

function expectedEntrants(c) {
  for (const f of c.odds_factors || []) {
    const m = `${f.label || ""} ${f.detail || ""}`.match(/~?\s*(\d+(?:\.\d+)?)\s+real entrants/i);
    if (m) return Math.round(Number(m[1]));
  }
  return null;
}
export function oddsBasis(c) {
  const n = c.participants, src = c.participants_source;
  if (!(n > 0) || !src || src === "unknown") return "";
  if (src === "estimate") return `based on an estimated ${n.toLocaleString()} participants`;
  const exp = src === "registrations" ? expectedEntrants(c) : null;
  return `based on ${n.toLocaleString()} ${SRC_WORD[src] || src}${exp ? ` (≈${exp} expected submissions)` : ""}`;
}
const glyph = (e) => (e === "+" ? { g: "+", cls: "pos", w: "Helps" } : e === "-" ? { g: "−", cls: "neg", w: "Hurts" } : { g: "=", cls: "neu", w: "Neutral" });
function oddsPanel(c) {
  const practice = isPractice(c);
  const t = c.odds_tier, unknown = !practice && (t === "unknown" || c.odds_pct == null);
  const rng = fmtRange(c);
  const conf = c.odds_confidence ? `${c.odds_confidence} confidence` : "";
  const basis = oddsBasis(c);
  const factors = arr(c.odds_factors);
  const effort = c.effort_label ? `Effort ${c.effort_hours ? `≈ ${Math.round(c.effort_hours)} h · ` : ""}${EFFORT_LONG[c.effort_label] || c.effort_label}` : "";
  const ev = c.ev_idr >= 100000 ? `Expected prize value ≈ ${fmtIdr(c.ev_idr)}` : "";
  const label = practice ? "No cash prize" : unknown ? "Odds unknown" : `${ODDS_LABEL[t]} odds, about ${fmtPct(c.odds_pct)}${rng ? `, range ${rng}` : ""}, on a 0 to 50 percent scale`;
  const lo = c.odds_low != null ? oddsPos(c.odds_low) : null, hi = c.odds_high != null ? oddsPos(c.odds_high) : null;
  return html`<section class="d-sec odds-panel o-${(unknown ? "unknown" : t).replace("_", "-")}" aria-labelledby="odds-h"><h2 id="odds-h">Your odds</h2>
    <div class="odds-top"><span class="odds-tier">${practice ? "Practice · no prize" : unknown ? "Unknown" : ODDS_LABEL[t]}</span>${unknown || practice ? "" : html`<span class="odds-pct num">≈ ${fmtPct(c.odds_pct)}</span>`}</div>
    ${practice ? html`<p class="odds-line">Nothing to win in money here. Good for learning and your portfolio.</p>` : unknown ? html`<p class="odds-line">Field size unknown. No participant count is published, so a number would be a guess. Open the competition page to see how many people have joined.</p>`
      : html`<div class="obar" role="img" aria-label="${label}"><i class="obar-range" style="left:${lo ?? oddsPos(c.odds_pct)}%;width:${lo != null && hi != null ? Math.max(1.5, hi - lo) : 1.5}%"></i><i class="obar-mark" style="left:${oddsPos(c.odds_pct)}%"></i></div>
      <div class="obar-scale" aria-hidden="true">${SCALE.map((p, i) => html`<span class="${i === 0 ? "first" : i === SCALE.length - 1 ? "last" : ""}" style="left:${oddsPos(p)}%">${p}%</span>`)}</div>
      <p class="odds-line">≈ ${fmtPct(c.odds_pct)}${rng ? ` (${rng})` : ""}${conf ? ` · ${conf}` : ""}${basis ? ` · ${basis}` : ""}</p>`}
    ${isRestricted(c) ? html`<p class="odds-meta"><span class="chip amber">${icon("alert")}Restricted access: check eligibility</span></p>` : ""}
    ${effort || ev ? html`<p class="odds-meta">${effort ? html`<span>${icon("clock")}${effort}</span>` : ""}${ev ? html`<span>${icon("trophy")}${ev} <em>(optimistic)</em></span>` : ""}</p>` : ""}
    ${factors.length ? html`<ul class="factors">${factors.map((f) => { const g = glyph(f.effect); return html`<li><span class="fx ${g.cls}" aria-hidden="true">${g.g}</span><span class="sr">${g.w}: </span><span><b>${f.label}</b>${f.detail ? html`<span class="muted-t"> · ${f.detail}</span>` : ""}</span></li>`; })}</ul>` : ""}
    <p class="hint">Estimates, not promises. Priors are rough until you log results.</p></section>`;
}
function ineligibleBanner(c) {
  const coi = (c.tags || []).includes("conflict-of-interest");
  const f = arr(c.odds_factors).find((x) => /not eligible/i.test(x.label || ""));
  const reason = coi ? "You're on the organizing committee." : (f && f.detail) || c.fit_reasons[0] || "Region or age restricted.";
  return html`<section class="d-sec banner" role="note"><h2>${icon("alert")}${coi ? "Conflict of interest" : "Not eligible for you"}</h2><p>${coi ? reason : `Not eligible for you: ${reason}`}</p></section>`;
}

function glanceC(c) {
  const prize = prizeText(c), team = teamText(c), fmt = formatText(c);
  const n = c.participants;
  const parts = n > 0 ? `${joined(n).replace(" joined", "")} ${SRC_WORD[c.participants_source] || (c.participants_source === "estimate" ? "(estimate)" : "")}`.trim() : "";
  const dl = c.deadline_iso ? html`${fmtDate(c.deadline_iso)}${dueChip(c.deadline_iso)}` : isRolling(c) ? "Rolling" : "";
  const opens = !c.deadline_iso && c.registration_opens_iso ? fmtDate(c.registration_opens_iso) : "";
  const sm = c.skill_match;
  return html`<dl class="glance">
    ${fc("Prize", prize ? prize.text : "", prize && prize.muted ? "muted" : "")}
    ${fc("Deadline", dl)}${fc(c.is_calendar_estimate ? "Registration opens about" : "Registration opens", opens)}
    ${fc("Team", team ? team.text : "", team ? team.cls : "")}
    ${fc("Format", fmt ? fmt.text : c.is_online ? "Online" : "", fmt ? fmt.cls : "")}
    ${fc("Open to", SCOPE[c.eligibility_scope] || "")}${fc("Platform", c.platform)}
    ${fc("Participants", parts)}
    ${sm != null ? html`<div class="fc"><dt>Skill match</dt><dd><span class="num">${Math.round(sm)}/100</span><span class="meter" role="img" aria-label="Skill match ${Math.round(sm)} of 100"><i style="width:${Math.max(2, Math.min(100, sm))}%"></i></span></dd></div>` : ""}
  </dl>`;
}

function prizesBlock(prizes) {
  const ps = arr(prizes).filter((p) => p && (p.place || p.amount || p.note));
  if (!ps.length) return "";
  return html`<div class="prizes">${ps.slice(0, 12).map((p) => html`<div class="prize"><span class="pl">${p.place || "Prize"}</span><span class="pa">${p.amount != null && p.amount !== "" ? String(p.amount) : ""}</span>${p.note ? html`<span class="pn muted-t">${p.note}</span>` : ""}</div>`)}</div>`;
}
function timelineBlock(tl) {
  const items = arr(tl).filter((t) => t && (t.label || t.text));
  if (!items.length) return "";
  let next = -1, best = Infinity;
  items.forEach((t, i) => { const n = daysUntil(t.date_iso); if (n != null && n >= 0 && n < best) { best = n; next = i; } });
  return html`<ol class="tl">${items.map((t, i) => {
    const n = daysUntil(t.date_iso);
    const when = t.date_iso ? fmtDate(t.date_iso) : t.text || "";
    const left = i === next ? (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} d`) : "";
    return html`<li class="${i === next ? "next" : n != null && n < 0 ? "past" : ""}" ${i === next ? raw('aria-current="step"') : ""}><span class="tl-dot" aria-hidden="true"></span><div><b>${t.label || when}</b>${t.label && when ? html`<span class="tl-d"> ${when}</span>` : ""}${left ? html` <span class="chip blue">${left}</span>` : ""}</div></li>`;
  })}</ol>`;
}
function linksBlock(links) {
  const ls = arr(links).map((l) => ({ label: str(l && l.label) || hostOf(l && l.url), url: safeUrl(l && l.url) })).filter((l) => l.url);
  if (!ls.length) return "";
  return html`<div class="btnrow">${ls.slice(0, 10).map((l) => html`<a class="btn sm" href="${l.url}" target="_blank" rel="noopener noreferrer">${icon("external")}<span>${l.label}</span></a>`)}</div>`;
}

const PREP_KEY = (id) => `ir.prep.${id}`;
function prepare(c, dt) {
  const d = dt || {};
  const text = `${d.overview || ""} ${d.submission || ""} ${d.data_or_tools || ""}`.toLowerCase();
  const items = [["rules", "Read the rules and eligibility"]];
  if (str(d.data_or_tools) || /data ?set|data|notebook/.test(text) || c.theme === "ds_ml") items.push(["data", "Check the data and problem statement"]);
  if ((c.max_team_size ?? 1) > 1 || /\bteam\b/.test(str(d.team).toLowerCase())) items.push(["team", `Form a team${c.max_team_size > 1 ? ` (up to ${c.max_team_size})` : ""}`]);
  items.push(["repo", "Set up the repo or notebook"]);
  if (c.requires_pitch === true || /pitch|demo video|presentation/.test(text)) items.push(["pitch", "Practise the pitch"]);
  if (c.deadline_iso) items.push(["early", "Plan to submit 24 h before the deadline"]);
  const picked = items.slice(0, 6);
  const done = lsGet(PREP_KEY(c.id), {}) || {};
  const n = picked.filter(([k]) => done[k]).length;
  return html`<details class="d-sec prep" data-prep="${c.id}"><summary><h2><span class="prep-t">Prepare</span> <span class="n num" data-prep-n>${n}/${picked.length}</span></h2></summary>
    <ul class="checks">${picked.map(([k, l]) => html`<li><label><input type="checkbox" data-act="d-prep" data-id="${c.id}" data-key="${k}" ${done[k] ? "checked" : ""}><span>${l}</span></label></li>`)}</ul>
    <p class="hint">Optional. Stored only in this browser.</p></details>`;
}

function compDyn(c, d) {
  if (d === undefined && c.has_detail) return skeleton();
  const dt = d && d.detail;
  if (!dt || typeof dt !== "object") {
    return html`${c.description ? sec("About", rich(`${c.id}:about`, c.description)) : ""}
      <p class="muted-t small gnote">${icon("alert")}Full details unavailable. Open the competition page for the rules.</p>${prepare(c, null)}`;
  }
  const desc = str(dt.overview) || str(c.description) || str(d.description);
  const hasEligTeam = str(dt.eligibility) || str(dt.team);
  return html`${sec("Overview", rich(`${c.id}:ov`, desc))}
    ${sec("Prizes", prizesBlock(dt.prizes))}${sec("Timeline", timelineBlock(dt.timeline))}
    ${hasEligTeam ? sec("Eligibility and team", html`${str(dt.eligibility) ? html`<h3>Who can enter</h3>${rich(`${c.id}:el`, dt.eligibility)}` : ""}${str(dt.team) ? html`<h3>Team</h3>${rich(`${c.id}:tm`, dt.team)}` : ""}`) : ""}
    ${sec("Evaluation", rich(`${c.id}:ev`, dt.evaluation))}${sec("Data and tools", rich(`${c.id}:da`, dt.data_or_tools))}
    ${sec("Submission", rich(`${c.id}:su`, dt.submission))}${sec("Links", linksBlock(dt.links))}
    ${prepare(c, dt)}`;
}

export function compDetail(c, ctx) {
  const inel = isIneligible(c);
  const tier = c.prestige_tier === 1 ? html`<span class="chip blue">Top tier</span>` : c.prestige_tier === 2 ? html`<span class="chip">Well known</span>` : "";
  const sub = html`${c.organizer || c.platform}${c.organizer && c.platform ? html` · ${c.platform}` : ""}${c.prestige_tier === 1 || c.prestige_tier === 2 ? html` ${tier}` : ""}`;
  const open = applyLink(c, inel ? "btn" : "btn btn-primary", "Open competition");
  return html`<article class="detail ${inel ? "inel" : ""}" data-detail="${c.id}">
    ${head(c, sub, ctx.back, open)}
    <div class="d-body">
      ${inel ? ineligibleBanner(c) : oddsPanel(c)}
      <section class="d-sec" aria-label="At a glance"><h2>At a glance</h2>${glanceC(c)}</section>
      ${inel ? "" : sec("Why it fits", list(c.fit_reasons.filter((r) => !/^odds|^effort|expected/i.test(r))))}
      <div class="d-dyn" data-dyn aria-live="polite">${compDyn(c, cachedDetail(c.id))}</div>
      ${c.tags.length ? html`<section class="d-sec"><h2>Tags</h2><div class="tagrow">${c.tags.filter((t) => !/^(final:|calendar-estimate|months-verified|region-locked|conflict-of-interest)/.test(t)).slice(0, 14).map((t) => html`<span class="chip">${t}</span>`)}</div></section>` : ""}
      ${notes(c)}
      <p class="d-foot"><button class="link-btn" type="button" data-act="ignore" data-id="${c.id}">${tracker.status(c.id) === "ignored" ? "Stop ignoring this competition" : "Ignore this competition"}</button></p>
    </div>
    ${bottomBar(c, "Open competition", !inel)}
  </article>`;
}

/* ------------------------------------------------------------------ loading + events */
function hydrate(it) {
  fetchDetail(it).then((d) => {
    const slot = document.querySelector(`[data-detail="${CSS.escape(String(it.id))}"] [data-dyn]`);
    if (!slot) return;
    slot.innerHTML = (it._kind === "job" ? jobDyn(it, d) : compDyn(it, d)).toString();
  });
}
export function detailFor(it, ctx) {
  const out = it._kind === "job" ? jobDetail(it, ctx) : compDetail(it, ctx);
  if (it.has_detail && cachedDetail(it.id) === undefined) queueMicrotask(() => hydrate(it));
  return out;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-act^='d-']");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "d-more") {
    const body = b.previousElementSibling, key = b.dataset.key;
    const open = !body.classList.contains("open");
    body.classList.toggle("open", open);
    if (open) expanded.add(key); else expanded.delete(key);
    b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "Show less" : "Read more";
  } else if (act === "d-copy") {
    const v = b.dataset.value || "";
    const done = () => toast("Copied");
    try { navigator.clipboard.writeText(v).then(done, () => toast("Could not copy")); } catch (err) { toast("Could not copy"); }
  } else if (act === "d-post") {
    const sec0 = b.closest("[data-post]");
    const j = { id: b.dataset.id, title: (document.querySelector(".d-title h1") || {}).textContent || "" };
    sec0.querySelector(".post-slot").innerHTML = postFrame(j, sec0.dataset.post).toString();
    try { sessionStorage.setItem("ir.post.auto", "1"); } catch (err) { /* private mode */ }
  } else return;
  e.preventDefault();
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.dataset || t.dataset.act !== "d-prep") return;
  const done = lsGet(PREP_KEY(t.dataset.id), {}) || {};
  if (t.checked) done[t.dataset.key] = true; else delete done[t.dataset.key];
  lsSet(PREP_KEY(t.dataset.id), done);
  const box = t.closest("[data-prep]"), n = box.querySelector("[data-prep-n]");
  if (n) n.textContent = `${box.querySelectorAll("input:checked").length}/${box.querySelectorAll("input").length}`;
});

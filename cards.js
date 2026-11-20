// List rows (internship / competition) and the small pieces they share. Follows UX_SPEC "show / don't show".
import { html, raw, safeUrl, closes, fmtIdr, fmtMonth, buildHash } from "./util.js";
import { icon, bookmarkIcon } from "./icons.js";
import { tracker } from "./store.js";
import { CAT, MODE, isMuted, isFresh, isVerified, verifiedWhy, isIneligible, isPractice, isRestricted, isRolling } from "./model.js";

export function itemHref(id, ctx = {}) {
  return buildHash("item", { from: ctx.from || "", ...(ctx.params || {}) }, id);
}

/** Fit score in a small SVG ring. Muted items get a neutral ring (no fit colour). */
export function scoreRing(n, muted = false) {
  const v = Math.max(0, Math.min(100, Math.round(n || 0)));
  const tone = muted ? "mute" : v >= 80 ? "hi" : v >= 60 ? "mid" : "low";
  return html`<div class="ring ${tone}" role="img" aria-label="Fit score ${v} of 100" title="Fit score">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15"/><circle class="ring-fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${v} 100"/></svg>
    <span class="num">${v}</span></div>`;
}

export function saveBtn(it, cls = "icon-btn") {
  const s = tracker.status(it.id);
  const on = s !== "" && s !== "ignored";
  return html`<button class="${cls}" type="button" data-act="save" data-id="${it.id}" aria-pressed="${on}" aria-label="${on ? "Remove from tracker" : "Save"}: ${it.title}" title="${on ? "Saved" : "Save"}">${bookmarkIcon(on)}</button>`;
}
export function applyLink(it, cls = "btn btn-primary", label = "Apply") {
  const u = safeUrl(it.apply_url);
  return u ? html`<a class="${cls}" href="${u}" target="_blank" rel="noopener noreferrer">${label}${icon("external")}<span class="sr"> (opens in new tab)</span></a>` : "";
}

/* ---------------------------------------------------------------- internship facts */
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mon = (ym) => (ym && /^\d{4}-\d{2}/.test(ym) ? MON3[Number(ym.slice(5, 7)) - 1] : "");
const yr = (ym) => (ym && /^\d{4}/.test(ym) ? Number(ym.slice(0, 4)) : 0);
const nowYear = () => new Date().getFullYear();

export function modeText(j) {
  const m = MODE[j.work_mode] || "";
  if (j.work_mode === "unknown") return j.city || "";
  if (j.work_mode === "remote") return "Remote";
  return j.city ? `${m} · ${j.city}` : m;
}
/** {text, muted}. "Dec–Jan · 2 mo", "6 mo", or muted "Dates unclear". */
export function periodText(j) {
  const bits = [];
  const s = mon(j.start_month), e = mon(j.end_month);
  if (s && e && j.start_month !== j.end_month) bits.push(`${s}–${e}`);
  else if (s) bits.push(`From ${s}`);
  if (s && yr(j.start_month) > nowYear()) bits[0] = `${bits[0]} '${String(yr(j.start_month)).slice(2)}`;
  if (j.duration_months) bits.push(`${Math.round(j.duration_months * 10) / 10} mo`);
  return bits.length ? { text: bits.join(" · "), muted: false } : { text: "Dates unclear", muted: true };
}
export function payText(j) {
  if (j.pay_status === "unpaid") return { text: "Unpaid", cls: "warn" };
  if (j.pay_status === "paid") {
    if (j.compensation_idr_month) return { text: `${fmtIdr(j.compensation_idr_month)}/mo`, cls: "" };
    return { text: "Paid", cls: "" };
  }
  return null;
}
const fact = (ic, text, cls = "") => html`<span class="fact ${cls}">${icon(ic)}<span>${text}</span></span>`;

function reasonsFor(j, shown) {
  const city = (j.city || "").toLowerCase();
  const out = [];
  for (const r of j.fit_reasons) {
    const l = r.toLowerCase();
    if (l.startsWith("verified internship")) continue; // shown as the small "Verified" mark instead
    if (/^(remote|hybrid|onsite|on-site)\b/.test(l)) continue;
    if (shown.pay && /\b(paid|unpaid|rp|stipend|pay)\b/.test(l)) continue;
    if (/^\d+(\.\d+)?\s*(months?|mo|weeks?)$/.test(l)) continue;
    if (city && l.includes(city)) continue;
    out.push(r);
    if (out.length === 2) break;
  }
  return out;
}

/** One internship row. ctx = {from, params, selectedId, wide} */
export function jobRow(j, ctx = {}) {
  const muted = isMuted(j);
  const pay = payText(j), per = periodText(j), dl = closes(j.deadline_iso), mode = modeText(j);
  const reasons = muted ? [] : reasonsFor(j, { pay: !!pay });
  const href = itemHref(j.id, ctx);
  const sel = ctx.selectedId === String(j.id);
  const status = tracker.status(j.id);
  return html`<article class="row ${muted ? "muted-item" : ""} ${sel ? "selected" : ""}" data-row="${j.id}" ${sel ? raw('aria-current="true"') : ""}>
    <div class="row-body">
      <h3 class="row-title"><a href="${href}" class="row-link">${j.title}</a>${isFresh(j) ? html`<span class="dot-new" title="New"><span class="sr">New</span></span>` : ""}</h3>
      <div class="row-sub"><span class="company">${j.company}</span>${(j.fit_flags || []).includes("well_known_company") ? html`<span class="known" title="Well-known company">${icon("verified")}<span class="sr">Well-known</span></span>` : ""}${j.source_label ? html`<span class="src">${j.source_label}</span>` : ""}${isVerified(j) ? html`<span class="vfy" title="Verified internship: ${verifiedWhy(j)}">${icon("check")}<span>Verified</span></span>` : ""}</div>
      <div class="facts">
        ${mode ? fact(j.work_mode === "remote" ? "globe" : "pin", mode) : ""}
        ${fact("calendar", per.text, per.muted ? "muted" : "")}
        ${j.hours_per_week ? fact("clock", `${j.hours_per_week} h/wk`) : ""}
        ${pay ? fact("wallet", pay.text, pay.cls) : ""}
        ${dl ? fact("timer", dl.text, dl.cls) : ""}
      </div>
      ${reasons.length ? html`<div class="reasons">${reasons.join(" · ")}</div>` : ""}
      ${j.eligibility === "unclear" || j.trust_score < 60 || status && status !== "saved" && status !== "ignored" ? html`<div class="chips-line">
        ${j.eligibility === "unclear" ? html`<span class="chip amber">Eligibility unclear</span>` : ""}${j.trust_score < 60 ? html`<span class="chip red">Check legitimacy</span>` : ""}${status && status !== "saved" && status !== "ignored" ? html`<span class="chip blue">${status[0].toUpperCase() + status.slice(1)}</span>` : ""}</div>` : ""}
    </div>
    <div class="row-side">${scoreRing(j.fit_score, muted)}${saveBtn(j)}</div>
    ${safeUrl(j.apply_url) ? html`<a class="row-apply only-wide" href="${safeUrl(j.apply_url)}" target="_blank" rel="noopener noreferrer">Apply${icon("external")}<span class="sr"> (opens in new tab)</span></a>` : ""}
  </article>`;
}

/* ---------------------------------------------------------------- competition facts */
export function prizeText(c) {
  const pool = (c.prize_pool || "").trim();
  if (c.prize_value_idr) return { text: /\d/.test(pool) ? `${pool.replace(/\s*USD$/i, "")} ≈ ${fmtIdr(c.prize_value_idr)}` : `≈ ${fmtIdr(c.prize_value_idr)}`, muted: false };
  if (pool) return /\d/.test(pool) ? { text: pool, muted: false } : { text: "Non-cash prize", muted: true };
  return null;
}
export function teamText(c) {
  const mn = c.min_team_size, mx = c.max_team_size;
  if (mn == null && mx == null) return null;
  if ((mn ?? 1) <= 1) return mx === 1 ? { text: "Solo only", cls: "" } : { text: "Solo OK", cls: "good" };
  if (mn <= 3) return { text: `Team ${mn}–${Math.min(mx ?? 3, 3)}`.replace(/(\d)–\1$/, "$1"), cls: "" };
  return { text: "Team 4+", cls: "warn" };
}
export function formatText(c) {
  if (c.no_pitch_online) return { text: "Online · No pitch", cls: "hl" };
  if (c.requires_pitch === true) return { text: "Has pitch", cls: "muted" };
  if (c.is_online === false) return { text: "Onsite final", cls: "muted" };
  return null;
}
export const joined = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n)) + " joined";
export function prestigeBadge(c) {
  return c.prestige_tier === 1 ? html`<span class="chip blue">Top</span>` : c.prestige_tier === 2 ? html`<span class="chip">Well known</span>` : "";
}
/* ---- odds (replaces the old win-chance meter) ---- */
export const ODDS_LABEL = { long_shot: "Long shot", fair: "Fair", good: "Good", strong: "Strong", unknown: "Unknown" };
/** "8%", "0.4%", "<0.1%": percentages are shown with 1 decimal under 10, none from 10. */
export function fmtPct(p) {
  if (p == null || !isFinite(p)) return "";
  if (p > 0 && p < 0.1) return "<0.1%";
  const v = p >= 10 ? Math.round(p) : Math.round(p * 10) / 10;
  return `${v}%`;
}
export const fmtRange = (c) => (c.odds_low != null && c.odds_high != null ? `${fmtPct(c.odds_low).replace("%", "")}–${fmtPct(c.odds_high)}` : "");
export function oddsSummary(c) {
  if (c.odds_tier === "unknown") return "Odds unknown: field size not published";
  const rng = fmtRange(c);
  return `Odds ${ODDS_LABEL[c.odds_tier].toLowerCase()}: about ${fmtPct(c.odds_pct)}${rng ? ` (range ${rng})` : ""}${c.odds_confidence ? `, ${c.odds_confidence} confidence` : ""}`;
}
/** One chip: "Good · ~8%". Tone by tier (CSS .odds-*). Ineligible competitions get a plain "Not eligible" chip instead. */
export function oddsChip(c) {
  if (isIneligible(c)) return html`<span class="chip odds odds-none" title="You can't enter this one">Not eligible</span>`;
  if (isPractice(c)) return html`<span class="chip odds odds-none" title="No cash prize: practice or ranking only">Practice · no prize</span>`;
  const t = c.odds_tier;
  const tip = oddsSummary(c);
  if (t === "unknown") return html`<span class="chip odds odds-unknown" title="${tip}" aria-label="${tip}">Odds unknown</span>`;
  return html`<span class="chip odds odds-${t.replace("_", "-")}" title="${tip}" aria-label="${tip}">${ODDS_LABEL[t]} · <span class="num">~${fmtPct(c.odds_pct)}</span></span>`;
}
const EFFORT = { weekend: "Weekend", "1-2 weeks": "1–2 wks", "month+": "Month+" };
export const effortShort = (c) => EFFORT[c.effort_label] || "";
export function effortChip(c) {
  const t = effortShort(c);
  if (!t) return "";
  const tip = `Effort${c.effort_hours ? ` ≈ ${Math.round(c.effort_hours)} h` : ""}: ${t.toLowerCase()}`;
  return html`<span class="chip effort" title="${tip}" aria-label="${tip}">${icon("clock")}${t}</span>`;
}

export function compRow(c, ctx = {}) {
  const prize = prizeText(c), team = teamText(c), fmt = formatText(c), dl = closes(c.deadline_iso);
  const href = itemHref(c.id, ctx);
  const sel = ctx.selectedId === String(c.id);
  const opens = c.registration_opens_iso;
  const reasons = c.fit_reasons.filter((r) => !/online|no pitch|prize|participants|solo|team|odds|effort|expected|not eligible/i.test(r)).slice(0, 2);
  return html`<article class="row ${sel ? "selected" : ""}" data-row="${c.id}" ${sel ? raw('aria-current="true"') : ""}>
    <div class="row-body">
      <h3 class="row-title"><a href="${href}" class="row-link">${c.title}</a></h3>
      <div class="row-sub"><span class="company">${c.organizer || c.platform}</span>${prestigeBadge(c)}${c.organizer && c.platform ? html`<span class="src">${c.platform}</span>` : ""}</div>
      <div class="facts">
        ${prize ? fact("trophy", prize.text, prize.muted ? "muted" : "") : ""}
        ${c.is_calendar_estimate ? (opens ? fact("calendar", `Opens ~${fmtMonth(opens.slice(0, 7))}`) : "") : dl ? fact("timer", dl.text, dl.cls) : isRolling(c) ? fact("timer", "Rolling") : ""}
        ${team ? fact("users", team.text, team.cls) : ""}
        ${fmt ? fact(c.is_online === false ? "pin" : "globe", fmt.text, fmt.cls) : ""}
      </div>
      <div class="chips-line">${oddsChip(c)}${isIneligible(c) ? "" : effortChip(c)}${isRestricted(c) && !isIneligible(c) ? html`<span class="chip amber" title="Restricted access: check eligibility before investing time">Restricted access</span>` : ""}${c.participants > 0 && !isIneligible(c) ? html`<span class="muted-t small">${joined(c.participants)}</span>` : ""}</div>
      ${reasons.length ? html`<div class="reasons">${reasons.join(" · ")}</div>` : ""}
    </div>
    <div class="row-side">${scoreRing(c.fit_score)}${saveBtn(c)}</div>
    ${safeUrl(c.apply_url) ? html`<a class="row-apply only-wide" href="${safeUrl(c.apply_url)}" target="_blank" rel="noopener noreferrer">Apply${icon("external")}<span class="sr"> (opens in new tab)</span></a>` : ""}
  </article>`;
}
export const rowFor = (it, ctx) => (it._kind === "job" ? jobRow(it, ctx) : compRow(it, ctx));

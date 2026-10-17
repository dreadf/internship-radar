// Data loading, normalisation, and pure list logic (filter / sort / counts). No DOM here.
import { daysUntil, num, cmpNull } from "./util.js";
import { tracker } from "./store.js";

export const CAT = {
  data_science: "Data Science", machine_learning: "ML / AI", data_analytics: "Data Analytics",
  data_engineering: "Data Eng", ui_ux: "UI/UX", product_ba_erp: "Product / BA / ERP",
  software_engineering: "Software", graphic_design: "Design", web_development: "Web development", other: "Unclassified",
};
const CAT_ALIAS = { erp: "product_ba_erp", marketing: "other", business_ops: "other" };
/** Categories the user does not want promoted: muted styling, never in Today, never "New", hidden from "All". */
export const MUTED = new Set(["web_development", "other"]);
/** Categories eligible for Today's "Top picks". */
export const CORE = new Set(["data_science", "machine_learning", "data_analytics", "data_engineering", "ui_ux"]);
export const ROLE_PILLS = [
  "data_science", "machine_learning", "data_analytics", "data_engineering", "ui_ux", "product_ba_erp", "software_engineering", "graphic_design",
];
export const MORE_ROLES = ["web_development", "other"];
export const LANES = [
  { v: "take_now", label: "Take now", help: "Take now = remote, or on-site in Java during your Dec-Feb break." },
  { v: "plan_ahead", label: "Plan ahead", help: "Plan ahead = on-site in Java for 2027 semesters, or dates not stated." },
  { v: "long_term", label: "Long-term", help: "Long-term = full-time or 6+ month commitments. Searchable, never alerted." },
];
export const THEME = { ds_ml: "DS / ML", ui_ux: "UI/UX", software: "Software", other: "Other" };
export const MODE = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite", unknown: "Mode unknown" };

export const D = { jobs: [], comps: [], byId: new Map(), generated: "", error: "", loaded: false, prevVisit: null };

export const isMuted = (it) => MUTED.has(it.category);
export const isIgnored = (it) => tracker.status(it.id) === "ignored";
export const jobOpen = (j) => j.deadline_iso == null || daysUntil(j.deadline_iso) >= 0;
export const compOpen = (c) => c.deadline_iso == null || daysUntil(c.deadline_iso) >= 0;
const ts = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : 0; };

/** "New": first seen after the previous visit (fallback: server is_new, first seen within 48h). Muted roles are never new. */
export function isNew(j) {
  if (j._kind !== "job" || isMuted(j)) return false;
  const seen = ts(j.first_seen_at);
  if (D.prevVisit != null && seen) return seen > D.prevVisit && Date.now() - seen < 7 * 864e5;
  return !!j.is_new;
}
/** Dot next to the title: first seen within 48 h. */
export const isFresh = (j) => j._kind === "job" && !isMuted(j) && !!j.is_new;

function normJob(x) {
  const cat = CAT_ALIAS[x.category] || x.category || "other";
  return {
    ...x, _kind: "job", category: CAT[cat] ? cat : "other", lane: x.lane || "plan_ahead", work_mode: x.work_mode || "unknown",
    fit_score: num(x.fit_score, num(x.match_score, 0)), fit_reasons: x.fit_reasons || [], fit_flags: x.fit_flags || [],
    eligibility: x.eligibility === "eligible" ? "eligible" : "unclear", source_label: x.source_label || x.source || "",
    job_desc_summary: x.job_desc_summary || [], requirements: x.requirements || [], scam_flags: x.scam_flags || [],
    alt_apply_urls: x.alt_apply_urls || [], is_emergency: !!x.is_emergency, pay_status: x.pay_status || "unknown",
    trust_score: num(x.trust_score, 100), is_new: !!x.is_new, first_seen_at: x.first_seen_at || "",
  };
}
function normComp(x) {
  return {
    ...x, _kind: "comp", theme: x.theme || "other", fit_score: num(x.fit_score, 0), fit_reasons: x.fit_reasons || [],
    tags: x.tags || [], themes: x.themes || [], is_emergency: !!x.is_emergency, platform: x.platform || x.source || "",
    eligibility_scope: x.eligibility_scope || "unknown",
    no_pitch_online: x.no_pitch_online != null ? !!x.no_pitch_online : (x.is_online === true && x.requires_pitch !== true),
  };
}
async function getJson(name) {
  const r = await fetch(name, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}
export async function loadData() {
  D.error = "";
  const [j, c] = await Promise.allSettled([getJson("jobs.json"), getJson("competitions.json")]);
  if (j.status === "rejected" && c.status === "rejected") D.error = "Could not load data. " + j.reason.message;
  const jj = j.status === "fulfilled" ? j.value : {}, cc = c.status === "fulfilled" ? c.value : {};
  D.jobs = (jj.items || jj.postings || []).map(normJob);
  D.comps = (cc.items || cc.competitions || []).map(normComp);
  D.generated = jj.generated_at || cc.generated_at || "";
  D.byId = new Map();
  for (const it of [...D.jobs, ...D.comps]) D.byId.set(String(it.id), it);
  D.loaded = true;
}

/* ------------------------------------------------------------- internships */
export const JOB_SORTS = [
  { v: "fit", label: "Best fit" }, { v: "deadline", label: "Deadline" }, { v: "newest", label: "Newest" }, { v: "pay", label: "Pay" },
];
export const JOB_PARAMS = ["lane", "role", "sort", "q", "mode", "pay", "elig", "city", "src", "due", "new"];
const csv = (v) => (v ? String(v).split(",").filter(Boolean) : []);
export const payKind = (j) => (j.pay_status === "paid" ? "paid" : j.pay_status === "unpaid" ? "unpaid" : "unknown");

export function jobMatches(j, st, { skipRole = false } = {}) {
  if (!jobOpen(j) || isIgnored(j)) return false;
  if (st.lane && st.lane !== "all" && j.lane !== st.lane) return false;
  if (!skipRole) {
    if (!st.role || st.role === "all") { if (isMuted(j)) return false; } else if (j.category !== st.role) return false;
  }
  if (st.q) {
    const hay = `${j.title} ${j.company} ${j.source_label} ${j.city || ""} ${j.location || ""} ${CAT[j.category]} ${j.requirements.join(" ")}`.toLowerCase();
    if (!st.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  const modes = csv(st.mode); if (modes.length && !modes.includes(j.work_mode)) return false;
  const pays = csv(st.pay); if (pays.length && !pays.includes(payKind(j))) return false;
  if (st.elig === "ok" && j.eligibility !== "eligible") return false;
  if (st.city && j.city !== st.city) return false;
  if (st.src && j.source_label !== st.src) return false;
  if (st.due) { const n = daysUntil(j.deadline_iso); if (n == null || n < 0 || n > Number(st.due)) return false; }
  if (st.new && !isNew(j)) return false;
  return true;
}
export function sortJobs(items, sort) {
  const fit = (a, b) => b.fit_score - a.fit_score;
  const mutedLast = (a, b) => Number(isMuted(a)) - Number(isMuted(b));
  const out = [...items];
  if (sort === "deadline") out.sort((a, b) => cmpNull(a.deadline_iso, b.deadline_iso) || mutedLast(a, b) || fit(a, b));
  else if (sort === "newest") out.sort((a, b) => mutedLast(a, b) || ts(b.first_seen_at || b.posted_at) - ts(a.first_seen_at || a.posted_at) || fit(a, b));
  else if (sort === "pay") out.sort((a, b) => cmpNull(b.compensation_idr_month, a.compensation_idr_month) || mutedLast(a, b) || fit(a, b));
  else out.sort((a, b) => mutedLast(a, b) || fit(a, b));
  return out;
}
/** Counts by role for the current lane + secondary filters (role itself ignored). */
export function roleCounts(st) {
  const counts = { all: 0 };
  for (const j of D.jobs) {
    if (!jobMatches(j, st, { skipRole: true })) continue;
    counts[j.category] = (counts[j.category] || 0) + 1;
    if (!isMuted(j)) counts.all++;
  }
  return counts;
}
export function laneCounts(st) {
  const c = { take_now: 0, plan_ahead: 0, long_term: 0 };
  for (const j of D.jobs) if (jobMatches(j, { ...st, lane: "all" }) && j.lane in c) c[j.lane]++;
  return c;
}

/* ------------------------------------------------------------ competitions */
export const COMP_SORTS = [
  { v: "fit", label: "Best fit" }, { v: "win", label: "Win chance" }, { v: "prize", label: "Prize" },
  { v: "deadline", label: "Deadline" }, { v: "prestige", label: "Prestige" },
];
export const COMP_PARAMS = ["tab", "theme", "np", "sort", "q", "team", "scope", "plat", "prize"];
export const COMP_THEMES = [["ds_ml", "DS / ML"], ["ui_ux", "UI/UX"], ["software", "Software"], ["other", "Other"]];
export const isSoon = (c) => !!c.is_calendar_estimate;
export function teamKind(c) {
  const mn = c.min_team_size, mx = c.max_team_size;
  if (mn == null && mx == null) return null;
  if ((mn ?? 1) <= 1) return "solo";
  return mn <= 3 ? "team23" : "team4";
}
export const scopeKind = (c) => (/indonesia/.test(c.eligibility_scope) ? "indonesia" : /student/.test(c.eligibility_scope) ? "students" : c.eligibility_scope === "global" ? "global" : "");

export function compMatches(c, st, { skipTheme = false, skipTab = false } = {}) {
  if (isIgnored(c)) return false;
  if (!skipTab) {
    if ((st.tab === "soon") !== isSoon(c)) return false;
  }
  if (!isSoon(c) && !compOpen(c)) return false;
  if (!skipTheme && st.theme && st.theme !== "all" && c.theme !== st.theme) return false;
  if (st.np && !c.no_pitch_online) return false;
  if (st.q && !`${c.title} ${c.organizer || ""} ${c.platform} ${c.tags.join(" ")}`.toLowerCase().includes(st.q.toLowerCase())) return false;
  if (st.team === "solo" && teamKind(c) !== "solo") return false;
  if (st.team === "team" && !["solo", "team23"].includes(teamKind(c))) return false;
  if (st.scope && scopeKind(c) !== st.scope && !(st.scope === "students" && scopeKind(c) === "indonesia" && /student/.test(c.eligibility_scope))) return false;
  if (st.plat && c.platform !== st.plat) return false;
  if (st.prize && !(num(c.prize_value_idr, 0) >= Number(st.prize))) return false;
  return true;
}
export function sortComps(items, sort) {
  const fit = (a, b) => b.fit_score - a.fit_score;
  const out = [...items];
  if (sort === "win") out.sort((a, b) => cmpNull(b.win_chance, a.win_chance) || fit(a, b));
  else if (sort === "prize") out.sort((a, b) => cmpNull(b.prize_value_idr, a.prize_value_idr) || fit(a, b));
  else if (sort === "deadline") out.sort((a, b) => cmpNull(a.deadline_iso || a.registration_opens_iso, b.deadline_iso || b.registration_opens_iso) || fit(a, b));
  else if (sort === "prestige") out.sort((a, b) => cmpNull(a.prestige_tier, b.prestige_tier) || fit(a, b));
  else out.sort(fit);
  return out;
}

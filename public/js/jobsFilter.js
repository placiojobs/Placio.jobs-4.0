/**
 * Search / filter / sort over the in-browser job index (pure functions, no
 * Firestore access — see jobIndex.js for why). Rules, unchanged from the
 * original site:
 *   - AND across categories, OR within a category (dept A or B, AND city X)
 *   - search: every word must appear in title/company/city/department/skills
 *   - experience: a job "1-2" matches both the "1" and "2" filter chips
 */
import { matchesExperienceToken } from "./experience.js";

import { PAGE_SIZE, SORT_OPTIONS } from "./site-config.js";
export { PAGE_SIZE };
export const SORTS = SORT_OPTIONS.map((s) => s.value);

export function filterEntries(entries, params = {}) {
  let out = entries;

  const search = (params.search || "").trim().toLowerCase();
  if (search) {
    const tokens = search.split(/\s+/).filter(Boolean);
    out = out.filter((e) => tokens.every((t) => e.searchableText.includes(t)));
  }
  const pick = (list, key) => {
    if (!list || !list.length) return;
    const wanted = new Set(list.map((v) => v.toLowerCase()));
    out = out.filter((e) => wanted.has(e[key]));
  };
  pick(params.dept, "normalizedDept");
  pick(params.location, "normalizedLocation");
  pick(params.company, "normalizedCompany");

  if (params.exp && params.exp.length) {
    out = out.filter((e) =>
      params.exp.some((token) =>
        matchesExperienceToken({ min: e.experienceMin, max: e.experienceMax, isFresher: e.isFresher }, token)
      )
    );
  }
  return sortEntries(out, params.sort);
}

export function sortEntries(entries, sort = "latest") {
  const arr = entries.slice();
  const byLatest = (a, b) => (a.order !== undefined && b.order !== undefined ? a.order - b.order : (b.createdAt || 0) - (a.createdAt || 0)) || byId(a, b);
  const byId = (a, b) => (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0); // stable, deterministic tie-break
  switch (sort) {
    case "companyAsc":
      return arr.sort((a, b) => a.normalizedCompany.localeCompare(b.normalizedCompany) || byId(a, b));
    case "companyDesc":
      return arr.sort((a, b) => b.normalizedCompany.localeCompare(a.normalizedCompany) || byId(a, b));
    case "locationAsc":
      return arr.sort((a, b) => a.normalizedLocation.localeCompare(b.normalizedLocation) || byId(a, b));
    default:
      return arr.sort(byLatest);
  }
}

/** Facet counts for the filter sidebar, computed from the loaded index. */
export function countBy(entries, key) {
  const m = new Map();
  for (const e of entries) {
    const v = e[key];
    if (v) m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

// ── Recommendations (explainable weighted overlap; zero database reads) ──
const WEIGHTS = { sameDept: 40, sameExperienceBand: 25, skillOverlap: 15, sameLocation: 15, sameCompany: 20, titleWord: 8 };
const titleWords = (t) => new Set(String(t).toLowerCase().split(/\s+/).filter((w) => w.length > 3));

function experienceOverlap(a, b) {
  if (a.experienceMin === null || b.experienceMin === null) return false;
  const aMax = a.experienceMax ?? Infinity;
  const bMax = b.experienceMax ?? Infinity;
  return a.experienceMin <= bMax && b.experienceMin <= aMax;
}

/** @param current the viewed job (index-entry shape) */
export function recommend(entries, current, { limit = 6, sameCompanyOnly = false } = {}) {
  const words = titleWords(current.title);
  const skills = current.normalizedSkills || [];
  return entries
    .filter((e) => e.jobId !== current.jobId)
    .filter((e) => (sameCompanyOnly ? e.normalizedCompany === current.normalizedCompany : true))
    .map((e) => {
      let score = 0;
      if (current.normalizedDept && e.normalizedDept === current.normalizedDept) score += WEIGHTS.sameDept;
      if (experienceOverlap(e, current)) score += WEIGHTS.sameExperienceBand;
      if (current.normalizedLocation && e.normalizedLocation === current.normalizedLocation) score += WEIGHTS.sameLocation;
      if (e.normalizedCompany === current.normalizedCompany) score += WEIGHTS.sameCompany;
      score += [...titleWords(e.title)].filter((w) => words.has(w)).length * WEIGHTS.titleWord;
      let hits = 0;
      for (const s of skills) if (s && e.searchableText.includes(s)) hits += 1;
      score += hits * WEIGHTS.skillOverlap;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.e.order ?? 0) - (b.e.order ?? 0))
    .slice(0, limit)
    .map((x) => x.e);
}


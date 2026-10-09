/**
 * Filter state <-> shareable URL. Every page that links into Browse Jobs
 * (search box, Quick Access, matrices, chips) builds its URL here, so URL and
 * UI can never drift apart. Also upgrades the old site's legacy links
 * (?q=…, ?filter=…) so previously shared URLs keep working.
 */
const LEGACY_FILTER_TO_QUERY = {
  All: {},
  Engineering: { dept: ["Engineering"] },
  "Data Science": { dept: ["Data Analyst", "Data Scientist"] },
  Marketing: { dept: ["Marketing"] },
  Design: { dept: ["Software-UI/UX Design"] },
  Finance: { dept: ["Finance"] },
  Consulting: { dept: ["Consulting"] },
  Sales: { dept: ["Sales"] },
  Product: { dept: ["Product"] },
  Remote: { location: ["Remote"] },
  Internship: { dept: ["Apprentice"] },
  Fresher: { dept: ["Fresher"] },
};

const SORTS = new Set(["latest", "companyAsc", "companyDesc", "locationAsc"]);
const MAX_MULTI = 50; // a legitimate filter never needs more than this

export function paramsToSearch(p) {
  const sp = new URLSearchParams();
  if (p.search) sp.set("search", p.search);
  if (p.dept?.length) sp.set("dept", p.dept.join(","));
  if (p.location?.length) sp.set("location", p.location.join(","));
  if (p.company?.length) sp.set("company", p.company.join(","));
  if (p.exp?.length) sp.set("exp", p.exp.join(","));
  if (p.sort && p.sort !== "latest") sp.set("sort", p.sort);
  return sp;
}

export function searchToParams(sp) {
  const list = (key) => {
    const v = sp.get(key);
    return v ? v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_MULTI) : undefined;
  };
  const sort = sp.get("sort");
  return {
    search: (sp.get("search") || "").slice(0, 200).trim() || undefined,
    dept: list("dept"),
    location: list("location"),
    company: list("company"),
    exp: list("exp"),
    sort: SORTS.has(sort) ? sort : "latest",
  };
}

/** Reads modern params first; only translates legacy ?q / ?filter when absent. */
export function applyLegacyParams(sp) {
  const params = searchToParams(sp);
  let wasLegacy = false;
  if (!params.search) {
    const q = sp.get("q");
    if (q) { params.search = q.slice(0, 200); wasLegacy = true; }
  }
  if (!params.dept?.length && !params.location?.length) {
    const f = sp.get("filter");
    if (f && Object.prototype.hasOwnProperty.call(LEGACY_FILTER_TO_QUERY, f)) {
      const m = LEGACY_FILTER_TO_QUERY[f];
      if (m.dept) params.dept = [...m.dept];
      if (m.location) params.location = [...m.location];
      if (m.dept || m.location) wasLegacy = true;
    }
  }
  return { params, wasLegacy };
}

export function buildJobsHref(params) {
  const qs = paramsToSearch(params).toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

export function describeFilters(p) {
  const bits = [];
  if (p.search) bits.push(`"${p.search}"`);
  if (p.dept?.length) bits.push(p.dept.join(", "));
  if (p.location?.length) bits.push(p.location.join(", "));
  if (p.exp?.length) bits.push(p.exp.join(", "));
  return bits.join(" · ") || "All jobs";
}

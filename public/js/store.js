/**
 * Everything Placio stores in the visitor's browser lives here (and nowhere else),
 * so the Privacy / Cookie preferences panel can list it truthfully.
 *
 * Placio sets NO cookies of its own. It uses localStorage / sessionStorage / IndexedDB only.
 * Nothing here leaves the device: saved jobs, recent jobs and recent searches are never sent to a server.
 */

/** Documented inventory — shown to the user in "Privacy / Cookie preferences". */
export const STORAGE_ITEMS = [
  { key: "placio.consent.v1", where: "localStorage", category: "Necessary", purpose: "Remembers your privacy choice." },
  { key: "placio.theme", where: "localStorage", category: "Functional", purpose: "Remembers light / dark mode." },
  { key: "placio.savedJobs.v1", where: "localStorage", category: "Functional", purpose: "Jobs you saved on this device." },
  { key: "placio.recentlyViewed.v1", where: "localStorage", category: "Functional", purpose: "Jobs you opened recently, for “Continue exploring”." },
  { key: "placio.recentSearches.v1", where: "localStorage", category: "Functional", purpose: "Your recent searches, for “Continue exploring”." },
  { key: "placio-index (database)", where: "IndexedDB", category: "Necessary", purpose: "A cached copy of the job list so Browse Jobs loads fast and uses less data." },
  { key: "placio.meta.v1 / placio.job.*", where: "sessionStorage", category: "Necessary", purpose: "Short-lived cache of job counts and recently opened jobs (cleared when you close the tab)." },
];

const SAVED = "placio.savedJobs.v1";
const VIEWED = "placio.recentlyViewed.v1";
const SEARCHES = "placio.recentSearches.v1";
const MAX_VIEWED = 20;
const MAX_SEARCHES = 8;
const MAX_SAVED = 500;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(fallback) && !Array.isArray(v) ? fallback : v;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / blocked: saving is a convenience and must never break the page */
  }
}
const okId = (id) => typeof id === "string" && /^[A-Za-z0-9_]{1,64}$/.test(id);

// ── Saved jobs ──
export const getSavedIds = () => read(SAVED, []).filter(okId);
export const isSaved = (id) => getSavedIds().includes(id);
/** @returns the new saved state (true = saved) */
export function toggleSaved(id) {
  if (!okId(id)) return false;
  const cur = getSavedIds();
  const was = cur.includes(id);
  write(SAVED, was ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, MAX_SAVED));
  return !was;
}

// ── Recently viewed ──
export const getRecentlyViewed = () =>
  read(VIEWED, []).filter((e) => e && okId(e.jobId) && typeof e.slug === "string" && typeof e.title === "string");
export function recordViewed({ jobId, slug, title, company }) {
  if (!okId(jobId)) return;
  const cur = getRecentlyViewed().filter((e) => e.jobId !== jobId);
  write(VIEWED, [{ jobId, slug, title, company, viewedAt: Date.now() }, ...cur].slice(0, MAX_VIEWED));
}

// ── Recent searches (replay only; there is deliberately no "clear history" UI) ──
export const getRecentSearches = () => read(SEARCHES, []).filter((e) => e && typeof e.href === "string" && e.href.startsWith("/jobs"));
export function recordSearch({ query, filtersLabel, href }) {
  if (typeof href !== "string" || !href.startsWith("/jobs")) return;
  const cur = getRecentSearches().filter((e) => e.href !== href);
  write(SEARCHES, [{ query, filtersLabel, href, searchedAt: Date.now() }, ...cur].slice(0, MAX_SEARCHES));
}

// ── Consent ──
/** @returns {{analytics:boolean}|null}  null = the visitor hasn't chosen yet */
export function getConsent() {
  try {
    const c = JSON.parse(localStorage.getItem("placio.consent.v1") || "null");
    return c && typeof c.analytics === "boolean" ? c : null;
  } catch {
    return null;
  }
}
export function setConsent(analytics) {
  write("placio.consent.v1", { analytics: !!analytics, at: Date.now() });
  window.dispatchEvent(new Event("placio:consent-changed"));
}

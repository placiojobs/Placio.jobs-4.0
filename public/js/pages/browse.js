/**
 * Browse Jobs. Where things live:
 *   filtering / sorting rules ..... jobsFilter.js
 *   URL <-> filter state .......... url.js
 *   which options exist ........... site-config.js (+ any extra values found in the data)
 *   data (index download/cache) ... indexLoader.js
 * All filtering is local once the index is loaded: changing a filter makes ZERO network requests.
 */
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS, EXPERIENCE_TOKENS, SORT_OPTIONS, PAGE_SIZE } from "../site-config.js";
import { applyLegacyParams, paramsToSearch, describeFilters } from "../url.js";
import { filterEntries, countBy } from "../jobsFilter.js";
import { loadIndex } from "../indexLoader.js";
import { mountSearchBox } from "../components/searchbox.js";
import { createMultiSelect, createExperienceField } from "../components/filters.js";
import { jobCardHtml, skeletonCards, stateHtml } from "../ui.js";
import { recordSearch } from "../store.js";
import { track } from "../analytics.js";
import { icons } from "../icons.js";
import { $, esc, errorInfo, shareLink, lockScroll } from "../utils.js";

let params = applyLegacyParams(new URLSearchParams(location.search)).params;
let entries = null;
let results = [];
let shown = 0;
let searchBox, fDept, fLoc, fCompany, fExp;

const resultsEl = $("#results");
const moreEl = $("#more");
const metaEl = $("#meta");
const chipsEl = $("#chips");

// ── static controls ──
$("#sort").innerHTML = SORT_OPTIONS.map((s) => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join("");
$("#close-filters").innerHTML = icons.close;
resultsEl.innerHTML = skeletonCards(6);

function syncUrl() {
  const qs = paramsToSearch(params).toString();
  history.replaceState(null, "", qs ? `/jobs?${qs}` : "/jobs");
}

function hasFilters(p = params) {
  return Boolean(p.search || p.dept?.length || p.location?.length || p.company?.length || p.exp?.length);
}

function setParams(patch, { remember = true } = {}) {
  params = { ...params, ...patch };
  syncUrl();
  apply();
  if (remember && hasFilters()) {
    recordSearch({ query: params.search || "", filtersLabel: describeFilters(params), href: `/jobs?${paramsToSearch(params).toString()}` });
    track("search");
  }
}

// ── rendering ──
function renderChips() {
  const chips = [
    ...(params.search ? [{ k: "search", label: `“${params.search}”` }] : []),
    ...(params.dept || []).map((v) => ({ k: "dept", v, label: v })),
    ...(params.location || []).map((v) => ({ k: "location", v, label: v })),
    ...(params.company || []).map((v) => ({ k: "company", v, label: v })),
    ...(params.exp || []).map((v) => ({ k: "exp", v, label: `Exp ${v}` })),
  ];
  chipsEl.hidden = chips.length === 0;
  chipsEl.innerHTML = chips.map((c, i) => `<button type="button" class="chip" data-i="${i}" aria-label="Remove filter ${esc(c.label)}">${esc(c.label)} <b aria-hidden="true">×</b></button>`).join("") + (chips.length ? `<button type="button" class="clear" id="clear-all">Clear all</button>` : "");
  chipsEl._chips = chips;
  $("#filter-count").textContent = chips.length ? `(${chips.length})` : "";
}

function renderResults(append = false) {
  const slice = results.slice(append ? shown - PAGE_SIZE : 0, shown);
  if (!append) {
    if (!results.length) {
      resultsEl.innerHTML = stateHtml({
        title: "No matching jobs found.",
        text: hasFilters() ? "Try removing a filter, searching a different city, or exploring a related department." : "No jobs are published yet. Please check back soon.",
        actions: hasFilters() ? `<button class="btn btn--primary btn--sm" id="empty-clear" type="button">Clear filters</button>` : "",
      });
    } else {
      resultsEl.innerHTML = `<div class="grid-jobs">${slice.map(jobCardHtml).join("")}</div>`;
    }
  } else {
    resultsEl.querySelector(".grid-jobs").insertAdjacentHTML("beforeend", slice.map((j, i) => jobCardHtml(j, i)).join(""));
  }
  moreEl.hidden = shown >= results.length;
  metaEl.hidden = results.length === 0;
  metaEl.innerHTML = `Showing <b>${Math.min(shown, results.length)}</b> of <b>${results.length}</b> ${hasFilters() ? "matching" : "active"} jobs`;
}

function apply() {
  renderChips();
  if (!entries) return;
  results = filterEntries(entries, params);
  shown = Math.min(PAGE_SIZE, results.length);
  renderResults(false);
  // keep widgets in sync with state (chips / URL may have changed it)
  searchBox?.setValue(params.search || "");
  fDept?.setSelected(params.dept || []);
  fLoc?.setSelected(params.location || []);
  fCompany?.setSelected(params.company || []);
  fExp?.setSelected(params.exp || []);
  $("#sort").value = params.sort || "latest";
}

// ── events ──
chipsEl.addEventListener("click", (e) => {
  if (e.target.closest("#clear-all")) return clearAll();
  const b = e.target.closest("[data-i]");
  if (!b) return;
  const c = chipsEl._chips[Number(b.dataset.i)];
  if (c.k === "search") return setParams({ search: undefined });
  setParams({ [c.k]: (params[c.k] || []).filter((x) => x !== c.v) });
});
function clearAll() {
  params = { sort: params.sort };
  syncUrl();
  apply();
}
resultsEl.addEventListener("click", (e) => { if (e.target.closest("#empty-clear")) clearAll(); if (e.target.closest("#retry")) init(); });
$("#clear-sheet").addEventListener("click", clearAll);
$("#load-more").addEventListener("click", () => {
  shown = Math.min(shown + PAGE_SIZE, results.length);
  renderResults(true);
});
$("#sort").addEventListener("change", (e) => setParams({ sort: e.target.value }, { remember: false }));
$("#search-go").addEventListener("click", () => setParams({ search: searchBox.input.value.trim() || undefined }));
$("#share-search").addEventListener("click", () => shareLink({ title: "Placio job search", url: location.href }));

// back/forward restores the filters that were in the URL
addEventListener("popstate", () => { params = applyLegacyParams(new URLSearchParams(location.search)).params; apply(); });

// ── filter sheet (mobile) ──
const sheet = $("#filters");
const backdrop = $("#sheet-backdrop");
function setSheet(open) {
  sheet.classList.toggle("is-open", open);
  backdrop.classList.toggle("is-open", open);
  $("#open-filters").setAttribute("aria-expanded", String(open));
  lockScroll(open && !matchMedia("(min-width:1024px)").matches);
  if (open) sheet.querySelector("input")?.focus({ preventScroll: true });
}
$("#open-filters").addEventListener("click", () => setSheet(true));
$("#close-filters").addEventListener("click", () => setSheet(false));
$("#show-results").addEventListener("click", () => setSheet(false));
backdrop.addEventListener("click", () => setSheet(false));
addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet.classList.contains("is-open")) { setSheet(false); $("#open-filters").focus(); } });
matchMedia("(min-width:1024px)").addEventListener("change", (e) => e.matches && setSheet(false));
// swipe down on the handle / header to dismiss
(() => {
  let startY = null;
  const grab = $("#grab"), head = sheet.querySelector(".filters__head");
  const down = (e) => { startY = e.clientY; sheet.style.transition = "none"; };
  const move = (e) => { if (startY !== null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`; };
  const up = (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.style.transition = "";
    sheet.style.transform = "";
    if (dy > 90) setSheet(false);
  };
  [grab, head].forEach((el) => { el.addEventListener("pointerdown", down); });
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
})();

// ── start ──
function uniqueExtras(base, present) {
  const known = new Set(base.map((b) => b.toLowerCase()));
  return [...present].filter((p) => p && !known.has(p.toLowerCase())).sort((a, b) => a.localeCompare(b));
}

async function init() {
  resultsEl.innerHTML = skeletonCards(6);
  $("#results-wrap").setAttribute("aria-busy", "true");
  try {
    const r = await loadIndex();
    entries = r.entries;
  } catch (e) {
    const info = errorInfo(e);
    resultsEl.innerHTML = stateHtml({ kind: "error", title: "Couldn’t load jobs", text: info.message, actions: `<button class="btn btn--primary btn--sm" id="retry" type="button">Try again</button>` });
    metaEl.hidden = true;
    $("#results-wrap").setAttribute("aria-busy", "false");
    return;
  }

  const deptCounts = countBy(entries, "dept"), locCounts = countBy(entries, "location"), coCounts = countBy(entries, "company");
  // options = configured list (keeps your order) + any extra values that exist in the data
  const deptOptions = [...MAJOR_DEPARTMENTS, ...uniqueExtras(MAJOR_DEPARTMENTS, deptCounts.keys())];
  const locOptions = [...MAJOR_LOCATIONS, ...uniqueExtras(MAJOR_LOCATIONS, locCounts.keys())];
  const companyOptions = [...coCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((c) => c[0]);

  searchBox ||= mountSearchBox($("#search"), {
    placeholder: "Search roles, companies, skills…",
    value: params.search || "",
    shortcut: true,
    getEntries: () => entries,
    onSubmit: (q) => setParams({ search: q || undefined }),
    onSelectDept: (d) => setParams({ dept: [...new Set([...(params.dept || []), d])] }),
    onSelectLocation: (l) => setParams({ location: [...new Set([...(params.location || []), l])] }),
  });
  fDept = createMultiSelect($("#f-dept"), { label: "Department", options: deptOptions, counts: deptCounts, selected: params.dept, onChange: (v) => setParams({ dept: v }) });
  fLoc = createMultiSelect($("#f-loc"), { label: "Location", options: locOptions, counts: locCounts, selected: params.location, onChange: (v) => setParams({ location: v }) });
  if (companyOptions.length) fCompany = createMultiSelect($("#f-company"), { label: "Company", options: companyOptions, counts: coCounts, selected: params.company, onChange: (v) => setParams({ company: v }) });
  fExp = createExperienceField($("#f-exp"), { tokens: EXPERIENCE_TOKENS, selected: params.exp, onChange: (v) => setParams({ exp: v }) });

  $("#results-wrap").setAttribute("aria-busy", "false");
  if (applyLegacyParams(new URLSearchParams(location.search)).wasLegacy) syncUrl(); // upgrade old ?q= / ?filter= links
  apply();
  if (hasFilters()) recordSearch({ query: params.search || "", filtersLabel: describeFilters(params), href: `/jobs?${paramsToSearch(params).toString()}` });
}

renderChips();
init();

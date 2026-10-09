/** Homepage: search, shortcuts, latest jobs, popular lists, matrices. Costs ONE Firestore read (meta/index, cached 5 min). */
import { QUICK_ACCESS, POPULAR_SEARCHES, FRESHER_MATRIX_DEPARTMENTS, FRESHER_MATRIX_CITIES } from "../site-config.js";
import { buildJobsHref } from "../url.js";
import { loadMeta } from "../indexLoader.js";
import { decodeLatest } from "../jobIndex.js";
import { mountSearchBox } from "../components/searchbox.js";
import { jobCardHtml, stateHtml, observeReveals } from "../ui.js";
import { esc, errorInfo, $ } from "../utils.js";
import { getRecentlyViewed, getRecentSearches } from "../store.js";

// hero accent: split into letters so each reacts subtly to the pointer (purely decorative)
const accent = $("#hero-accent");
if (accent && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const text = accent.textContent;
  accent.setAttribute("aria-label", text);
  accent.innerHTML = [...text].map((c) => (c === " " ? " " : `<span class="ch" aria-hidden="true">${esc(c)}</span>`)).join("");
}

// search
const go = (q) => (location.href = buildJobsHref({ search: q || undefined }));
const box = mountSearchBox($("#hero-search"), {
  placeholder: "Try “software fresher Pune”…",
  onSubmit: go,
  onSelectDept: (d) => (location.href = buildJobsHref({ dept: [d] })),
  onSelectLocation: (l) => (location.href = buildJobsHref({ location: [l] })),
});
$("#hero-go").addEventListener("click", () => go(box.input.value.trim()));

// popular searches + quick access (from site-config.js)
$("#popular").innerHTML = `<span class="popular__label">Popular:</span>` + POPULAR_SEARCHES.map((t) => `<a class="pill" href="${esc(buildJobsHref({ search: t }))}">${esc(t)}</a>`).join("");
$("#quick").innerHTML = QUICK_ACCESS.map((q) => `<a class="quick-card reveal" href="${esc(buildJobsHref({ dept: q.dept && [...q.dept], location: q.location && [...q.location] }))}"><span class="quick-card__icon" aria-hidden="true">${esc(q.icon)}</span>${esc(q.label)}</a>`).join("");

// Fresher × City (fixed rows from config; every cell is a link into Browse Jobs)
$("#fresher-matrix").innerHTML = `<thead><tr><th scope="col">Department</th>${FRESHER_MATRIX_CITIES.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${FRESHER_MATRIX_DEPARTMENTS.map((d) => `<tr><th scope="row">${esc(d.replace("Fresher-", ""))}</th>${FRESHER_MATRIX_CITIES.map((c) => `<td><a href="${esc(buildJobsHref({ dept: [d], location: [c] }))}">View</a></td>`).join("")}</tr>`).join("")}</tbody>`;

// Continue exploring (this device only)
const viewed = getRecentlyViewed().slice(0, 6);
const searches = getRecentSearches().slice(0, 6);
if (viewed.length || searches.length) {
  const sec = $("#continue");
  sec.hidden = false;
  sec.innerHTML = `<h2 class="h-section">Continue Exploring</h2>
    ${searches.length ? `<div class="pill-row">${searches.map((s) => `<a class="pill" href="${esc(s.href)}">${esc(s.filtersLabel || s.query || "Search")}</a>`).join("")}</div>` : ""}
    ${viewed.length ? `<div class="rec-grid" style="margin-top:1rem">${viewed.map((v) => `<a class="rec-card" href="/jobs/${esc(v.slug)}"><b>${esc(v.title)}</b><span>${esc(v.company)}</span></a>`).join("")}</div>` : ""}`;
}

// Everything below comes from the single small meta document.
function renderMeta(meta) {
  const latest = decodeLatest(meta);
  const el = $("#latest");
  el.innerHTML = latest.length
    ? `<div class="grid-jobs">${latest.map(jobCardHtml).join("")}</div>`
    : stateHtml({ title: "No jobs yet.", text: "Once jobs are published from the admin dashboard they appear here automatically." });

  const dn = meta.depts?.names || [], dc = meta.depts?.counts || [], ln = meta.locs?.names || [], lc = meta.locs?.counts || [];
  if (dn.length || ln.length) {
    $("#popular-lists").hidden = false;
    $("#pop-depts").innerHTML = dn.slice(0, 8).map((n, i) => `<a class="pill" href="${esc(buildJobsHref({ dept: [n] }))}">${esc(n)}<small>${Number(dc[i]) || 0}</small></a>`).join("");
    $("#pop-cities").innerHTML = ln.slice(0, 8).map((n, i) => `<a class="pill" href="${esc(buildJobsHref({ location: [n] }))}">${esc(n)}<small>${Number(lc[i]) || 0}</small></a>`).join("");
  }

  const m = meta.matrix;
  if (m && m.depts?.length && m.cities?.length) {
    $("#dc-section").hidden = false;
    const rows = m.depts.map((d, r) => `<tr><th scope="row">${esc(d)}</th>${m.cities.map((c, k) => {
      const n = m.counts[r * m.cities.length + k] || 0;
      return n ? `<td><a href="${esc(buildJobsHref({ dept: [d], location: [c] }))}" aria-label="${esc(d)} in ${esc(c)}: ${n} jobs"><span class="count">${n}</span></a></td>` : `<td class="zero" aria-label="none">–</td>`;
    }).join("")}</tr>`).join("");
    $("#dept-matrix").innerHTML = `<thead><tr><th scope="col">Department</th>${m.cities.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody>`;
  }
  observeReveals();
}

async function load() {
  try {
    const meta = await loadMeta();
    if (!meta) {
      $("#latest").innerHTML = stateHtml({ title: "No jobs yet.", text: "Once jobs are published from the admin dashboard they appear here automatically." });
      return;
    }
    renderMeta(meta);
  } catch (e) {
    const info = errorInfo(e);
    $("#latest").innerHTML = stateHtml({ kind: "error", title: "Couldn’t load the latest jobs", text: info.message, actions: `<button class="btn btn--outline btn--sm" id="retry" type="button">Try again</button>` });
    $("#retry").addEventListener("click", load);
  }
}
load();
observeReveals();

/** Homepage: search, shortcuts, latest jobs, popular lists, matrices. Costs ONE Firestore read (meta/index, cached 5 min). */
import { POPULAR_SEARCHES, FRESHER_MATRIX_DEPARTMENTS, FRESHER_MATRIX_CITIES, DEPARTMENT_PAGES, DEPARTMENT_MORE } from "../site-config.js";
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
  placeholder: "Search by role, skill, or city...",
  onSubmit: go,
  onSelectDept: (d) => (location.href = buildJobsHref({ dept: [d] })),
  onSelectLocation: (l) => (location.href = buildJobsHref({ location: [l] })),
});
$("#hero-go").addEventListener("click", () => go(box.input.value.trim()));

// hero quick-filter pills: filter the Latest Opportunities cards in place (no reload)
const isRemote = (x) => /remote/i.test(x.location || "") || /remote/i.test(x.type || "");
const isFresher = (x) => /^fresher/i.test(x.dept || "") || x.experienceMin === 0 || /fresher/i.test(x.exp || "");
const PILLS = [
  { id: "all", t: "Browse All Jobs", href: "/jobs", test: () => true },
  { id: "fresher", t: "Freshers", href: buildJobsHref({ dept: ["Fresher"] }), test: isFresher },
  { id: "remote", t: "Remote Jobs", href: buildJobsHref({ location: ["Remote"] }), test: isRemote },
  ...["Bengaluru", "Hyderabad", "Pune"].map((c) => ({ id: c, t: c, href: buildJobsHref({ location: [c] }), test: (x) => (x.location || "").toLowerCase() === c.toLowerCase() })),
];
let allLatest = [];
let activePill = "all";
function drawLatest() {
  const el = $("#latest");
  const p = PILLS.find((x) => x.id === activePill) || PILLS[0];
  $("#latest-all").setAttribute("href", p.id === "all" ? "/jobs?sort=latest" : p.href);
  if (!allLatest.length) return;
  const list = allLatest.filter(p.test);
  el.innerHTML = list.length
    ? `<div class="grid-jobs">${list.map(jobCardHtml).join("")}</div>`
    : `<div class="latest-empty"><div class="latest-empty__title">No recent ${esc(p.t)} listings yet</div><p class="latest-empty__text">The newest openings don’t include this filter right now — see every matching job instead.</p><a class="latest-empty__link" href="${esc(p.href)}">See all ${esc(p.t)} →</a></div>`;
  observeReveals();
}
$("#hero-quick").innerHTML = PILLS.map((x) => `<a class="pill${x.id === activePill ? " is-active" : ""}" data-pill="${esc(x.id)}" href="${esc(x.href)}" aria-pressed="${x.id === activePill}">${esc(x.t)}</a>`).join("");
$("#hero-quick").addEventListener("click", (e) => {
  const a = e.target.closest("[data-pill]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  activePill = a.dataset.pill;
  $("#hero-quick").querySelectorAll("[data-pill]").forEach((n) => { const on = n.dataset.pill === activePill; n.classList.toggle("is-active", on); n.setAttribute("aria-pressed", on); });
  drawLatest();
});

// popular searches + quick access (from site-config.js)
$("#popular").innerHTML = `<span class="popular__label">Popular:</span>` + POPULAR_SEARCHES.map((t) => `<a class="pill" href="${esc(buildJobsHref({ search: t }))}">${esc(t)}</a>`).join("");

// Fresher × City (fixed rows from config; every cell is a link into Browse Jobs)
if ($("#fresher-matrix")) $("#fresher-matrix").innerHTML = `<thead><tr><th scope="col">Department</th>${FRESHER_MATRIX_CITIES.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${FRESHER_MATRIX_DEPARTMENTS.map((d) => `<tr><th scope="row">${esc(d.replace("Fresher-", ""))}</th>${FRESHER_MATRIX_CITIES.map((c) => `<td><a href="${esc(buildJobsHref({ dept: [d], location: [c] }))}">View</a></td>`).join("")}</tr>`).join("")}</tbody>`;

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
  allLatest = latest;
  if (latest.length) drawLatest(); else el.innerHTML = emptyLatest();

  const dn = meta.depts?.names || [], dc = meta.depts?.counts || [], ln = meta.locs?.names || [], lc = meta.locs?.counts || [];
  if (dn.length || ln.length) {
    const cities = ln.map((n, i) => ({ n, c: Number(lc[i]) || 0 })).filter((x) => x.n && x.n !== "Other" && !/^remote$/i.test(x.n) && x.c > 0).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n)).slice(0, 8); // top 8 cities by live job count (recomputed at every publish)
    if (cities.length) {
      $("#city-section").hidden = false;
      const pin = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
      const draw = () => {
        const q = "";
        const list = cities.filter((x) => x.n.toLowerCase().includes(q));
        const shown = list;
        $("#city-grid").innerHTML = shown.length
          ? shown.map((x) => `<a class="city-card c${[...x.n].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 7}" href="${esc(buildJobsHref({ location: [x.n] }))}"><span class="city-card__icon">${pin}</span><span class="city-card__name">${esc(x.n)}<small>${x.c} job${x.c === 1 ? "" : "s"}</small></span></a>`).join("")
          : '<p class="muted">No city matches that search.</p>';
      };
      draw();
    }
  }

  // every department group: the full pages first, then the smaller groups (they open Browse Jobs filtered to that group)
  const deptCards = DEPARTMENT_PAGES.map((p) => ({ title: p.title, href: `/departments/${p.slug}`, t: meta.deptPages?.[p.slug]?.total }));
  DEPARTMENT_MORE.forEach((m, i) => {
    const t = meta.deptPages?.[`m${i}`];
    if (t?.total) deptCards.push({ title: m.title, href: buildJobsHref({ dept: t.active }), t: t.total });
  });
  $("#dept-grid").innerHTML = deptCards.map((d, i) => `<a class="city-card c${i % 7}" href="${esc(d.href)}"><span class="city-card__name">${esc(d.title)}<small>${d.t ? `${d.t} Openings` : "Explore roles →"}</small></span></a>`).join("");
  observeReveals();
}

function emptyLatest() {
  return `<div class="latest-empty"><div class="latest-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg></div><div class="latest-empty__title">Fresh openings are syncing</div><p class="latest-empty__text">Browse active roles by department above or check back shortly for today’s listings.</p><a class="latest-empty__link" href="/departments/software-it">Browse Departments →</a></div>`;
}

async function load() {
  try {
    const meta = await loadMeta();
    if (!meta) {
      $("#latest").innerHTML = emptyLatest();
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

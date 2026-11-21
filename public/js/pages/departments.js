/** Department pages: /departments (hub) and /departments/<slug>. Costs ONE Firestore read (meta/index, cached) like the homepage.
 *  All numbers were counted by the admin at publish time and live inside that single document. */
import { DEPARTMENT_PAGES, DEPARTMENT_MORE } from "../site-config.js";
import { buildJobsHref } from "../url.js";
import { loadMeta } from "../indexLoader.js";
import { stateHtml, observeReveals } from "../ui.js";
import { esc, errorInfo, $ } from "../utils.js";

const slug = document.body.dataset.dept || "";
const page = DEPARTMENT_PAGES.find((p) => p.slug === slug);
const label = (d) => d.replace(/^SAP-/, "SAP ").replace(/^(Software|Fresher|Engineer|Engineering|Finance|Sales|Marketing)-/, "");
const num = (n) => (Number(n) || 0).toLocaleString("en-IN");

function renderPage(meta) {
  const dp = meta?.deptPages?.[slug];
  const sum = $("#dept-summary");
  if (!dp || !dp.total) {
    sum.textContent = "";
    $("#dept-state").innerHTML = stateHtml({ title: "No jobs here right now", text: "New jobs are added regularly. Check back soon or browse all jobs.", actions: `<a class="btn btn--outline btn--sm" href="/jobs">Browse all jobs</a>` });
    return;
  }
  const cta = $("#dept-cta");
  cta.href = buildJobsHref({ dept: dp.active });
  cta.innerHTML = `See all ${num(dp.total)}<span class="lg"> ${esc(page.title)}</span> jobs`;
  sum.innerHTML = `<b>${num(dp.total)}</b> jobs across <b>${dp.active.length}</b> specialisation${dp.active.length === 1 ? "" : "s"}. <a href="${esc(buildJobsHref({ dept: dp.active }))}">See all ${esc(page.title)} jobs</a>`;
  const head = `<thead><tr><th scope="col">Specialisation</th><th scope="col">Total Openings</th>${dp.cities.map((c, k) => `<th scope="col" data-k="${k}"><span class="city-dot city-${k}" aria-hidden="true"></span>${esc(c)}</th>`).join("")}</tr></thead>`;
  const body = dp.subs.map((d, r) => {
    const cells = dp.cities.map((c, k) => {
      const n = dp.counts[r * dp.cities.length + k] || 0;
      return n ? `<td data-k="${k}"><a class="cell" data-r="${r}" data-k="${k}" href="${esc(buildJobsHref({ dept: [d], location: [c] }))}" aria-label="${esc(label(d))} in ${esc(c)}: ${n} jobs"><span class="count city-${k}">${n}</span></a></td>` : `<td class="zero" data-k="${k}" aria-label="none">–</td>`;
    }).join("");
    return `<tr data-name="${esc(label(d).toLowerCase())}"><th scope="row"><a class="spec" data-r="${r}" href="${esc(buildJobsHref({ dept: [d] }))}"><span class="spec-badge tone-${r % 6}" aria-hidden="true">${esc(label(d).charAt(0).toUpperCase())}</span><span class="spec-name">${esc(label(d))}<small class="spec-total">${num(dp.subTotals[r])} Openings</small></span></a></th><td><b>${num(dp.subTotals[r])}</b></td>${cells}</tr>`;
  }).join("");
  $("#dept-table").innerHTML = head + `<tbody>${body}</tbody>`;
  $("#dept-table-wrap").hidden = false;
  if (!document.getElementById("dept-swipe")) { const h = document.createElement("p"); h.id = "dept-swipe"; h.className = "swipe-hint"; h.textContent = "Swipe sideways to see all cities →"; $("#dept-table-wrap").after(h); }
  setupStatus(dp, meta);
  setupSearch(dp);
  setupTips(dp);
  // phones (< 768px): one card per specialisation, all cities in a 3-column grid, no sideways scrolling
  $("#dept-cards").innerHTML = dp.subs.map((d, r) => {
    const pills = dp.cities.map((c, k) => {
      const n = dp.counts[r * dp.cities.length + k] || 0;
      return n
        ? `<a class="city-pill city-${k}" data-k="${k}" href="${esc(buildJobsHref({ dept: [d], location: [c] }))}" aria-label="${esc(label(d))} in ${esc(c)}: ${n} jobs"><span>${esc(c)}</span><b>${n}</b></a>`
        : "";
    }).join("");
    return `<div class="dept-card" data-name="${esc(label(d).toLowerCase())}"><div class="dept-card__head"><a class="dept-card__name spec" href="${esc(buildJobsHref({ dept: [d] }))}"><span class="spec-badge tone-${r % 6}" aria-hidden="true">${esc(label(d).charAt(0).toUpperCase())}</span>${esc(label(d))}</a><span class="dept-card__total">${num(dp.subTotals[r])} Openings</span></div><div class="dept-card__grid">${pills}</div></div>`;
  }).join("");
  if (dp.active.length > dp.subs.length) {
    $("#dept-more").hidden = false;
  }
  setupGroups(dp);
}

/** Grouped specialisation sections (Software & IT): the biggest ones are already in the table above, so the sections
 *  list the REST. Before this runs (or without JavaScript) every specialisation is listed, which search engines can read. */
const GROUP_SHOW = 6;
function setupGroups(dp) {
  const wrap = $("#dept-groups");
  if (!wrap) return;
  const top = new Set(dp.subs || []);
  let left = 0;
  wrap.querySelectorAll(".dept-group").forEach((g) => {
    const chips = [...g.querySelectorAll(".pill[data-d]")].filter((c) => !top.has(c.dataset.d));
    g.querySelectorAll(".pill[data-d]").forEach((c) => { c.hidden = top.has(c.dataset.d); });
    g.querySelector(".pill--more")?.remove();
    g.hidden = chips.length === 0;
    left += chips.length;
    g.querySelector(".dept-group__n").textContent = `${chips.length} more specialisation${chips.length === 1 ? "" : "s"}`;
    if (chips.length > GROUP_SHOW) {
      chips.slice(GROUP_SHOW).forEach((c) => { c.hidden = true; });
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill pill--more";
      b.textContent = `+${chips.length - GROUP_SHOW} more`;
      b.addEventListener("click", () => { chips.forEach((c) => { c.hidden = false; }); b.remove(); });
      g.querySelector(".pill-row").append(b);
    }
  });
  const h = $("#dept-all-h");
  if (h) h.textContent = left ? `More ${page.title} specialisations` : `All ${page.title} specialisations`;
  if (!left) wrap.closest("section").hidden = true;
}

function setupStatus(dp, meta) {
  const el = $("#dept-status");
  if (!el) return;
  const at = Number(meta?.updatedAt) || 0;
  const days = at ? Math.floor((Date.now() - at) / 86400000) : -1;
  const when = days < 0 ? "regularly" : days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  el.innerHTML = `<span class="dot" aria-hidden="true"></span>Updated ${when} <i>•</i> ${num(dp.total)} Active Openings`;
  el.hidden = false;
}

function setupSearch(dp) {
  const input = $("#dept-q"), table = $("#dept-table");
  if (!input || !table) return;
  let empty = document.getElementById("dept-empty");
  if (!empty) { empty = document.createElement("p"); empty.id = "dept-empty"; empty.className = "muted"; empty.hidden = true; empty.textContent = "No specialisation or city matches that search."; $("#dept-table-wrap").after(empty); }
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    const cityHit = dp.cities.map((c) => !!q && c.toLowerCase().includes(q));
    const anyCity = cityHit.some(Boolean);
    let shown = 0;
    table.querySelectorAll("tbody tr").forEach((tr, r) => {
      const nameHit = !q || tr.dataset.name.includes(q);
      const cityRow = anyCity && dp.cities.some((c, k) => cityHit[k] && (dp.counts[r * dp.cities.length + k] || 0) > 0);
      const show = nameHit || cityRow;
      tr.hidden = !show; if (show) shown++;
    });
    const onlyCities = anyCity && ![...table.querySelectorAll("tbody tr")].some((tr) => !tr.hidden && tr.dataset.name.includes(q));
    table.querySelectorAll("[data-k]").forEach((el) => { el.hidden = onlyCities && !cityHit[Number(el.dataset.k)]; });
    document.querySelectorAll("#dept-cards .dept-card").forEach((card, r) => {
      const tr = table.querySelectorAll("tbody tr")[r];
      card.hidden = tr ? tr.hidden : false;
      card.querySelectorAll("[data-k]").forEach((el) => { el.hidden = onlyCities && !cityHit[Number(el.dataset.k)]; });
    });
    empty.hidden = shown > 0;
    $("#dept-table-wrap").hidden = shown === 0;
  };
  input.addEventListener("input", apply);
}

function setupTips(dp) {
  const wrap = $("#dept-table-wrap");
  let tip = document.getElementById("dept-tip");
  if (!tip) { tip = document.createElement("div"); tip.id = "dept-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true; document.body.appendChild(tip); }
  const nC = dp.cities.length;
  const topCities = (r, n = 3) => dp.cities.map((c, k) => ({ c, n: dp.counts[r * nC + k] || 0 })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, n).map((x) => `${esc(x.c)} <b>${x.n}</b>`).join(" · ");
  const pct = (a, b) => (b ? Math.max(1, Math.round((a / b) * 100)) : 0);
  const html = (el) => {
    const r = Number(el.dataset.r), name = esc(label(dp.subs[r])), tot = dp.subTotals[r] || 0;
    if (el.dataset.k !== undefined) {
      const k = Number(el.dataset.k), n = dp.counts[r * nC + k] || 0;
      return `<b>${name} in ${esc(dp.cities[k])}</b><span>${num(n)} ${n === 1 ? "Opening" : "Openings"} · ${pct(n, tot)}% of all ${name} roles</span><span>Top hubs: ${topCities(r)}</span><em>Click to see these jobs</em>`;
    }
    return `<b>${name}</b><span>${num(tot)} Openings · ${pct(tot, dp.total)}% of ${esc(page.title)}</span><span>Top hubs: ${topCities(r)}</span><em>Click to see all ${name} jobs</em>`;
  };
  const show = (el) => {
    tip.innerHTML = html(el); tip.hidden = false;
    const b = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = Math.min(Math.max(8, b.left + b.width / 2 - t.width / 2), innerWidth - t.width - 8);
    let y = b.top - t.height - 8; if (y < 8) y = b.bottom + 8;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  };
  const hide = () => { tip.hidden = true; };
  wrap.addEventListener("mouseover", (e) => { const el = e.target.closest("a.cell, a.spec"); el ? show(el) : hide(); });
  wrap.addEventListener("mouseleave", hide);
  wrap.addEventListener("focusin", (e) => { const el = e.target.closest("a.cell, a.spec"); if (el) show(el); });
  wrap.addEventListener("focusout", hide);
  wrap.addEventListener("scroll", hide, { passive: true });
}

function setupSwitcher() {
  if (!page || document.getElementById("dept-switch")) return;
  const wrap = document.createElement("div");
  wrap.id = "dept-switch"; wrap.className = "dept-switch";
  wrap.innerHTML = `<span class="dept-switch__lbl">Department:</span><select id="dept-select" aria-label="Switch department">${DEPARTMENT_PAGES.map((p) => `<option value="${esc(p.slug)}"${p.slug === slug ? " selected" : ""}>${esc(p.title)}</option>`).join("")}</select><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  const host = document.querySelector("main > .container");
  host.insertBefore(wrap, host.firstChild);
  $("#dept-select").addEventListener("change", (e) => { location.href = `/departments/${e.target.value}`; });
}
function updateSwitcher(meta) {
  const sel = $("#dept-select");
  if (!sel) return;
  const dps = meta?.deptPages || {};
  [...sel.options].forEach((o) => {
    const p = DEPARTMENT_PAGES.find((x) => x.slug === o.value), t = dps[o.value]?.total;
    o.textContent = t ? `${p.title} (${num(t)})` : p.title;
  });
}

function renderHub(meta) {
  const dps = meta?.deptPages || {};
  const card = (href, title, blurb, t) => `<a class="info-card reveal" href="${esc(href)}"><b>${esc(title)}</b><span>${esc(blurb)}</span>${t ? `<span class="pill" style="margin-top:.6rem;display:inline-block">${num(t)} jobs</span>` : ""}</a>`;
  const cards = DEPARTMENT_PAGES.map((p) => card(`/departments/${p.slug}`, p.title, p.blurb, dps[p.slug]?.total));
  // the smaller groups sit in the same grid (they open Browse Jobs filtered to that group)
  DEPARTMENT_MORE.forEach((m, i) => {
    const t = dps[`m${i}`];
    if (t?.total) cards.push(card(buildJobsHref({ dept: t.active }), m.title, m.blurb || `Browse all open ${m.title} roles.`, t.total));
  });
  $("#hub-cards").innerHTML = cards.join("");
}

function setupShare() {
  const a = $("#dept-share");
  if (!a || !page) return;
  const url = `https://placio.co.in/departments/${page.slug}`;
  a.innerHTML = 'Share<span class="lg"> on WhatsApp</span>';
  a.href = `https://wa.me/?text=${encodeURIComponent(`${page.title} jobs in India — live openings by city on Placio: ${url}`)}`;
}

async function load() {
  try {
    const meta = await loadMeta();
    page ? (renderPage(meta), updateSwitcher(meta)) : renderHub(meta || {});
    observeReveals();
  } catch (e) {
    const info = errorInfo(e);
    const host = $(page ? "#dept-state" : "#hub-cards");
    host.innerHTML = stateHtml({ kind: "error", title: "Couldn’t load the latest numbers", text: info.message, actions: `<button class="btn btn--outline btn--sm" id="retry" type="button">Try again</button>` });
    $("#retry").addEventListener("click", load);
  }
}
setupShare();
setupSwitcher();
load();

// 14-department pill strip: arrows (desktop) scroll the single row; the active pill is brought into view.
(function setupStrip() {
  const strip = document.querySelector(".dept-strip");
  if (!strip) return;
  const track = strip.querySelector(".dept-strip__track"), l = strip.querySelector(".dept-strip__arrow--l"), r = strip.querySelector(".dept-strip__arrow--r");
  const sync = () => { const max = track.scrollWidth - track.clientWidth; l.hidden = track.scrollLeft < 4; r.hidden = max < 4 || track.scrollLeft > max - 4; };
  const by = (dir) => track.scrollBy({ left: dir * Math.max(200, track.clientWidth * 0.6), behavior: "smooth" });
  l.addEventListener("click", () => by(-1)); r.addEventListener("click", () => by(1));
  track.addEventListener("scroll", sync, { passive: true }); window.addEventListener("resize", sync);
  const on = track.querySelector(".is-active");
  if (on) { const t = on.offsetLeft - (track.clientWidth - on.offsetWidth) / 2; track.scrollLeft = Math.max(0, t); }
  sync();
})();

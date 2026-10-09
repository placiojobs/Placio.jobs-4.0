/**
 * Manage Jobs: search / filter / sort / bulk activate & deactivate.
 * Active jobs come from the public index (no per-job reads). "Inactive" jobs are read from the database on demand.
 */
import { requireAdmin, withBusy } from "./guard.js";
import { loadAdminState, setJobsStatus, listInactiveJobs } from "./adminData.js";
import { $, esc, errorInfo, toast } from "../utils.js";

const PAGE = 50;
const main = $("#admin-main");
const { email } = await requireAdmin();

main.innerHTML = `<div class="admin-head"><div><h1>Manage jobs</h1><p class="lead" id="sub">Loading…</p></div><a class="btn btn--primary btn--sm" href="/admin/jobs/new">+ Add job</a></div>
  <div class="tabs" role="tablist" aria-label="Job status"><button class="tab" role="tab" id="tab-active" aria-selected="true">Active <b id="n-active">…</b></button><button class="tab" role="tab" id="tab-inactive" aria-selected="false">Inactive <b id="n-inactive">?</b></button></div>
  <div class="tools"><input class="input grow" id="q" type="search" placeholder="Search Job ID, title, company…" aria-label="Search jobs">
    <select class="select" id="fdept" aria-label="Department"><option value="">All departments</option></select>
    <select class="select" id="floc" aria-label="Location"><option value="">All locations</option></select>
    <select class="select" id="sort" aria-label="Sort"><option value="newest">Newest first</option><option value="id">Job ID</option><option value="title">Title A–Z</option><option value="company">Company A–Z</option></select></div>
  <div id="msg" class="banner" hidden style="margin-bottom:.8rem"></div>
  <div id="table"><div class="skeleton" style="height:240px"></div></div>
  <div class="pager" id="pager"></div>
  <div class="bulkbar" id="bulk" hidden></div>`;

let tab = "active";
let active = [];
let inactive = null; // loaded lazily
let selected = new Set();
let page = 0;
let rows = [];

const msg = (t, kind = "ok") => { const m = $("#msg"); m.hidden = !t; m.className = `banner banner--${kind}`; m.textContent = t || ""; };
const fromDoc = (d) => ({ jobId: d.jobId, title: d.title, company: d.company, location: d.location || "", dept: d.dept || "", exp: d.exp || "", slug: d.slug, order: 1e9 });

function fillSelect(sel, values, first) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${first}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  sel.value = values.includes(cur) ? cur : "";
}

function compute() {
  const src = tab === "active" ? active : inactive || [];
  const q = $("#q").value.trim().toLowerCase();
  const d = $("#fdept").value, l = $("#floc").value, s = $("#sort").value;
  rows = src.filter((j) => (!d || j.dept === d) && (!l || j.location === l) && (!q || `${j.jobId} ${j.title} ${j.company}`.toLowerCase().includes(q)));
  const cmp = { newest: (a, b) => a.order - b.order, id: (a, b) => (a.jobId < b.jobId ? -1 : 1), title: (a, b) => a.title.localeCompare(b.title), company: (a, b) => a.company.localeCompare(b.company) }[s];
  rows.sort(cmp);
  if (page * PAGE >= rows.length) page = 0;
}

function render() {
  compute();
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const allOnPage = slice.length > 0 && slice.every((j) => selected.has(j.jobId));
  $("#table").innerHTML = rows.length
    ? `<div class="table-wrap"><table class="table"><thead><tr><th style="width:2.2rem"><input type="checkbox" id="selpage" aria-label="Select all on this page" ${allOnPage ? "checked" : ""}></th><th>Job ID</th><th>Title</th><th>Company</th><th>Location</th><th>Department</th><th>Exp</th><th>Actions</th></tr></thead><tbody>${slice.map((j) => `<tr>
        <td><input type="checkbox" data-sel="${esc(j.jobId)}" aria-label="Select ${esc(j.jobId)}" ${selected.has(j.jobId) ? "checked" : ""}></td>
        <td class="mono">${esc(j.jobId)}</td><td class="wrap">${esc(j.title)}</td><td class="wrap">${esc(j.company)}</td><td>${esc(j.location)}</td><td class="trunc" title="${esc(j.dept)}">${esc(j.dept)}</td><td>${esc(j.exp)}</td>
        <td><div class="cell-actions">${tab === "active" ? `<a class="link-accent" href="/jobs/${esc(j.slug)}" target="_blank" rel="noopener">View</a>` : ""}<a class="link-accent" href="/admin/jobs/${esc(j.jobId)}/edit">Edit</a>
          <button class="${tab === "active" ? "link-danger" : "link-accent"}" data-one="${esc(j.jobId)}" type="button">${tab === "active" ? "Deactivate" : "Reactivate"}</button></div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="state"><div class="state__title">${tab === "active" ? "No jobs match." : inactive ? "No inactive jobs." : "Loading…"}</div></div>`;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  $("#pager").innerHTML = `<span>${rows.length} job${rows.length === 1 ? "" : "s"} · page ${page + 1} of ${pages}</span><div class="row"><button class="btn btn--outline btn--sm" id="prev" ${page === 0 ? "disabled" : ""} type="button">Previous</button><button class="btn btn--outline btn--sm" id="next" ${page + 1 >= pages ? "disabled" : ""} type="button">Next</button></div>`;
  renderBulk();
}

function renderBulk() {
  const bulk = $("#bulk");
  bulk.hidden = selected.size === 0;
  if (!selected.size) return;
  const onPage = rows.length;
  bulk.innerHTML = `<b>${selected.size} selected</b>
    ${selected.size < onPage ? `<button class="btn btn--ghost btn--sm" id="selall" type="button">Select all ${onPage} matching</button>` : ""}
    <button class="btn ${tab === "active" ? "btn--danger" : "btn--primary"} btn--sm" id="bulkact" type="button">${tab === "active" ? "Deactivate selected" : "Reactivate selected"}</button>
    <button class="btn btn--ghost btn--sm" id="selclear" type="button">Clear</button>`;
}

async function run(ids) {
  const status = tab === "active" ? "removed" : "active";
  const verb = tab === "active" ? "Deactivate" : "Reactivate";
  const note = tab === "active" ? "They disappear from search and their pages show “no longer available”. Nothing is deleted — you can reactivate them later." : "They return to search and their pages go live again.";
  if (!confirm(`${verb} ${ids.length} job${ids.length > 1 ? "s" : ""}?\n\n${note}`)) return;
  msg("Working…", "warn");
  try {
    const r = await setJobsStatus(ids, status, { actorEmail: email, onProgress: (t) => msg(t, "warn") });
    selected = new Set();
    await reload();
    msg(`${r.changed} job${r.changed > 1 ? "s" : ""} ${tab === "active" ? "deactivated" : "reactivated"}.${r.warning ? " " + r.warning : ""}`, r.warning ? "warn" : "ok");
    toast("Done");
  } catch (e) {
    msg(errorInfo(e).message, "error");
  }
}

async function reload() {
  const state = await loadAdminState();
  active = state.entries;
  inactive = tab === "inactive" ? await listInactiveJobs().then((d) => d.map(fromDoc)) : inactive && null;
  $("#n-active").textContent = active.length;
  $("#n-inactive").textContent = inactive ? inactive.length : "?";
  $("#sub").textContent = `${active.length} active job${active.length === 1 ? "" : "s"}.`;
  fillSelect($("#fdept"), [...new Set(active.map((j) => j.dept).filter(Boolean))].sort(), "All departments");
  fillSelect($("#floc"), [...new Set(active.map((j) => j.location).filter(Boolean))].sort(), "All locations");
  render();
}

main.addEventListener("click", async (e) => {
  const t = e.target;
  if (t.id === "prev") { page--; render(); }
  else if (t.id === "next") { page++; render(); }
  else if (t.id === "selclear") { selected.clear(); render(); }
  else if (t.id === "selall") { rows.forEach((j) => selected.add(j.jobId)); render(); }
  else if (t.id === "bulkact") withBusy(t, () => run([...selected]));
  else if (t.dataset.one) withBusy(t, () => run([t.dataset.one]));
  else if (t.id === "tab-active" || t.id === "tab-inactive") {
    const next = t.id === "tab-active" ? "active" : "inactive";
    if (next === tab) return;
    selected.clear(); page = 0; tab = next;
    $("#tab-active").setAttribute("aria-selected", String(tab === "active"));
    $("#tab-inactive").setAttribute("aria-selected", String(tab === "inactive"));
    if (tab === "inactive" && !inactive) {
      $("#table").innerHTML = `<div class="skeleton" style="height:160px"></div>`;
      try { inactive = (await listInactiveJobs()).map(fromDoc); $("#n-inactive").textContent = inactive.length; msg(""); }
      catch (ex) { msg(errorInfo(ex).message, "error"); inactive = []; }
    }
    render();
  }
});
main.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "selpage") { rows.slice(page * PAGE, page * PAGE + PAGE).forEach((j) => (t.checked ? selected.add(j.jobId) : selected.delete(j.jobId))); render(); }
  else if (t.dataset.sel) { t.checked ? selected.add(t.dataset.sel) : selected.delete(t.dataset.sel); renderBulk(); }
  else if (["fdept", "floc", "sort"].includes(t.id)) { page = 0; render(); }
});
$("#q").addEventListener("input", () => { page = 0; render(); });

try {
  await reload();
} catch (e) {
  $("#table").innerHTML = `<div class="state state--error"><div class="state__title">Couldn’t load jobs</div><p class="state__text">${esc(errorInfo(e).message)}</p></div>`;
}

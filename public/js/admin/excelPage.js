/**
 * Excel import / export screen.
 * Flow:  choose file -> Validate (nothing is written) -> review issues + what will change -> Commit.
 * Safety:  errors block publishing completely (no partial publish) · Full Sync needs an explicit confirmation ·
 *          unchanged rows are never rewritten · re-running the same file is harmless.
 * Where the rules live:  ../validate.js (rules) · excelIO.js (file reading/writing) · adminData.js (database writes)
 */
import { requireAdmin, withBusy } from "./guard.js";
import { parseWorkbookFile, ExcelFileError, exportJobsWorkbook, downloadBlob, loadExcelJS } from "./excelIO.js";
import { loadAdminState, planImport, commitImport, recentActivity } from "./adminData.js";
import { queryIssues } from "../validate.js";
import { EXCEL_COLUMNS } from "../normalize.js";
import { $, esc, errorInfo, formatDateTime, toast } from "../utils.js";

const main = $("#admin-main");
const { email } = await requireAdmin();
const ISSUE_PAGE = 100;

const S = { mode: "upsert", file: null, report: null, state: null, plan: null, counts: null, view: "all", sort: "severity", search: "", page: 0 };

main.innerHTML = `<div class="admin-head"><div><h1>Excel import &amp; export</h1><p class="lead">Columns: ${EXCEL_COLUMNS.map((c) => `<code>${esc(c)}</code>`).join(", ")}. Only <b>Job ID, title and company</b> are required.</p></div>
  <div class="row"><button class="btn btn--outline btn--sm" id="template" type="button">Download template</button><button class="btn btn--outline btn--sm" id="export" type="button">Export all active jobs</button></div></div>
  <p id="top-msg" class="banner" hidden style="margin-bottom:1rem"></p>
  <div id="step"></div>
  <div class="panel" style="margin-top:1.25rem"><h2>Import history</h2><div id="history"><button class="btn btn--outline btn--sm" id="load-history" type="button">Show recent imports</button></div></div>`;

const topMsg = (t, kind = "ok") => { const m = $("#top-msg"); m.hidden = !t; m.className = `banner banner--${kind}`; m.textContent = t || ""; };
const step = $("#step");

// ── template / export ──
$("#template").addEventListener("click", (ev) => withBusy(ev.currentTarget, async () => {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Jobs");
  ws.columns = EXCEL_COLUMNS.map((h) => ({ header: h, key: h, width: h === "desc" ? 50 : 20 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow({ "Job ID": "PL0001", title: "Software Engineer", company: "Example Pvt Ltd", location: "Bengaluru", salary: "", exp: "Fresher", type: "Hybrid", dept: "Software", link: "https://example.com/careers/1", desc: "", skill_set: "React, Node.js" });
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()]), "placio-template.xlsx");
}));
$("#export").addEventListener("click", (ev) => withBusy(ev.currentTarget, async () => {
  if (!confirm("Export all active jobs to Excel?\n\nThis reads every active job once (one Firestore read per job).")) return;
  try {
    const { blob, count } = await exportJobsWorkbook((t) => topMsg(t, "warn"));
    downloadBlob(blob, `placio-jobs-${new Date().toISOString().slice(0, 10)}.xlsx`);
    topMsg(`Exported ${count} jobs. The file has exactly the 11 columns above and can be edited and re-imported.`);
  } catch (e) { topMsg(errorInfo(e).message, "error"); }
}));

// ── history ──
$("#history").addEventListener("click", async (e) => {
  if (e.target.id !== "load-history") return;
  e.target.classList.add("is-loading");
  try {
    const acts = (await recentActivity(25)).filter((a) => a.action === "excel_import");
    $("#history").innerHTML = acts.length
      ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>File</th><th>Mode</th><th class="num">Added</th><th class="num">Updated</th><th class="num">Unchanged</th><th class="num">Removed</th></tr></thead><tbody>${acts.map((a) => `<tr><td class="mono">${esc(formatDateTime(a.at))}</td><td class="wrap">${esc(a.detail?.fileName || "")}</td><td>${esc(a.detail?.mode || "")}</td><td class="num">${a.detail?.added ?? 0}</td><td class="num">${a.detail?.updated ?? 0}</td><td class="num">${a.detail?.unchanged ?? 0}</td><td class="num">${a.detail?.removed ?? 0}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="muted">No imports yet.</p>';
  } catch (ex) { $("#history").innerHTML = `<p class="field__error">${esc(errorInfo(ex).message)}</p>`; }
});

// ── step 1: choose + validate ──
function drawUpload(note = "") {
  step.innerHTML = `<div class="panel"><h2>1 · Choose a file</h2>
    <div class="radio-row" role="radiogroup" aria-label="Import mode">
      <label><input type="radio" name="mode" value="upsert" ${S.mode === "upsert" ? "checked" : ""}><span><b>Add / update only</b><small>Safe default. Jobs not in the file are left alone.</small></span></label>
      <label><input type="radio" name="mode" value="sync" ${S.mode === "sync" ? "checked" : ""}><span><b>Full sync</b><small>Also deactivates every live job that is missing from this file. You’ll see exactly which before anything changes.</small></span></label></div>
    <label class="dropzone" id="drop" style="margin-top:1rem" tabindex="0"><input id="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><b id="fname">${S.file ? esc(S.file.name) : "Drop an .xlsx file here, or click to choose"}</b><small>Max 25 MB · up to 60,000 rows · nothing is saved until you press Commit</small></label>
    ${note ? `<p class="banner banner--error" style="margin-top:.8rem" role="alert">${esc(note)}</p>` : ""}
    <div class="row" style="margin-top:1rem"><button class="btn btn--primary" id="validate" type="button" ${S.file ? "" : "disabled"}>Validate file</button><span id="progress" class="muted" style="font-size:.85rem"></span></div></div>`;
  const setFile = (f) => { S.file = f; $("#fname").textContent = f ? f.name : "Drop an .xlsx file here, or click to choose"; $("#validate").disabled = !f; };
  step.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", () => (S.mode = r.value)));
  $("#file").addEventListener("change", (e) => setFile(e.target.files[0] || null));
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0] || null));
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
  $("#validate").addEventListener("click", (ev) => withBusy(ev.currentTarget, validate));
}

async function validate() {
  topMsg("");
  const prog = (t) => { const p = $("#progress"); if (p) p.textContent = t; };
  try {
    S.report = await parseWorkbookFile(S.file, prog);
    if (S.report.canPublish) {
      prog("Comparing with the live site…");
      S.state = await loadAdminState();
      ({ plan: S.plan, counts: S.counts } = planImport(S.report.rows, S.state, S.mode));
    } else { S.plan = S.counts = null; }
    Object.assign(S, { view: S.report.errorCount ? "error" : "all", sort: "severity", search: "", page: 0 });
    drawReview();
  } catch (e) {
    drawUpload(e instanceof ExcelFileError ? e.message : errorInfo(e).message);
  }
}

// ── step 2: review ──
const stat = (n, l, c = "") => `<div class="stat ${c}"><div class="stat__n">${esc(n)}</div><div class="stat__l">${l}</div></div>`;

function drawReview() {
  const r = S.report;
  const sync = S.mode === "sync";
  const removed = S.plan?.removedIds || [];
  const liveTotal = S.state?.entries.length || 0;
  const bigRemoval = sync && liveTotal > 0 && removed.length > Math.max(20, liveTotal * 0.3);
  step.innerHTML = `<div class="panel"><h2>2 · Review</h2>
    <p class="muted" style="font-size:.85rem;margin-bottom:.9rem">${esc(S.file.name)} · sheet “${esc(r.sheetName)}” · ${sync ? "Full sync" : "Add / update only"}</p>
    <div class="stat-cards stat-cards--5">${stat(r.totalRows, "Rows with data")}${stat(r.validRows, "Valid", "stat--ok")}${stat(r.errorRows, "Rows with errors", r.errorRows ? "stat--err" : "")}${stat(r.warningRows, "Rows with warnings", r.warningRows ? "stat--warn" : "")}${stat(r.issues.length, "Issues listed")}</div>
    ${S.counts ? `<h2 style="margin:1.2rem 0 .6rem;font-size:.95rem">What will change</h2><div class="stat-cards stat-cards--4">${stat(S.counts.added, "New")}${stat(S.counts.updated, "Updated")}${stat(S.counts.unchanged, "Unchanged (not touched)")}${stat(S.counts.removed, "Will be deactivated", S.counts.removed ? "stat--err" : "")}</div>` : ""}
    ${r.canPublish ? "" : `<p class="banner banner--error" style="margin-top:1rem" role="alert"><b>Publishing is blocked.</b> ${r.errorRows || r.errorCount ? "Fix every error below in your Excel file, then upload it again. Nothing has been saved." : "There are no valid rows to publish."}</p>`}
    ${r.canPublish && S.counts && !S.counts.added && !S.counts.updated && !S.counts.removed ? `<p class="banner banner--ok" style="margin-top:1rem">This file matches what is already live — nothing needs publishing.</p>` : ""}
    ${sync && removed.length ? `<div class="banner banner--warn" style="margin-top:1rem"><b>${removed.length} live job${removed.length > 1 ? "s" : ""} are not in this file and will be deactivated</b> (kept in the database, their pages say “no longer available”; you can reactivate them under Manage Jobs).
      <details style="margin-top:.4rem"><summary style="cursor:pointer">Show first 15</summary><ul style="margin:.4rem 0 0 1rem;list-style:disc">${removed.slice(0, 15).map((id) => { const e = S.state.entries.find((x) => x.jobId === id); return `<li>${esc(id)} — ${esc(e?.title || "")} (${esc(e?.company || "")})</li>`; }).join("")}</ul></details></div>` : ""}
    ${bigRemoval ? `<p class="banner banner--error" style="margin-top:.8rem" role="alert"><b>That is a large removal</b> (${removed.length} of ${liveTotal} live jobs). Was the file complete? Type <b>REMOVE ${removed.length}</b> to allow it: <input class="input" id="typed" style="max-width:14rem;margin-left:.4rem" autocomplete="off"></p>` : ""}
  </div>
  <div class="panel" id="issues-panel"></div>
  <div class="row" style="margin-top:1rem">
    <button class="btn btn--primary" id="commit" type="button" ${r.canPublish && S.counts && (S.counts.added || S.counts.updated || S.counts.removed) ? "" : "disabled"}>${r.canPublish ? (S.counts && (S.counts.added || S.counts.updated || S.counts.removed) ? `Commit changes` : "Nothing to commit") : "Fix errors to publish"}</button>
    <button class="btn btn--outline" id="csv" type="button" ${r.issues.length ? "" : "disabled"}>Download issue list (CSV)</button>
    <button class="btn btn--ghost" id="again" type="button">Start over</button></div>`;
  drawIssues();
  $("#again").addEventListener("click", () => { S.file = null; S.report = null; drawUpload(); });
  $("#csv").addEventListener("click", downloadCsv);
  $("#commit").addEventListener("click", (ev) => withBusy(ev.currentTarget, () => commit(bigRemoval)));
}

function drawIssues() {
  const r = S.report;
  const errs = r.issues.filter((i) => i.severity === "error").length, warns = r.issues.length - errs;
  const tab = (id, label, n) => `<button class="tab" role="tab" data-view="${id}" aria-selected="${S.view === id}">${label} <b>${n}</b></button>`;
  let body;
  if (S.view === "valid") {
    const list = r.rows.filter((x) => !S.search || `${x._row} ${x.jobId} ${x.title} ${x.company}`.toLowerCase().includes(S.search.toLowerCase()));
    const pages = Math.max(1, Math.ceil(list.length / ISSUE_PAGE));
    S.page = Math.min(S.page, pages - 1);
    const slice = list.slice(S.page * ISSUE_PAGE, (S.page + 1) * ISSUE_PAGE);
    body = list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Row</th><th>Job ID</th><th>Title</th><th>Company</th><th>Location</th></tr></thead><tbody>${slice.map((x) => `<tr><td class="mono">${x._row}</td><td class="mono">${esc(x.jobId)}</td><td class="wrap">${esc(x.title)}</td><td class="wrap">${esc(x.company)}</td><td>${esc(x.location)}</td></tr>`).join("")}</tbody></table></div>${pager(list.length, pages)}` : `<p class="muted">No rows.</p>`;
  } else {
    const list = queryIssues(r.issues, { severity: S.view === "all" ? "all" : S.view, sort: S.sort, search: S.search });
    const pages = Math.max(1, Math.ceil(list.length / ISSUE_PAGE));
    S.page = Math.min(S.page, pages - 1);
    const slice = list.slice(S.page * ISSUE_PAGE, (S.page + 1) * ISSUE_PAGE);
    body = list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Row</th><th></th><th>Column</th><th>Value</th><th>Problem</th></tr></thead><tbody>${slice.map((i) => `<tr class="is-${i.severity}"><td class="mono">${i.row}</td><td><span class="badge badge--${i.severity === "error" ? "err" : "warn"}">${i.severity}</span></td><td>${esc(i.column)}</td><td class="trunc" title="${esc(i.value)}">${esc(i.value)}</td><td class="wrap">${esc(i.message)}</td></tr>`).join("")}</tbody></table></div>${pager(list.length, pages)}`
      : `<div class="state" style="padding:1.5rem"><div class="state__title">${r.issues.length ? "Nothing matches this view." : "No issues found."}</div>${r.issues.length ? "" : '<p class="state__text">Every row passed validation.</p>'}</div>`;
  }
  $("#issues-panel").innerHTML = `<div class="tabs" role="tablist" aria-label="Validation results">${tab("all", "All issues", r.issues.length)}${tab("error", "Errors", errs)}${tab("warning", "Warnings", warns)}${tab("valid", "Valid rows", r.validRows)}</div>
    <div class="tools">${S.view !== "valid" ? `<select class="select" id="sort" aria-label="Sort issues"><option value="severity" ${S.sort === "severity" ? "selected" : ""}>Sort: errors first</option><option value="row" ${S.sort === "row" ? "selected" : ""}>Sort: row number</option><option value="column" ${S.sort === "column" ? "selected" : ""}>Sort: column</option></select>` : ""}
      <input class="input grow" id="isearch" type="search" value="${esc(S.search)}" placeholder="Filter by row, column, value or text…" aria-label="Filter results"></div>${body}`;
  $("#issues-panel").querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.view; S.page = 0; drawIssues(); }));
  $("#sort")?.addEventListener("change", (e) => { S.sort = e.target.value; S.page = 0; drawIssues(); });
  const si = $("#isearch");
  si.addEventListener("input", (e) => { S.search = e.target.value; S.page = 0; const pos = e.target.selectionStart; drawIssues(); const n = $("#isearch"); n.focus(); n.setSelectionRange(pos, pos); });
  $("#prev")?.addEventListener("click", () => { S.page--; drawIssues(); });
  $("#next")?.addEventListener("click", () => { S.page++; drawIssues(); });
}
function pager(total, pages) {
  return `<div class="pager"><span>${total} item${total === 1 ? "" : "s"} · page ${S.page + 1} of ${pages}</span><div class="row"><button class="btn btn--outline btn--sm" id="prev" type="button" ${S.page === 0 ? "disabled" : ""}>Previous</button><button class="btn btn--outline btn--sm" id="next" type="button" ${S.page + 1 >= pages ? "disabled" : ""}>Next</button></div></div>`;
}

function downloadCsv() {
  const safe = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // neutralise spreadsheet formulas
  const rows = queryIssues(S.report.issues, { sort: "severity" });
  const csv = ["Row,Severity,Column,Value,Problem", ...rows.map((i) => [i.row, i.severity, i.column, i.value, i.message].map(safe).join(","))].join("\r\n");
  downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "placio-import-issues.csv");
}

// ── step 3: commit ──
async function commit(bigRemoval) {
  const removed = S.plan.removedIds.length;
  if (bigRemoval && ($("#typed")?.value || "").trim() !== `REMOVE ${removed}`) { topMsg(`To continue, type  REMOVE ${removed}  in the red box below.`, "error"); $("#typed")?.scrollIntoView({ block: "center", behavior: "smooth" }); $("#typed")?.focus(); return; }
  if (removed && !bigRemoval && !confirm(`Deactivate ${removed} live job(s) that are not in this file?\n\nThey stay in the database and can be reactivated, but disappear from the website.`)) return;

  step.innerHTML = `<div class="panel"><h2>3 · Publishing</h2><p id="phase" class="muted">Starting…</p><div class="progress" style="margin-top:.8rem"><i id="bar"></i></div><p class="faint" style="font-size:.78rem;margin-top:.8rem">Keep this tab open. If anything fails, the website’s job list stays exactly as it was — just upload the same file again.</p></div>`;
  try {
    const res = await commitImport({
      plan: S.plan, counts: S.counts, state: S.state, fileName: S.file.name, mode: S.mode, warnings: S.report.warningRows, actorEmail: email,
      onProgress: ({ phase, done, total }) => { $("#phase").textContent = `${phase}… ${done}/${total}`; $("#bar").style.width = `${total ? Math.round((done / total) * 100) : 100}%`; },
    });
    const c = res.counts;
    step.innerHTML = `<div class="panel"><div class="banner banner--ok" style="margin-bottom:1rem"><b>Import complete.</b> The website now shows the new list.${res.warning ? ` <br>⚠ ${esc(res.warning)}` : ""}</div>
      <div class="stat-cards stat-cards--4">${stat(c.added, "Added")}${stat(c.updated, "Updated")}${stat(c.unchanged, "Unchanged")}${stat(c.removed, "Deactivated")}</div>
      <div class="row" style="margin-top:1rem"><a class="btn btn--primary" href="/jobs">View Browse Jobs</a><button class="btn btn--outline" id="another" type="button">Import another file</button></div></div>`;
    $("#another").addEventListener("click", () => { S.file = null; S.report = null; drawUpload(); });
    toast("Import complete");
  } catch (e) {
    step.innerHTML = `<div class="panel"><div class="banner banner--error" role="alert"><b>The import didn’t finish.</b> ${esc(errorInfo(e).message)}<br>The website’s job list was not changed (a few job pages may already show their updated details). Upload the same file again to retry — repeating an import is safe.</div><div class="row" style="margin-top:1rem"><button class="btn btn--primary" id="back" type="button">Back</button></div></div>`;
    $("#back").addEventListener("click", () => { S.file = null; S.report = null; drawUpload(); });
  }
}

drawUpload();

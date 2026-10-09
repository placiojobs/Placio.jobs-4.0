/** Add / Edit one job. Same validation rules as the Excel import (validate.js). Only Job ID, title and company are required. */
import { requireAdmin } from "./guard.js";
import { saveJob, getJobForEdit } from "./adminData.js";
import { validateRow } from "../validate.js";
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS, JOB_TYPES } from "../site-config.js";
import { $, esc, errorInfo, toast } from "../utils.js";

const main = $("#admin-main");
const { email } = await requireAdmin();

const m = location.pathname.match(/^\/admin\/jobs\/([^/]+)\/edit\/?$/);
const mode = m ? "edit" : "create";
const editId = m ? decodeURIComponent(m[1]) : null;

const FIELDS = [
  { k: "jobId", label: "Job ID", required: true, hint: "Letters, numbers and underscores only. Can't be changed later.", col: "Job ID", ph: "e.g. PL10234" },
  { k: "title", label: "Title", required: true, col: "title" },
  { k: "company", label: "Company", required: true, col: "company" },
  { k: "location", label: "Location", col: "location", list: "dl-loc", hint: "Optional. Spelling variants like “Bangalore” are normalised automatically." },
  { k: "dept", label: "Department", col: "dept", list: "dl-dept", hint: "Optional." },
  { k: "exp", label: "Experience", col: "exp", hint: "Optional. e.g. Fresher, 0-1, 1 to 3 years, 3+" },
  { k: "type", label: "Type", col: "type", select: JOB_TYPES, hint: "Optional." },
  { k: "salary", label: "Salary", col: "salary", hint: "Optional — leave blank to hide it on the job card." },
  { k: "link", label: "Application link", col: "link", ph: "https://", hint: "Optional. Must be a web address if filled." },
  { k: "skill_set", label: "Skills", col: "skill_set", ph: "React, Node.js, AWS", hint: "Optional, comma-separated." },
  { k: "desc", label: "Description", col: "desc", area: true, hint: "Optional." },
];

function fieldHtml(f, v) {
  const id = `f-${f.k}`;
  const input = f.select
    ? `<select class="select" id="${id}"><option value="">—</option>${f.select.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
    : f.area
      ? `<textarea class="textarea" id="${id}" maxlength="30000">${esc(v)}</textarea>`
      : `<input class="input" id="${id}" value="${esc(v)}" ${f.list ? `list="${f.list}"` : ""} ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} ${f.k === "jobId" && mode === "edit" ? "disabled" : ""} autocomplete="off">`;
  return `<div class="field"><label class="field__label" for="${id}">${esc(f.label)}${f.required ? ' <span style="color:var(--error)" title="required">*</span>' : ""}</label>${input}${f.hint ? `<span class="field__hint">${esc(f.hint)}</span>` : ""}<div id="e-${f.k}"></div></div>`;
}

function draw(row) {
  main.innerHTML = `<div class="admin-head"><div><h1>${mode === "create" ? "Add job" : "Edit job"}</h1><p class="lead">${mode === "create" ? "Validated with the same rules as the Excel import." : "The Job ID is locked — editing never creates a duplicate listing."}</p></div></div>
    <form class="form-grid" id="form" novalidate>
      ${FIELDS.map((f) => fieldHtml(f, row[f.k] || "")).join("")}
      <datalist id="dl-loc">${MAJOR_LOCATIONS.map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
      <datalist id="dl-dept">${MAJOR_DEPARTMENTS.map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
      <p id="form-err" class="banner banner--error" role="alert" hidden></p>
      <div class="row"><button class="btn btn--primary" id="save" type="submit">${mode === "create" ? "Add job" : "Save changes"}</button><a class="btn btn--ghost" href="/admin/jobs">Cancel</a></div>
    </form>`;
  const read = () => Object.fromEntries(FIELDS.map((f) => [f.k, $(`#f-${f.k}`).value.trim()]));
  const paint = (issues) => {
    FIELDS.forEach((f) => {
      const mine = issues.filter((i) => i.column === f.col);
      $(`#e-${f.k}`).innerHTML = mine.map((i) => `<div class="${i.severity === "error" ? "field__error" : "field__warn"}">${esc(i.message)}</div>`).join("");
    });
  };
  // live hints while typing (the "… is required" errors wait until you press save)
  $("#form").addEventListener("input", () => paint(validateRow(read(), 1, new Map()).issues.filter((i) => !/ is required\.$/.test(i.message))));
  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = read();
    const { issues, hasError } = validateRow(data, 1, new Map());
    paint(issues);
    const err = $("#form-err");
    err.hidden = true;
    if (hasError) { err.textContent = "Please fix the highlighted problems."; err.hidden = false; $("#form .field__error")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    const btn = $("#save");
    btn.classList.add("is-loading"); btn.disabled = true;
    try {
      await saveJob(data, { mode, actorEmail: email });
      toast(mode === "create" ? "Job added" : "Changes saved");
      location.href = "/admin/jobs";
    } catch (ex) {
      err.textContent = ex.code === "duplicate" ? "A job with this Job ID already exists. Choose a different Job ID, or edit the existing job." : ex.code === "not-found" ? "That job no longer exists." : errorInfo(ex).message;
      err.hidden = false;
      btn.classList.remove("is-loading"); btn.disabled = false;
    }
  });
  $(`#f-${mode === "edit" ? "title" : "jobId"}`).focus();
}

if (mode === "edit") {
  main.innerHTML = `<div class="skeleton" style="height:300px"></div>`;
  try {
    const row = await getJobForEdit(editId);
    if (!row) main.innerHTML = `<div class="state"><div class="state__title">Job not found</div><div class="state__actions"><a class="btn btn--primary btn--sm" href="/admin/jobs">Back to jobs</a></div></div>`;
    else draw(row);
  } catch (e) {
    main.innerHTML = `<div class="state state--error"><div class="state__title">Couldn’t load this job</div><p class="state__text">${esc(errorInfo(e).message)}</p></div>`;
  }
} else draw({});

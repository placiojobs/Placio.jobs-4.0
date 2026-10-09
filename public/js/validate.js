/**
 * Validation rules shared by the Excel importer AND the manual Add/Edit Job
 * form — one rule set, so the two paths can never disagree.
 *
 * Policy (blank vs. wrong):
 *   - Required (blank = ERROR): Job ID, title, company.
 *   - Everything else may be blank: blank is VALID and simply not shown in the UI.
 *   - A value that is present but wrong:
 *       link malformed ............ ERROR   (never publish a broken/unsafe Apply link)
 *       Job ID has illegal chars .. ERROR   (it ends up in URLs)
 *       duplicate Job ID in file .. ERROR
 *       text far too long ......... ERROR   (Firestore documents are capped at 1 MiB)
 *       unknown dept / location ... WARNING (may be a legitimate new value)
 *       unreadable exp ............ WARNING (still published; just not matched by experience filters)
 *       odd job type .............. WARNING
 *       extra / missing optional columns ... WARNING
 */
import { EXCEL_COLUMNS } from "./normalize.js";
import { isValidUrl } from "./normalize.js";
import { parseExperience } from "./experience.js";
import { normalizeLocation } from "./location.js";
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS } from "./site-config.js";

const KNOWN_DEPARTMENTS = new Set(MAJOR_DEPARTMENTS.map((d) => d.toLowerCase()));
const KNOWN_LOCATIONS = new Set(MAJOR_LOCATIONS.map((l) => l.toLowerCase()));

const MAX_LEN = { jobId: 64, title: 300, company: 200, location: 200, salary: 200, exp: 100, type: 100, dept: 200, link: 2000, desc: 30000, skill_set: 2000 };

/** Excel header -> row field name. */
export const COLUMN_TO_FIELD = {
  "Job ID": "jobId", title: "title", company: "company", location: "location", salary: "salary",
  exp: "exp", type: "type", dept: "dept", link: "link", desc: "desc", skill_set: "skill_set",
};
const FIELD_TO_COLUMN = Object.fromEntries(Object.entries(COLUMN_TO_FIELD).map(([c, f]) => [f, c]));

/** "Job ID", "job_id", "JOB ID", "Skill Set" ... all map to the same field. */
const headerKey = (h) => String(h ?? "").toLowerCase().replace(/[\s_\-]+/g, "");
const KEY_TO_FIELD = Object.fromEntries(Object.entries(COLUMN_TO_FIELD).map(([col, field]) => [headerKey(col), field]));

/**
 * Maps the sheet's header cells to fields and reports structural problems.
 * @param {Map<number,string>|Array<[number,string]>} headerCells column index -> header text
 */
export function analyzeHeaders(headerCells) {
  const entries = headerCells instanceof Map ? [...headerCells.entries()] : headerCells;
  const columnByField = new Map();
  const unexpected = [];
  entries.forEach(([idx, name]) => {
    const field = KEY_TO_FIELD[headerKey(name)];
    if (field && !columnByField.has(field)) columnByField.set(field, idx);
    else if (!field && String(name).trim()) unexpected.push(String(name).trim());
  });

  const issues = [];
  const missingRequired = ["jobId", "title", "company"].filter((f) => !columnByField.has(f));
  const missingOptional = Object.values(COLUMN_TO_FIELD).filter((f) => !columnByField.has(f) && !["jobId", "title", "company"].includes(f));

  if (missingRequired.length) {
    issues.push({
      row: 1, column: missingRequired.map((f) => FIELD_TO_COLUMN[f]).join(", "), value: "", severity: "error",
      message: `Missing required column(s): ${missingRequired.map((f) => FIELD_TO_COLUMN[f]).join(", ")}. The file must contain these columns: ${EXCEL_COLUMNS.join(", ")}.`,
    });
  }
  if (missingOptional.length) {
    issues.push({
      row: 1, column: missingOptional.map((f) => FIELD_TO_COLUMN[f]).join(", "), value: "", severity: "warning",
      message: `Optional column(s) not found: ${missingOptional.map((f) => FIELD_TO_COLUMN[f]).join(", ")}. These will be treated as blank.`,
    });
  }
  if (unexpected.length) {
    issues.push({
      row: 1, column: unexpected.join(", "), value: "", severity: "warning",
      message: `Unexpected column(s) found and will be ignored: ${unexpected.join(", ")}. Only the 11 approved columns are used.`,
    });
  }
  return { columnByField, issues, hasBlockingError: missingRequired.length > 0 };
}

/**
 * Validates ONE row.
 * @param {object} row  fields jobId,title,company,location,salary,exp,type,dept,link,desc,skill_set (strings)
 * @param {number} rowNum  1-based row as the human sees it in Excel (header = row 1)
 * @param {Map<string,number>} seenJobIds  pass an empty Map for a single manual row
 * @returns {{issues: object[], hasError: boolean}}
 */
export function validateRow(row, rowNum, seenJobIds) {
  const issues = [];
  let hasError = false;
  const v = (k) => String(row[k] ?? "").trim();
  const fail = (column, value, message, severity = "error", groupable = false) => {
    issues.push({ row: rowNum, column, value, message, severity, groupable });
    if (severity === "error") hasError = true;
  };

  const jobId = v("jobId");
  if (!jobId) fail("Job ID", jobId, "Job ID is required.");
  else if (!/^[A-Za-z0-9_]+$/.test(jobId)) {
    fail("Job ID", jobId, "Job ID may only contain letters, numbers and underscores (no spaces or hyphens) so it stays safe inside a URL.");
  } else if (seenJobIds.has(jobId)) {
    fail("Job ID", jobId, `Duplicate Job ID — already used on row ${seenJobIds.get(jobId)}.`);
  } else seenJobIds.set(jobId, rowNum);

  if (!v("title")) fail("title", "", "Title is required.");
  if (!v("company")) fail("company", "", "Company is required.");

  for (const [field, max] of Object.entries(MAX_LEN)) {
    if (v(field).length > max) fail(FIELD_TO_COLUMN[field], v(field).slice(0, 40) + "…", `Too long (${v(field).length} characters, maximum ${max}).`);
  }

  const dept = v("dept");
  if (dept && !KNOWN_DEPARTMENTS.has(dept.toLowerCase())) {
    fail("dept", dept, `"${dept}" isn't in the known department list — check spelling, or it may be a new department.`, "warning", true);
  }
  const location = v("location");
  if (location && !KNOWN_LOCATIONS.has(normalizeLocation(location).toLowerCase())) {
    fail("location", location, `"${location}" isn't in the known location list — check spelling, or it may be a new city.`, "warning", true);
  }
  const exp = v("exp");
  if (exp && !parseExperience(exp)) {
    fail("exp", exp, `Couldn't read experience "${exp}". Examples: Fresher, 0-1, 1 to 3 years, 3+. It will still be published and shown as written, but experience filters won't match it.`, "warning", true);
  }
  const link = v("link");
  if (link && !isValidUrl(link)) fail("link", link, `Invalid link: "${link}". Use a full web address like https://company.com/careers, or leave it blank.`);
  const type = v("type");
  if (type && !/^[A-Za-z\s/\-]+$/.test(type)) {
    fail("type", type, `Unusual job type "${type}" — expected something like WFO, Hybrid or Remote.`, "warning", true);
  }
  return { issues, hasError };
}

/**
 * Validates every parsed row and builds the report the admin UI shows.
 * Repeated warnings for the same value (e.g. 400 rows using the same unknown
 * department) are collapsed into ONE issue with a row count, so a 10,000-row
 * file doesn't produce 5,000 near-identical lines.
 *
 * @param {Array<{rowNum:number,data:object}>} parsedRows non-empty rows only
 * @param {object[]} headerIssues from analyzeHeaders()
 */
export function buildReport(parsedRows, headerIssues = []) {
  const seen = new Map();
  const issues = [...headerIssues];
  const grouped = new Map();
  const validRows = [];
  let errorRows = 0;
  let warningRows = 0;

  for (const { rowNum, data } of parsedRows) {
    const { issues: rowIssues, hasError } = validateRow(data, rowNum, seen);
    let hasWarning = false;
    for (const issue of rowIssues) {
      if (issue.severity === "warning") hasWarning = true;
      if (issue.groupable) {
        const key = `${issue.column}|${issue.value.toLowerCase()}`;
        const g = grouped.get(key);
        if (g) g.count += 1;
        else grouped.set(key, { ...issue, count: 1 });
      } else issues.push(issue);
    }
    if (hasWarning) warningRows += 1;
    if (hasError) errorRows += 1;
    else validRows.push({ ...data, _row: rowNum });
  }
  for (const g of grouped.values()) {
    const suffix = g.count > 1 ? ` (${g.count} rows — first at row ${g.row})` : "";
    issues.push({ row: g.row, column: g.column, value: g.value, severity: g.severity, message: g.message + suffix, count: g.count });
  }

  const headerBlocking = headerIssues.some((i) => i.severity === "error");
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return {
    totalRows: parsedRows.length,
    validRows: validRows.length,
    errorRows,
    warningRows,
    errorCount,
    warningCount,
    issues,
    rows: validRows,
    canPublish: !headerBlocking && errorRows === 0 && validRows.length > 0,
  };
}

/** Filter + sort + paginate helper for the (possibly huge) issue list. */
export function queryIssues(issues, { severity = "all", sort = "severity", search = "" } = {}) {
  let out = severity === "all" ? issues.slice() : issues.filter((i) => i.severity === severity);
  const q = search.trim().toLowerCase();
  if (q) out = out.filter((i) => `${i.row} ${i.column} ${i.value} ${i.message}`.toLowerCase().includes(q));
  const sevRank = (i) => (i.severity === "error" ? 0 : 1);
  if (sort === "row") out.sort((a, b) => a.row - b.row);
  else if (sort === "column") out.sort((a, b) => a.column.localeCompare(b.column) || a.row - b.row);
  else out.sort((a, b) => sevRank(a) - sevRank(b) || a.row - b.row); // errors first, then by row
  return out;
}


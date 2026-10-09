/**
 * Excel reading (import) and writing (export) in the browser, using the self-hosted ExcelJS
 * (/vendor/exceljs.min.js, loaded only on the Excel admin page).
 * Pure validation rules are in ../validate.js — this file only turns a .xlsx into rows and back.
 */
import { ADMIN } from "../site-config.js";
import { EXCEL_COLUMNS } from "../normalize.js";
import { analyzeHeaders, buildReport, COLUMN_TO_FIELD } from "../validate.js";
import { yieldToUi } from "../utils.js";
import * as fb from "../firebase.js";

let exceljsPromise = null;
export function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  exceljsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/exceljs.min.js";
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => reject(new Error("Could not load the Excel library."));
    document.head.appendChild(s);
  });
  return exceljsPromise;
}

/** Any ExcelJS cell value -> plain trimmed string (numbers, dates, rich text, hyperlinks, formula results). */
export function cellToString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("").trim();
    if ("result" in value) return cellToString(value.result);
    if ("text" in value) return cellToString(value.text);
    if ("hyperlink" in value) return String(value.hyperlink).trim();
    if ("error" in value) return "";
  }
  return String(value).trim();
}

export class ExcelFileError extends Error {}

/**
 * Reads a File and returns the validation report (see validate.buildReport).
 * Safe against hostile files: size cap, ZIP-signature check, row cap, per-cell length cap.
 */
export async function parseWorkbookFile(file, onProgress = () => {}) {
  if (!/\.xlsx$/i.test(file.name)) throw new ExcelFileError("Please choose an .xlsx Excel file (older .xls files must be re-saved as .xlsx).");
  if (file.size > ADMIN.maxExcelBytes) throw new ExcelFileError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${ADMIN.maxExcelBytes / 1048576} MB.`);
  const buffer = await file.arrayBuffer();
  return parseWorkbookBuffer(buffer, await loadExcelJS(), onProgress);
}

/** Same as parseWorkbookFile but takes the bytes + the ExcelJS library (so it can run in Node tests too). */
export async function parseWorkbookBuffer(buffer, ExcelJS, onProgress = () => {}) {
  if (!buffer.byteLength) throw new ExcelFileError("That file is empty.");
  const sig = new Uint8Array(buffer.slice(0, 4));
  if (!(sig[0] === 0x50 && sig[1] === 0x4b)) throw new ExcelFileError("That doesn't look like a valid .xlsx file (it isn't a zip archive).");

  onProgress("Reading the spreadsheet…");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ExcelFileError("Could not read that file. Make sure it's a valid, uncorrupted .xlsx file.");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw new ExcelFileError("The workbook has no sheets.");

  const headers = new Map();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => headers.set(col, cellToString(cell.value)));
  if (headers.size === 0) throw new ExcelFileError("The first row is empty. Row 1 must contain the column headers.");
  const { columnByField, issues: headerIssues, hasBlockingError } = analyzeHeaders(headers);

  const last = sheet.lastRow?.number ?? 1;
  if (last - 1 > ADMIN.maxExcelRows) throw new ExcelFileError(`That sheet has ${last - 1} rows; the limit is ${ADMIN.maxExcelRows}. Split it into smaller files.`);

  const parsed = [];
  let scanned = 0;
  if (!hasBlockingError) {
    for (let r = 2; r <= last; r++) {
      const row = sheet.getRow(r);
      const data = {};
      let any = false;
      for (const field of Object.values(COLUMN_TO_FIELD)) {
        const idx = columnByField.get(field);
        const v = idx ? cellToString(row.getCell(idx).value) : "";
        data[field] = v.length > 40000 ? v.slice(0, 40000) : v; // the validator reports "too long"; this just bounds memory
        if (v) any = true;
      }
      scanned++;
      if (any) parsed.push({ rowNum: r, data }); // fully blank rows are skipped silently
      if (r % 500 === 0) {
        onProgress(`Checking rows… ${r - 1} / ${last - 1}`);
        await yieldToUi(); // keep the page responsive on 10k+ row files
      }
    }
  }
  onProgress("Validating…");
  await yieldToUi();
  const report = buildReport(parsed, headerIssues);
  report.sheetName = sheet.name;
  report.rowsScanned = scanned;
  return report;
}
/** Streams ACTIVE jobs from Firestore in pages of 500 and returns an .xlsx Blob with exactly the 11 public columns. */
export async function exportJobsWorkbook(onProgress = () => {}) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Placio Admin";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Jobs");
  sheet.columns = EXCEL_COLUMNS.map((header) => ({ header, key: header, width: header === "desc" ? 60 : header === "title" ? 32 : 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  let after;
  let count = 0;
  for (;;) {
    // ordered by document id (= Job ID): needs no custom Firestore index
    const page = await fb.queryDocs("jobs", { where: [["status", "==", "active"]], orderBy: "__name__", limit: 500, after });
    for (const j of page) {
      sheet.addRow({
        "Job ID": j.jobId, title: j.title, company: j.company, location: j.location || "", salary: j.salary || "", exp: j.exp || "",
        type: j.type || "", dept: j.dept || "", link: j.link || "", desc: j.desc || "", skill_set: j.skillSet || "",
      }).commit?.();
    }
    count += page.length;
    onProgress(`Exported ${count} jobs…`);
    await yieldToUi();
    if (page.length < 500) break;
    after = page[page.length - 1].id;
  }
  const buffer = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), count };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

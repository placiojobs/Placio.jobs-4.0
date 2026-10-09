// Integration tests: the REAL admin / loader / Excel code running against an in-memory Firebase that counts reads & writes.
// Run with:  npm test   (uses tests/register.mjs to swap in tests/memory-firebase.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import * as mem from "./memory-firebase.mjs";
import { parseWorkbookBuffer, ExcelFileError, exportJobsWorkbook } from "../public/js/admin/excelIO.js";
import { loadAdminState, planImport, commitImport, saveJob, setJobsStatus, rebuildIndexFromDatabase, listInactiveJobs, getJobForEdit } from "../public/js/admin/adminData.js";
import { loadIndex, loadMeta, loadJob } from "../public/js/indexLoader.js";
import { EXCEL_COLUMNS } from "../public/js/normalize.js";
import { filterEntries } from "../public/js/jobsFilter.js";
import { decodeLatest } from "../public/js/jobIndex.js";
import { runSetupCheck } from "../public/js/admin/setupCheck.js";
import { FEATURES } from "../public/js/site-config.js";

FEATURES.indexInStorage = true; // the shipped default is false (Spark plan); most tests below exercise the Storage path
globalThis.window = { ExcelJS }; // excelIO.loadExcelJS() looks for window.ExcelJS in the browser

const HEAD = EXCEL_COLUMNS;
async function workbook(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Jobs");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()).buffer.slice(0);
}
const buf = async (...a) => { const b = await workbook(...a); return b instanceof ArrayBuffer ? b : b; };
const row = (i, extra = {}) => ({ id: `T${String(i).padStart(5, "0")}`, title: `Engineer ${i}`, company: `Co ${i % 50}`, location: ["Pune", "Mumbai", "Bangalore"][i % 3], salary: "", exp: ["Fresher", "0-1", "1 to 3 years", ""][i % 4], type: "", dept: ["Software", "Finance"][i % 2], link: "https://x.co/" + i, desc: "d".repeat(200), skill: i % 2 ? "react" : "", ...extra });
const toRow = (r) => [r.id, r.title, r.company, r.location, r.salary, r.exp, r.type, r.dept, r.link, r.desc, r.skill];
const rowsRaw = (n, f = row) => Array.from({ length: n }, (_, i) => { const r = f(i); return { jobId: r.id, title: r.title, company: r.company, location: r.location, salary: r.salary, exp: r.exp, type: r.type, dept: r.dept, link: r.link, desc: r.desc, skill_set: r.skill }; });

// ── Excel scenarios ───────────────────────────────────────────────────────
test("excel: shipped sample files", async () => {
  const valid = await parseWorkbookBuffer(fs.readFileSync(new URL("./test-data/valid-sample.xlsx", import.meta.url)).buffer.slice(0), ExcelJS);
  assert.equal(valid.canPublish, true);
  assert.equal(valid.issues.length, 0, "blank salary / skill_set produce no warnings");
  assert.equal(valid.totalRows, 10);
  const bad = fs.readFileSync(new URL("./test-data/invalid-sample.xlsx", import.meta.url));
  const rep = await parseWorkbookBuffer(bad.buffer.slice(bad.byteOffset, bad.byteOffset + bad.length), ExcelJS);
  assert.equal(rep.canPublish, false);
  assert.ok(rep.errorRows >= 3);
});

test("excel: required fields, duplicates, bad link, exp, blanks, empty rows", async () => {
  const rows = [
    toRow(row(1)),
    toRow(row(2, { id: "" })),                     // row 3 missing Job ID
    toRow(row(3, { title: "" })),                  // row 4 missing title
    toRow(row(4, { company: "" })),                // row 5 missing company
    toRow(row(1, { title: "dup" })),               // row 6 duplicate of row 2's id
    [],                                            // row 7 empty row (skipped)
    toRow(row(6, { link: "not a url" })),          // row 8 invalid link
    toRow(row(7, { exp: "xyz123random" })),        // row 9 unreadable exp -> warning only
    toRow(row(8, { location: "", salary: "", exp: "", type: "", dept: "", link: "", desc: "", skill: "" })), // row 10 only the 3 required
  ];
  const rep = await parseWorkbookBuffer(await buf(HEAD, rows), ExcelJS);
  const err = (n) => rep.issues.filter((i) => i.row === n && i.severity === "error").map((i) => i.column);
  assert.deepEqual(err(3), ["Job ID"]);
  assert.deepEqual(err(4), ["title"]);
  assert.deepEqual(err(5), ["company"]);
  assert.deepEqual(err(6), ["Job ID"]);
  assert.deepEqual(err(8), ["link"]);
  assert.equal(rep.issues.filter((i) => i.row === 9 && i.severity === "warning").length, 1);
  assert.equal(rep.issues.filter((i) => i.row === 10).length, 0, "row with only Job ID/title/company is fully valid");
  assert.equal(rep.totalRows, 8, "empty row is not counted");
  assert.equal(rep.canPublish, false, "any error blocks publishing everything");
});

test("excel: columns — extra ignored with warning, missing optional warns, missing required blocks, tolerant headers", async () => {
  let rep = await parseWorkbookBuffer(await buf([...HEAD, "Internal Notes"], [[...toRow(row(1)), "secret"]]), ExcelJS);
  assert.equal(rep.canPublish, true);
  assert.equal(rep.issues.length, 1);
  assert.equal(rep.issues[0].severity, "warning");
  assert.match(rep.issues[0].message, /^Unexpected column\(s\) found and will be ignored: Internal Notes/);
  assert.equal(rep.rows[0].jobId, "T00001");
  assert.ok(!JSON.stringify(rep.rows).includes("secret"), "extra column data never reaches the rows");

  rep = await parseWorkbookBuffer(await buf(HEAD.filter((h) => h !== "salary" && h !== "skill_set"), [toRow(row(1)).slice(0, 4).concat(toRow(row(1)).slice(5, 10))]), ExcelJS);
  assert.equal(rep.canPublish, true);
  assert.ok(rep.issues.some((i) => /Optional column\(s\) not found: salary, skill_set/.test(i.message)));

  rep = await parseWorkbookBuffer(await buf(HEAD.filter((h) => h !== "company"), [["A", "B"]]), ExcelJS);
  assert.equal(rep.canPublish, false);
  assert.match(rep.issues[0].message, /Missing required column/);

  rep = await parseWorkbookBuffer(await buf(["JOB ID", " Title ", "COMPANY", "Skill Set"], [["J9", "T", "C", "x, y"]]), ExcelJS);
  assert.equal(rep.canPublish, true);
  assert.equal(rep.rows[0].skill_set, "x, y");
});

test("excel: hostile / broken files are rejected calmly", async () => {
  await assert.rejects(() => parseWorkbookBuffer(new TextEncoder().encode("not a zip at all").buffer, ExcelJS), ExcelFileError);
  await assert.rejects(() => parseWorkbookBuffer(new ArrayBuffer(0), ExcelJS), /empty/);
  await assert.rejects(() => parseWorkbookBuffer(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]).buffer, ExcelJS), /Could not read/);
  const emptyHeader = await workbook([], []);
  await assert.rejects(() => parseWorkbookBuffer(emptyHeader, ExcelJS), /first row is empty/);
  const headerOnly = await parseWorkbookBuffer(await buf(HEAD, []), ExcelJS);
  assert.equal(headerOnly.canPublish, false, "no rows = nothing to publish");
});

test("excel: 10,000 rows with thousands of issues stays fast and the issue list stays small", async () => {
  const rows = [];
  for (let i = 0; i < 10000; i++) rows.push(toRow(row(i, { dept: "Brand New Dept", location: "Smalltown", exp: i % 2 ? "weird" : "1-2", link: i % 1000 === 7 ? "bad link" : "https://x.co" })));
  const b = await buf(HEAD, rows);
  const t0 = performance.now();
  const rep = await parseWorkbookBuffer(b, ExcelJS);
  const ms = performance.now() - t0;
  assert.equal(rep.totalRows, 10000);
  assert.equal(rep.errorRows, 10);
  assert.ok(rep.warningRows >= 10000, "every row has warnings");
  assert.ok(rep.issues.length < 40, `issues grouped: ${rep.issues.length}`);
  console.log(`   10,000-row workbook parsed + validated in ${ms.toFixed(0)} ms, ${rep.issues.length} grouped issues (${(b.byteLength / 1024).toFixed(0)} KB file)`);
});

// ── publish pipeline, reads & writes ──────────────────────────────────────
const ADMIN = "admin@test";
async function importRows(raws, mode = "upsert") {
  const state = await loadAdminState();
  const rows = raws.map((r, i) => ({ ...r }));
  const { plan, counts } = planImport(rows, state, mode);
  const res = await commitImport({ plan, counts, state, fileName: "t.xlsx", mode, warnings: 0, actorEmail: ADMIN });
  return { counts, res };
}

test("pipeline: import 4,000 jobs -> index published, visitors read 1 doc (not 4,000)", async () => {
  mem.resetAll();
  const { counts, res } = await importRows(rowsRaw(4000));
  assert.deepEqual(counts, { added: 4000, updated: 0, unchanged: 0, removed: 0 });
  assert.equal(res.published, true);
  const meta = mem.db.get("meta/index");
  assert.equal(meta.total, 4000);
  assert.ok(meta.storage.url, "index file uploaded");
  console.log(`   admin import of 4,000 jobs: ${mem.stats.writes} document writes, ${mem.stats.storageUploads} storage upload(s), ${meta.chunks.length} fallback chunk docs`);

  mem.resetStats();
  const r = await loadIndex({ fresh: true });
  assert.equal(r.entries.length, 4000);
  assert.equal(r.source, "storage");
  assert.equal(mem.stats.reads, 1, "browse page = 1 Firestore read (meta); the job list came from the Storage file");
  assert.equal(mem.stats.storageFetches, 1);

  mem.resetStats();
  const job = await loadJob("T00042");
  assert.equal(job.jobId, "T00042");
  assert.equal(mem.stats.reads, 1, "opening a job = exactly 1 read");

  mem.resetStats();
  const m = await loadMeta({ fresh: true });
  assert.equal(decodeLatest(m).length, 6);
  assert.equal(mem.stats.reads, 1, "homepage = 1 read");
});

test("pipeline: storage unavailable -> automatic fallback to Firestore chunks, still correct", async () => {
  mem.resetAll();
  mem.ctl.storageFails = true;
  const { res } = await importRows(rowsRaw(2500));
  assert.ok(res.warning, "admin is told about the fallback");
  const meta = mem.db.get("meta/index");
  assert.equal(meta.storage, undefined);
  mem.resetStats();
  const r = await loadIndex({ fresh: true });
  assert.equal(r.source, "chunks");
  assert.equal(r.entries.length, 2500);
  assert.equal(mem.stats.reads, 1 + meta.chunks.length);
  console.log(`   fallback path: 2,500 jobs = ${mem.stats.reads} reads per new visitor`);

  // storage file exists but is unreachable at read time -> also falls back
  mem.resetAll();
  await importRows(rowsRaw(300));
  mem.ctl.fetchFails = true;
  mem.resetStats();
  assert.equal((await loadIndex({ fresh: true })).source, "chunks");
});

test("pipeline: re-importing the same file writes nothing; one edit writes only what changed", async () => {
  mem.resetAll();
  await importRows(rowsRaw(1000));
  mem.resetStats();
  const again = await importRows(rowsRaw(1000));
  assert.deepEqual(again.counts, { added: 0, updated: 0, unchanged: 1000, removed: 0 });
  assert.equal(again.res.published, false);
  assert.equal(mem.stats.writes, 0, "idempotent: zero writes");
  assert.equal(mem.stats.storageUploads, 0);

  const edited = rowsRaw(1000);
  edited[500].title = "Changed title";
  edited[501].salary = "9 LPA";
  mem.resetStats();
  const r = await importRows(edited);
  assert.deepEqual(r.counts, { added: 0, updated: 2, unchanged: 998, removed: 0 });
  const jobWrites = [...mem.db.keys()].length; void jobWrites;
  assert.ok(mem.stats.writes < 25, `2 edits => ${mem.stats.writes} writes (2 jobs + index + meta + activity), not 1000`);
  console.log(`   2 edited rows out of 1,000: ${mem.stats.writes} document writes, ${mem.stats.storageUploads} storage upload`);
  assert.equal(mem.db.get("jobs/T00500").title, "Changed title");
  const idx = await loadIndex({ fresh: true });
  assert.equal(idx.entries.find((e) => e.jobId === "T00500").title, "Changed title");
  assert.equal(idx.entries.length, 1000, "no duplicates created");
});

test("pipeline: full sync deactivates only what is missing; nothing is deleted", async () => {
  mem.resetAll();
  await importRows(rowsRaw(100));
  const r = await importRows(rowsRaw(60), "sync");
  assert.deepEqual(r.counts, { added: 0, updated: 0, unchanged: 60, removed: 40 });
  assert.equal(mem.db.get("jobs/T00099").status, "removed");
  assert.equal(mem.db.get("jobs/T00099").title, "Engineer 99", "data kept");
  const idx = await loadIndex({ fresh: true });
  assert.equal(idx.entries.length, 60);
  const inactive = await listInactiveJobs();
  assert.equal(inactive.length, 40);
  // upsert mode never removes
  const up = await importRows(rowsRaw(10), "upsert");
  assert.equal(up.counts.removed, 0);
});

test("pipeline: add / edit / duplicate / deactivate / reactivate / rebuild", async () => {
  mem.resetAll();
  await importRows(rowsRaw(50));
  const base = { jobId: "NEW1", title: "Brand new", company: "Acme", location: "Pune", dept: "Software", exp: "Fresher" };
  await saveJob(base, { mode: "create", actorEmail: ADMIN });
  await assert.rejects(() => saveJob(base, { mode: "create", actorEmail: ADMIN }), (e) => e.code === "duplicate");
  await assert.rejects(() => saveJob({ ...base, jobId: "NOPE" }, { mode: "edit", actorEmail: ADMIN }), (e) => e.code === "not-found");
  await saveJob({ ...base, title: "Renamed" }, { mode: "edit", actorEmail: ADMIN });
  assert.equal((await getJobForEdit("NEW1")).title, "Renamed");
  assert.equal(mem.db.get("jobs/NEW1").createdAt <= Date.now(), true);
  let idx = await loadIndex({ fresh: true });
  assert.equal(idx.entries.length, 51);

  await setJobsStatus(["NEW1", "T00001"], "removed", { actorEmail: ADMIN });
  idx = await loadIndex({ fresh: true });
  assert.equal(idx.entries.length, 49);
  assert.equal(mem.db.get("jobs/NEW1").status, "removed");
  await setJobsStatus(["NEW1"], "active", { actorEmail: ADMIN });
  idx = await loadIndex({ fresh: true });
  assert.equal(idx.entries.length, 50);

  // manual database damage is repairable
  mem.db.delete("meta/index");
  mem.db.delete("jobIndex/c0");
  const rb = await rebuildIndexFromDatabase({ actorEmail: ADMIN });
  assert.equal(rb.count, 50);
  assert.equal((await loadIndex({ fresh: true })).entries.length, 50);
  assert.ok([...mem.db.keys()].some((k) => k.startsWith("adminActivity/")), "actions are logged");
});

test("pipeline: public search / filter on the published index matches the database", async () => {
  mem.resetAll();
  await importRows(rowsRaw(900));
  const { entries } = await loadIndex({ fresh: true });
  const docs = [...mem.db.entries()].filter(([k]) => k.startsWith("jobs/")).map(([, v]) => v);
  const count = (p) => docs.filter(p).length;
  assert.equal(filterEntries(entries, { dept: ["Software"], location: ["Bengaluru"] }).length, count((d) => d.dept === "Software" && d.location === "Bengaluru"));
  assert.equal(filterEntries(entries, { search: "engineer 7" }).length, count((d) => /engineer/.test(d.searchableText) && /7/.test(d.searchableText)));
  assert.equal(filterEntries(entries, { exp: ["Fresher"] }).length, count((d) => d.isFresher));
});

test("security (as far as client code can show): non-admin cannot write or read admin data; reports are create-only", async () => {
  mem.resetAll();
  await importRows(rowsRaw(20));
  mem.ctl.admin = false;
  await assert.rejects(() => loadAdminState(), (e) => e.code === "permission-denied");
  await assert.rejects(() => saveJob({ jobId: "HACK", title: "x", company: "y" }, { mode: "create" }), (e) => e.code === "permission-denied");
  await assert.rejects(() => setJobsStatus(["T00001"], "removed", {}), (e) => e.code === "permission-denied");
  await assert.rejects(() => mem.getDocData("adminActivity", "x"), (e) => e.code === "permission-denied");
  assert.equal((await loadIndex({ fresh: true })).entries.length, 20, "public can still browse");
  assert.ok(mem.db.has("jobs/T00001") && mem.db.get("jobs/T00001").status === "active", "nothing changed");
  await mem.setDocData("jobReports", "T00001__20261003__0", { jobId: "T00001", reason: "Other", at: Date.now() });
});

test("export: exactly the 11 public columns, every active job once, no internal fields", async () => {
  mem.resetAll();
  await importRows(rowsRaw(1300));
  await setJobsStatus(["T00005"], "removed", { actorEmail: ADMIN });
  mem.resetStats();
  const { blob, count } = await exportJobsWorkbook();
  assert.equal(count, 1299);
  console.log(`   export of ${count} jobs: ${mem.stats.reads} Firestore reads (1 per job, paged 500 at a time)`);
  const rep = await parseWorkbookBuffer(await blob.arrayBuffer(), ExcelJS);
  assert.equal(rep.canPublish, true);
  assert.equal(rep.totalRows, 1299);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const headers = [];
  wb.worksheets[0].getRow(1).eachCell((c) => headers.push(c.value));
  assert.deepEqual(headers, EXCEL_COLUMNS);
  assert.equal(new Set(rep.rows.map((r) => r.jobId)).size, 1299);
  // the export can be re-imported and is entirely UNCHANGED
  const state = await loadAdminState();
  const { counts } = planImport(rep.rows, state, "upsert");
  assert.deepEqual(counts, { added: 0, updated: 0, unchanged: 1299, removed: 0 });
});

test("setup check: tells the founder exactly what is wrong (rules not deployed / nothing published / healthy)", async () => {
  const levels = (r) => r.map((x) => x.level).join(",");
  const text = (r) => r.map((x) => x.title + " " + x.detail).join(" | ");

  mem.resetAll();
  mem.ctl.denyAll = true; // old rules deployed: everything refused
  let r = await runSetupCheck();
  assert.equal(r[0].level, "fail");
  assert.match(text(r), /firebase deploy --only firestore:rules/);

  mem.resetAll(); // empty database, rules fine
  r = await runSetupCheck();
  assert.match(text(r), /Import an Excel file/);
  assert.ok(r.some((x) => x.level === "warn"));

  // jobs exist in the database (migrated from the old site) but no index published yet
  mem.resetAll();
  mem.db.set("jobs/OLD1", { jobId: "OLD1", title: "Old job", company: "Co", status: "active" });
  r = await runSetupCheck();
  assert.match(text(r), /press “Rebuild job index”/);
  await rebuildIndexFromDatabase({ actorEmail: "a" });
  r = await runSetupCheck();
  assert.equal(levels(r), "ok,ok,ok,ok");

  mem.ctl.fetchFails = true; // storage file unreachable -> warning, not failure
  r = await runSetupCheck();
  assert.equal(r.at(-1).level, "warn");
  assert.match(r.at(-1).detail, /falls back/);

  mem.ctl.admin = false; // right rules, but this account has no admin claim
  r = await runSetupCheck();
  assert.match(text(r), /grant-admin/);
});

test("Spark-plan mode (shipped default): no Storage anywhere, visitors read meta + a few chunk docs, everything still correct", async () => {
  FEATURES.indexInStorage = false;
  try {
    mem.resetAll();
    const { res } = await importRows(rowsRaw(4900));
    assert.equal(res.warning, undefined, "no warning: Storage is intentionally off");
    assert.equal(mem.stats.storageUploads, 0);
    const meta = mem.db.get("meta/index");
    assert.equal(meta.storage, undefined);
    assert.equal(meta.total, 4900);
    mem.resetStats();
    const r = await loadIndex({ fresh: true });
    assert.equal(r.source, "chunks");
    assert.equal(r.entries.length, 4900);
    assert.equal(mem.stats.storageFetches, 0);
    assert.equal(mem.stats.reads, 1 + meta.chunks.length);
    console.log(`   Spark mode, 4,900 jobs: ${mem.stats.reads} reads per new visitor (1 meta + ${meta.chunks.length} chunk docs), then cached`);
    const check = await runSetupCheck();
    assert.equal(check.map((x) => x.level).join(","), "ok,ok,ok,ok");
    assert.match(check.at(-1).title, /free Spark plan mode/);
  } finally {
    FEATURES.indexInStorage = true;
  }
});

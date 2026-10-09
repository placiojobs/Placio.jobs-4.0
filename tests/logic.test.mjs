import test from "node:test";
import assert from "node:assert/strict";
import { parseExperience, matchesExperienceToken } from "../public/js/experience.js";
import { normalizeJobRow, isValidUrl, blankIfPlaceholder } from "../public/js/normalize.js";
import { validateRow, buildReport, analyzeHeaders, queryIssues } from "../public/js/validate.js";
import {
  buildIndexDocs, decodeChunks, decodePayload, entryFromDoc, diffChunks, docHash, decodeLatest, mergeAdminData, CHUNK_MAX_BYTES,
} from "../public/js/jobIndex.js";
import { filterEntries, recommend, PAGE_SIZE } from "../public/js/jobsFilter.js";
import { searchToParams, paramsToSearch, applyLegacyParams } from "../public/js/url.js";
import { buildJobSlug, parseJobIdFromSlug } from "../public/js/slug.js";
import { normalizeLocation } from "../public/js/location.js";

// ── Experience ───────────────────────────────────────────────────────────
test("experience: flexible real-world formats", () => {
  const cases = {
    Fresher: [0, 0, true], fresher: [0, 0, true], Freshers: [0, 0, true], "Entry level": [0, 0, true],
    "0": [0, 0, true], "0 years": [0, 0, true], "0-1": [0, 1, true], "0 – 1": [0, 1, true], "0—1": [0, 1, true],
    "1": [1, 1, false], "1-2": [1, 2, false], "1 - 2": [1, 2, false], "1–2": [1, 2, false],
    "2-3 years": [2, 3, false], "2 to 4": [2, 4, false], "2–4 years": [2, 4, false], "3+": [3, null, false],
    "3 +": [3, null, false], "3 plus": [3, null, false], "5+ yrs": [5, null, false], "3 - 5": [3, 5, false],
    "2 years": [2, 2, false], "5 yrs": [5, 5, false], "5 yrs.": [5, 5, false], "1.5-3": [1.5, 3, false],
    "Fresher-2": [0, 2, true], "1 – 3 years": [1, 3, false], "20+": [20, null, false],
  };
  for (const [raw, [min, max, fresher]] of Object.entries(cases)) {
    const r = parseExperience(raw);
    assert.ok(r, `should parse "${raw}"`);
    assert.deepEqual([r.min, r.max, r.isFresher], [min, max, fresher], `"${raw}"`);
  }
});

test("experience: blank / junk -> null (never throws)", () => {
  for (const raw of ["", "   ", null, undefined, "N/A", "unknown", "xyz123random", "5-2", "abc years"]) {
    assert.equal(parseExperience(raw), null, String(raw));
  }
});

test("experience: filter semantics", () => {
  const r12 = { min: 1, max: 2, isFresher: false };
  assert.ok(matchesExperienceToken(r12, "1") && matchesExperienceToken(r12, "2"));
  assert.ok(!matchesExperienceToken(r12, "3") && !matchesExperienceToken(r12, "Fresher"));
  assert.ok(matchesExperienceToken({ min: 3, max: null, isFresher: false }, "25"));
  assert.ok(matchesExperienceToken({ min: 0, max: 1, isFresher: true }, "Fresher"));
  assert.ok(!matchesExperienceToken({ min: null, max: null, isFresher: false }, "1"), "unknown exp matches nothing");
});

// ── Validation ───────────────────────────────────────────────────────────
const good = { jobId: "J1", title: "Dev", company: "Acme" };

test("validate: only Job ID, title, company are required", () => {
  const { issues, hasError } = validateRow(good, 2, new Map());
  assert.equal(hasError, false);
  assert.deepEqual(issues, []); // every other field blank => zero issues, not even warnings
  for (const missing of ["jobId", "title", "company"]) {
    const r = validateRow({ ...good, [missing]: "" }, 2, new Map());
    assert.equal(r.hasError, true, missing);
  }
});

test("validate: blank optional fields are valid; present-but-bad are flagged", () => {
  const blank = validateRow({ ...good, location: "", salary: "", exp: "", type: "", dept: "", link: "", desc: "", skill_set: "" }, 2, new Map());
  assert.equal(blank.issues.length, 0);

  assert.equal(validateRow({ ...good, link: "not a url" }, 2, new Map()).hasError, true);
  assert.equal(validateRow({ ...good, link: "javascript:alert(1)" }, 2, new Map()).hasError, true);
  assert.equal(validateRow({ ...good, link: "company.com/careers" }, 2, new Map()).hasError, false);
  assert.equal(validateRow({ ...good, link: "https://x.co/jobs?id=1" }, 2, new Map()).hasError, false);

  const exp = validateRow({ ...good, exp: "xyz123random" }, 2, new Map());
  assert.equal(exp.hasError, false);
  assert.equal(exp.issues[0].severity, "warning");

  assert.equal(validateRow({ ...good, jobId: "A B" }, 2, new Map()).hasError, true);
  assert.equal(validateRow({ ...good, jobId: "A-B" }, 2, new Map()).hasError, true);
  assert.equal(validateRow({ ...good, title: "x".repeat(301) }, 2, new Map()).hasError, true);
});

test("validate: duplicate Job IDs in a file are errors", () => {
  const rep = buildReport([{ rowNum: 2, data: good }, { rowNum: 3, data: { ...good, title: "Other" } }]);
  assert.equal(rep.errorRows, 1);
  assert.equal(rep.canPublish, false);
  assert.match(rep.issues.find((i) => i.severity === "error").message, /Duplicate Job ID.*row 2/);
});

test("validate: repeated warnings are grouped (10k rows must not make 5k issues)", () => {
  const rows = [];
  for (let i = 0; i < 3000; i++) rows.push({ rowNum: i + 2, data: { jobId: "J" + i, title: "T", company: "C", dept: "Brand New Dept", location: "Smalltown", exp: "weird" } });
  const rep = buildReport(rows);
  assert.equal(rep.issues.length, 3, "one grouped issue per distinct unknown dept/location/exp");
  assert.equal(rep.warningRows, 3000);
  assert.equal(rep.canPublish, true, "warnings never block publishing");
  assert.match(rep.issues[0].message, /3000 rows/);
});

test("validate: headers — extra columns warn, missing optional warn, missing required errors", () => {
  const std = ["Job ID", "title", "company", "location", "salary", "exp", "type", "dept", "link", "desc", "skill_set"];
  const mk = (names) => new Map(names.map((n, i) => [i + 1, n]));
  let r = analyzeHeaders(mk(std));
  assert.equal(r.issues.length, 0);
  r = analyzeHeaders(mk([...std, "Notes"]));
  assert.equal(r.hasBlockingError, false);
  assert.match(r.issues[0].message, /Unexpected column\(s\) found and will be ignored: Notes/);
  r = analyzeHeaders(mk(std.filter((h) => h !== "salary")));
  assert.equal(r.hasBlockingError, false);
  assert.equal(r.issues[0].severity, "warning");
  r = analyzeHeaders(mk(std.filter((h) => h !== "company")));
  assert.equal(r.hasBlockingError, true);
  r = analyzeHeaders(mk(["JOB ID", "Title", " Company ", "Skill Set"]));
  assert.ok(r.columnByField.has("jobId") && r.columnByField.has("skill_set"), "header matching is case/space/underscore tolerant");
});

test("validate: issue list filter / sort / search", () => {
  const issues = [
    { row: 5, column: "dept", value: "x", message: "w", severity: "warning" },
    { row: 9, column: "link", value: "y", message: "e", severity: "error" },
    { row: 2, column: "exp", value: "z", message: "w2", severity: "warning" },
  ];
  assert.deepEqual(queryIssues(issues, { severity: "error" }).map((i) => i.row), [9]);
  assert.deepEqual(queryIssues(issues, { sort: "severity" }).map((i) => i.row), [9, 2, 5]);
  assert.deepEqual(queryIssues(issues, { sort: "row" }).map((i) => i.row), [2, 5, 9]);
  assert.deepEqual(queryIssues(issues, { sort: "column" }).map((i) => i.column), ["dept", "exp", "link"]);
  assert.deepEqual(queryIssues(issues, { search: "link" }).map((i) => i.row), [9]);
});

// ── Normalize / slug / url ───────────────────────────────────────────────
test("normalize: blank optional fields are omitted; slug/derived fields set", () => {
  const d = normalizeJobRow({ jobId: "PL1", title: " Data  Analyst ", company: "Acme Corp", location: "Bangalore", exp: "1-2", dept: "Data Analyst", link: "acme.com/x" });
  assert.equal(d.title, "Data Analyst");
  assert.equal(d.location, "Bengaluru");
  assert.equal(d.link, "https://acme.com/x");
  assert.equal(d.slug, "PL1-data-analyst-acme-corp");
  assert.equal(d.experienceMin, 1);
  assert.equal(d.experienceMax, 2);
  for (const k of ["salary", "type", "desc", "skillSet"]) assert.ok(!(k in d), k + " omitted");
  const blank = normalizeJobRow({ jobId: "PL2", title: "T", company: "C" });
  assert.equal(blank.experienceMin, null);
  assert.equal(blank.isFresher, false);
  assert.equal(blank.link, "");
});

test("slug: id survives title edits", () => {
  assert.equal(parseJobIdFromSlug(buildJobSlug("PL10", "Old title", "Old Co")), "PL10");
  assert.equal(parseJobIdFromSlug("PL10-brand-new-title"), "PL10");
  assert.equal(normalizeLocation("gurugram"), "Gurgaon");
  assert.ok(isValidUrl("https://a.in"));
  assert.ok(!isValidUrl("http://localhost"));
});

test("url: round trip, caps, legacy links, junk sort", () => {
  const p = { search: "react", dept: ["Software"], location: ["Pune", "Mumbai"], exp: ["Fresher", "1"], sort: "companyAsc" };
  assert.deepEqual(searchToParams(paramsToSearch(p)), { ...p, company: undefined });
  const junk = searchToParams(new URLSearchParams("sort=DROP%20TABLE&search=" + "a".repeat(500) + "&dept=" + "x,".repeat(200)));
  assert.equal(junk.sort, "latest");
  assert.equal(junk.search.length, 200);
  assert.equal(junk.dept.length, 50);
  const leg = applyLegacyParams(new URLSearchParams("q=python&filter=Remote"));
  assert.equal(leg.wasLegacy, true);
  assert.deepEqual(leg.params.location, ["Remote"]);
  assert.equal(leg.params.search, "python");
  assert.equal(applyLegacyParams(new URLSearchParams("filter=__proto__")).wasLegacy, false);
});

// ── Index + filter ───────────────────────────────────────────────────────
const DEPTS = ["Software", "Fresher-IT", "Finance", "Marketing", "Data Analyst"];
const CITIES = ["Bengaluru", "Pune", "Mumbai", "Delhi", "Remote"];
const EXPS = ["Fresher", "0-1", "1-2", "2-4", "5+", ""];
function makeDocs(n) {
  const docs = [];
  for (let i = 0; i < n; i++) {
    docs.push(normalizeJobRow({
      jobId: "T" + String(i).padStart(5, "0"), title: `${["Engineer", "Analyst", "Designer"][i % 3]} ${i}`, company: `Co${i % 40}`,
      location: CITIES[i % 5], exp: EXPS[i % 6], dept: DEPTS[i % 5], link: "https://x.co/" + i,
      desc: "Long description ".repeat(30), skill_set: i % 2 ? "react, node" : "", salary: i % 4 ? "" : "5 LPA",
    }, { createdAt: 1_700_000_000_000 - i }));
  }
  return docs;
}

function a_full(entries) { return buildIndexDocs(entries).fullPayload; }
test("index: pack -> chunks -> decode round trip, within size limits", () => {
  const docs = makeDocs(4000);
  const entries = docs.map(entryFromDoc);
  const { chunks, meta } = buildIndexDocs(entries);
  assert.equal(meta.total, 4000);
  assert.ok(chunks.length >= 2 && chunks.length <= 8, "4000 jobs => handful of chunk docs, got " + chunks.length);
  for (const c of chunks) assert.ok(new TextEncoder().encode(c.data.d).length <= CHUNK_MAX_BYTES + 2000);
  const decoded = decodeChunks(chunks.map((c) => c.data));
  assert.equal(decoded.length, 4000);
  assert.equal(new Set(decoded.map((e) => e.jobId)).size, 4000);
  assert.equal(decoded[0].jobId, "T00000", "newest first");
  assert.deepEqual(decoded.map((e) => e.order), decoded.map((_, i) => i), "order = position");
  assert.equal(decodePayload(a_full(entries)).length, 4000, "storage file payload round-trips");
  assert.ok(!("salary" in JSON.parse(chunks[0].data.d).r[0]) && JSON.parse(chunks[0].data.d).r[0].length === 11, "compact row, no hash/createdAt/desc/link");
  assert.ok(!chunks[0].data.d.includes("Long description"), "descriptions never reach the public index");
  assert.equal(decodeLatest(meta).length, 6);
  assert.deepEqual(meta.chunks.map((c) => c.n).reduce((a, b) => a + b), 4000);
  const merged = mergeAdminData(decoded, buildIndexDocs(entries).adminChunks.map((c) => c.data));
  assert.ok(merged.every((e) => e.h && e.createdAt), "admin merge restores hash + createdAt");
  // no nested arrays at the Firestore field level
  for (const c of chunks) for (const v of Object.values(c.data)) assert.ok(!Array.isArray(v));
  for (const v of Object.values(meta)) if (Array.isArray(v)) v.forEach((x) => assert.ok(!Array.isArray(x)));
  assert.ok(meta.matrix.counts.length === meta.matrix.depts.length * meta.matrix.cities.length);
  console.log(`   4000 jobs -> ${chunks.length} chunk docs, ${(chunks.reduce((s, c) => s + c.data.d.length, 0) / 1024).toFixed(0)} KB total`);
});

test("index: hash detects content change, ignores nothing relevant; chunk diff is minimal", () => {
  const docs = makeDocs(300);
  const a = buildIndexDocs(docs.map(entryFromDoc));
  assert.equal(docHash(docs[0]), docHash({ ...docs[0], updatedAt: 999, createdAt: 5 }), "timestamps are not content");
  assert.notEqual(docHash(docs[0]), docHash({ ...docs[0], desc: "changed" }));
  const same = buildIndexDocs(docs.map(entryFromDoc), a.meta);
  const d0 = diffChunks(same.chunks, a.meta);
  assert.equal(d0.write.length, 0, "identical rebuild writes nothing");
  assert.equal(same.meta.version, a.meta.version + 1);
  const shrunk = buildIndexDocs(docs.slice(0, 1).map(entryFromDoc), a.meta);
  assert.deepEqual(diffChunks(shrunk.chunks, a.meta).remove, a.meta.chunks.slice(1).map((c) => c.id));
});

test("filter: every combination narrows correctly (vs brute force)", () => {
  const docs = makeDocs(1200);
  const entries = docs.map(entryFromDoc);
  const { chunks } = buildIndexDocs(entries);
  const all = decodeChunks(chunks.map((c) => c.data));

  assert.equal(filterEntries(all, {}).length, 1200);
  assert.equal(filterEntries(all, { dept: ["software"] }).length, 240);
  assert.equal(filterEntries(all, { dept: ["Software", "Finance"] }).length, 480);
  assert.equal(filterEntries(all, { location: ["Pune"] }).length, 240);
  assert.equal(filterEntries(all, { dept: ["Software"], location: ["Pune"] }).length, 0 + all.filter((e) => e.dept === "Software" && e.location === "Pune").length);
  const search = filterEntries(all, { search: "  ENGINEER  react " });
  assert.ok(search.length > 0 && search.every((e) => /engineer/i.test(e.title) && /react/.test(e.skills)));
  assert.equal(filterEntries(all, { search: "zzzzqqq" }).length, 0);
  assert.equal(filterEntries(all, { search: "<script>alert(1)</script>" }).length, 0);
  // experience: "1" matches jobs "0-1" and "1-2"; "Fresher" matches Fresher & 0-1; blank exp never matches
  const e1 = filterEntries(all, { exp: ["1"] });
  assert.ok(e1.every((e) => ["0-1", "1-2"].includes(e.exp)));
  const fr = filterEntries(all, { exp: ["Fresher"] });
  assert.ok(fr.every((e) => ["Fresher", "0-1"].includes(e.exp)));
  assert.ok(filterEntries(all, { exp: ["1", "2", "3", "4", "5", "30"] }).every((e) => e.exp !== ""));
  // company filter + multi-category AND
  const combo = filterEntries(all, { dept: ["Software"], location: ["Bengaluru"], exp: ["Fresher"], company: ["co0"] });
  assert.ok(combo.every((e) => e.dept === "Software" && e.location === "Bengaluru" && e.company === "Co0"));
  // sorts
  const byCo = filterEntries(all, { sort: "companyAsc" });
  for (let i = 1; i < byCo.length; i++) assert.ok(byCo[i - 1].normalizedCompany <= byCo[i].normalizedCompany);
  const latest = filterEntries(all, {});
  for (let i = 1; i < latest.length; i++) assert.ok(latest[i - 1].order < latest[i].order);
});

test("pagination: slicing in PAGE_SIZE steps gives no duplicates and no gaps", () => {
  const all = makeDocs(1234).map(entryFromDoc);
  const res = filterEntries(all, { sort: "companyAsc" });
  const seen = new Set();
  for (let off = 0; off < res.length; off += PAGE_SIZE) for (const e of res.slice(off, off + PAGE_SIZE)) { assert.ok(!seen.has(e.jobId)); seen.add(e.jobId); }
  assert.equal(seen.size, 1234);
});

test("recommend: never itself, no dupes, bounded, survives missing fields", () => {
  const all = makeDocs(600).map(entryFromDoc);
  const cur = all[7];
  const recs = recommend(all, cur, { limit: 6 });
  assert.ok(recs.length <= 6 && recs.length > 0);
  assert.ok(recs.every((r) => r.jobId !== cur.jobId));
  assert.equal(new Set(recs.map((r) => r.jobId)).size, recs.length);
  const more = recommend(all, cur, { limit: 4, sameCompanyOnly: true });
  assert.ok(more.every((r) => r.normalizedCompany === cur.normalizedCompany));
  const bare = entryFromDoc(normalizeJobRow({ jobId: "BARE", title: "X", company: "NoOne" }));
  assert.doesNotThrow(() => recommend(all, bare));
  assert.deepEqual(recommend([], cur), []);
});



test("placeholder values (—, N/A, Not specified…) count as blank; real values are untouched", () => {
  for (const v of ["—", "–", "-", "--", " ", "", ".", "?", "N/A", "n/a", "NA", "N / A", "nil", "None", "null", "Not specified", "not disclosed", "Not available", "undisclosed", "TBD", "unknown", null, undefined]) {
    assert.equal(blankIfPlaceholder(v), "", JSON.stringify(v));
  }
  for (const v of ["5 LPA", "BTech", "0", "0-1", "Fresher", "Full Time", "₹ 4-6 LPA", "Hybrid", "Not bad pay", "Analyst - Data"]) {
    assert.equal(blankIfPlaceholder(v), v, v);
  }
  // existing database documents are cleaned when the index is built (no database rewrite needed)
  const e = entryFromDoc({ jobId: "9", title: "T", company: "C", salary: "—", type: "N/A", exp: "-", skillSet: "Not specified", dept: "Sales", location: "Pune" });
  assert.equal(e.salary, "");
  assert.equal(e.type, "");
  assert.equal(e.exp, "");
  assert.equal(e.skills, "");
  assert.equal(e.experienceMin, null);
  // and new imports never store them
  const d = normalizeJobRow({ jobId: "9", title: "T", company: "C", salary: "—", type: "-", exp: "N/A", skill_set: "n/a" });
  for (const k of ["salary", "type", "skillSet"]) assert.ok(!(k in d), k + " omitted");
  assert.equal(d.exp, "");
});

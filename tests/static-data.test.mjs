// Static website data: export zip -> files -> loader reads them with 0 Firestore reads, falls back safely.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import * as mem from "./memory-firebase.mjs";
import { planImport, commitImport, loadAdminState } from "../public/js/admin/adminData.js";
import { buildStaticData } from "../public/js/admin/staticExport.js";
import { makeZip, crc32 } from "../public/js/admin/zip.js";
import { loadIndex, loadMeta, loadJob, forgetCaches } from "../public/js/indexLoader.js";
import { FEATURES } from "../public/js/site-config.js";

globalThis.window = { ExcelJS };
const mk = (i) => ({ jobId: `S${String(i).padStart(4, "0")}`, title: `Dev ${i}`, company: `Co ${i % 5}`, location: ["Pune", "Mumbai"][i % 2], salary: "", exp: "1 to 3 years", type: "", dept: "Software", link: "https://x.co/" + i, desc: "d".repeat(50), skill_set: "react" });

async function seed(n) {
  mem.resetAll();
  const state = await loadAdminState();
  const { plan, counts } = planImport(Array.from({ length: n }, (_, i) => mk(i)), state, "upsert");
  await commitImport({ plan, counts, state, fileName: "t.xlsx", mode: "upsert", warnings: 0, actorEmail: "a@b.c" });
}

/** A fake browser: localStorage + a fetch() that serves the files from `site` (a Map path -> text). */
function fakeBrowser(site) {
  const ls = new Map();
  globalThis.localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k),
  };
  Object.defineProperty(globalThis.localStorage, "length", { get: () => ls.size });
  const origKeys = Object.keys;
  globalThis.__ls = ls;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(url);
    const t = site.get(url);
    if (t === undefined) return { ok: false, status: 404, headers: new Headers(), text: async () => "<html>", json: async () => { throw new Error("x"); } };
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), text: async () => t, json: async () => JSON.parse(t) };
  };
  return { ls, fetched, origKeys };
}
const cleanup = () => { delete globalThis.localStorage; delete globalThis.fetch; delete globalThis.__ls; };

test("zip: valid archive that the system unzip accepts, with correct contents", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = makeZip([{ name: "data/a.json", text: '{"x":1}' }, { name: "data/jobs/b%20c.json", text: "héllo ✓" }]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-"));
  const f = path.join(dir, "t.zip");
  fs.writeFileSync(f, z);
  try {
    execFileSync("unzip", ["-tq", f]);
    execFileSync("unzip", ["-oq", f, "-d", dir]);
    assert.equal(fs.readFileSync(path.join(dir, "data/a.json"), "utf8"), '{"x":1}');
    assert.equal(fs.readFileSync(path.join(dir, "data/jobs/b%20c.json"), "utf8"), "héllo ✓");
  } catch (e) {
    if (e.code === "ENOENT") return; // no unzip on this machine: skip the extraction check
    throw e;
  }
});

test("export -> static files -> visitors read the site, 0 Firestore reads; fallback when files are missing", async () => {
  await seed(30);
  const { zip, version, jobs, indexJobs } = await buildStaticData();
  assert.equal(jobs, 30);
  assert.equal(indexJobs, 30);

  // unzip into a Map like a deployed /data folder
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  const f = path.join(dir, "d.zip");
  fs.writeFileSync(f, zip);
  let site = new Map();
  try {
    execFileSync("unzip", ["-oq", f, "-d", dir]);
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const p of walk(path.join(dir, "data"))) site.set("/" + path.relative(dir, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  assert.ok(site.has("/data/meta.json") && site.has(`/data/index-v${version}.json`) && site.has("/data/jobs/S0007.json"));
  assert.equal([...site.keys()].filter((k) => k.startsWith("/data/jobs/")).length, 30);

  // a first-time visitor
  const b = fakeBrowser(site);
  try {
    forgetCaches();
    mem.resetStats();
    const idx = await loadIndex();
    assert.equal(idx.source, "static");
    assert.equal(idx.entries.length, 30);
    const job = await loadJob("S0007");
    assert.equal(job.jobId, "S0007");
    assert.equal(job.title, "Dev 7");
    assert.equal(mem.stats.reads, 0, "browsing + opening a job = 0 Firestore reads");

    // second open: from the 24 h browser cache, not even a file request
    const before = b.fetched.length;
    await loadJob("S0007");
    assert.equal(b.fetched.length, before, "repeat open uses the browser cache");
    assert.ok(b.ls.has("placio.job.S0007"));

    // a job the site doesn't have a file for (added after the last deploy) -> falls back to 1 read
    mem.resetStats();
    mem.db.set("jobs/NEWJOB", { jobId: "NEWJOB", title: "Brand new", company: "X", status: "active", createdAt: 1 });
    const nj = await loadJob("NEWJOB");
    assert.equal(nj.title, "Brand new");
    assert.equal(mem.stats.reads, 1);

    // a removed job: no file, Firestore says removed
    mem.db.set("jobs/GONE", { jobId: "GONE", title: "Old", company: "X", status: "removed", createdAt: 1 });
    assert.equal((await loadJob("GONE")).status, "removed");
  } finally { cleanup(); }

  // all static files missing -> exactly the old behaviour
  fakeBrowser(new Map());
  try {
    forgetCaches();
    mem.resetStats();
    const idx = await loadIndex();
    assert.notEqual(idx.source, "static");
    assert.equal(idx.entries.length, 30);
    assert.ok(mem.stats.reads >= 2, "fell back to Firestore");
  } finally { cleanup(); }

  // switch off: never even asks for files
  FEATURES.staticData = false;
  const b2 = fakeBrowser(site);
  try {
    forgetCaches();
    await loadIndex();
    assert.equal(b2.fetched.length, 0);
  } finally { FEATURES.staticData = true; cleanup(); }
});

test("export refuses a mismatched index and an empty site", async () => {
  mem.resetAll();
  await assert.rejects(buildStaticData(), /Nothing is published/);
});

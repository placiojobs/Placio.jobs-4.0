/**
 * DEMO / TEST stand-in for public/js/firebase.js  (used only by `npm run demo`; never deployed).
 * Implements the same exports against IndexedDB in your own browser, so the whole site + admin panel
 * can be tried and tested without touching the real Firebase project.
 *
 * It also:
 *   - COUNTS every document read (like Firestore billing) -> window.__demo.reads()
 *   - mimics the important security rules (admin-only writes/lists, create-only reports)
 *   - can simulate outages:  __demo.fail("quota" | "network" | "")
 * Browser console helpers:  __demo.reset(n)   __demo.reads()   __demo.resetReads()   __demo.fail(kind)
 */
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS } from "/js/site-config.js";
import { normalizeJobRow } from "/js/normalize.js";
import { entryFromDoc, buildIndexDocs } from "/js/jobIndex.js";

const DB = "placio-demo";
let dbp = null;
let seeding = null;

function idb() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("docs"); r.result.createObjectStore("files"); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
};
const get = (store, key) => tx(store, "readonly", (s) => s.get(key));
const put = (store, key, val) => tx(store, "readwrite", (s) => s.put(val, key));
const del = (store, key) => tx(store, "readwrite", (s) => s.delete(key));
const allKeysValues = async (store) => {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const out = [];
    const c = db.transaction(store).objectStore(store).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else resolve(out); };
    c.onerror = () => reject(c.error);
  });
};

// ── counters + failure simulation ──
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* ignore */ } };
function countRead(col, n = 1) {
  const c = JSON.parse(LS("placio.demo.reads") || '{"total":0,"byCol":{}}');
  c.total += n;
  c.byCol[col] = (c.byCol[col] || 0) + n;
  LS("placio.demo.reads", JSON.stringify(c));
}
function maybeFail() {
  const f = LS("placio.demo.fail");
  if (f === "permission") throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  if (f === "quota") throw Object.assign(new Error("Quota exceeded."), { code: "resource-exhausted" });
  if (f === "network") throw Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
}
const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
const isAdminNow = () => LS("placio.demo.user") === "admin@demo.test";

// ── seed ──
const TITLES = ["Software Engineer", "Frontend Developer", "Backend Developer", "Data Analyst", "Associate Consultant", "Marketing Executive", "Business Analyst", "QA Engineer", "Customer Support Associate", "Finance Analyst", "HR Executive", "Graduate Engineer Trainee", "Sales Development Representative", "DevOps Engineer", "Product Analyst"];
const COMPANIES = ["Infosys", "TCS", "Wipro", "Accenture", "Cognizant", "HCLTech", "Capgemini", "Zoho", "Freshworks", "Razorpay", "Swiggy", "Flipkart", "Paytm", "Deloitte", "KPMG", "EY", "Tech Mahindra", "L&T", "Mphasis", "Hexaware"];
const DEPTS = ["Software", "Fresher-Software", "Fresher-IT", "Data Analyst", "Marketing", "Finance", "Sales", "Human Resources", "Engineering", "Software-Java", "Software-Python", "Software-Frontend", "Quality Assurance", "Customer Support", "Consulting", "Operations", "Fresher-Mechanical", "Fresher-Finance"];
const CITIES = ["Bengaluru", "Pune", "Mumbai", "Hyderabad", "Chennai", "Delhi", "Noida", "Gurgaon", "Kolkata", "Ahmedabad", "Remote", "Jaipur", "Kochi"];
const EXPS = ["Fresher", "0-1", "1-2", "2-4", "3-5", "5+", "1", "2 years", ""];
const SKILLS = ["react, node, sql", "python, pandas, excel", "java, spring, aws", "seo, content, analytics", "", "communication, excel", "sql, power bi"];

function makeDoc(i, now) {
  return normalizeJobRow({
    jobId: "DM" + String(i).padStart(5, "0"),
    title: TITLES[i % TITLES.length] + (i % 13 === 0 ? " II" : ""),
    company: COMPANIES[(i * 7) % COMPANIES.length] + (i % 5 === 0 ? ` ${1 + (i % 9)}` : ""),
    location: CITIES[(i * 3) % CITIES.length], exp: EXPS[i % EXPS.length], dept: DEPTS[(i * 5) % DEPTS.length],
    type: ["WFO", "Hybrid", "Remote", ""][i % 4], salary: i % 3 ? "" : `${3 + (i % 9)} LPA`,
    link: `https://careers.example.com/jobs/${i}`, skill_set: SKILLS[i % SKILLS.length],
    desc: `Demo listing ${i}. You will work with the team to build and ship features, learn on the job and grow.\n\nRequirements: good communication, willingness to learn.`,
  }, { createdAt: now - i * 60000 });
}

async function writeIndex(entries, prevMeta) {
  const { chunks, adminChunks, meta, fullPayload } = buildIndexDocs(entries, prevMeta);
  for (const c of chunks) await put("docs", `jobIndex/${c.id}`, c.data);
  for (const c of adminChunks) await put("docs", `adminIndex/${c.id}`, c.data);
  const path = `index/v${meta.version}.json`;
  await put("files", path, fullPayload);
  meta.storage = { path, url: `https://demo.invalid/${path}`, bytes: Math.round(fullPayload.length / 8) };
  await put("docs", "meta/index", meta);
}

async function seed(n) {
  const now = Date.now();
  const docs = Array.from({ length: n }, (_, i) => makeDoc(i, now));
  for (let i = 0; i < docs.length; i++) await put("docs", `jobs/${docs[i].jobId}`, docs[i]);
  await writeIndex(docs.map(entryFromDoc), null);
}

async function ready() {
  if (!seeding) {
    seeding = (async () => {
      if (!(await get("docs", "meta/index"))) await seed(Number(LS("placio.demo.n")) || 4000);
    })();
  }
  return seeding;
}

async function reset(n = 4000) {
  const db = await idb();
  db.close();
  dbp = null;
  await new Promise((r) => { const q = indexedDB.deleteDatabase(DB); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  LS("placio.demo.n", String(n));
  LS("placio.demo.reads", '{"total":0,"byCol":{}}');
  seeding = null;
  await ready();
  return `demo database reset with ${n} jobs`;
}

if (typeof window !== "undefined") {
  window.__demo = {
    reads: () => JSON.parse(LS("placio.demo.reads") || '{"total":0,"byCol":{}}'),
    resetReads: () => LS("placio.demo.reads", '{"total":0,"byCol":{}}'),
    fail: (k) => LS("placio.demo.fail", k || ""),
    reset,
    dump: async (col) => (await allKeysValues("docs")).filter(([k]) => k.startsWith(col + "/")).map(([k, v]) => ({ id: k.split("/")[1], ...v })),
  };
}

// ── same API as firebase.js ──
export const isConfigured = () => true;

export async function getDocData(col, id) {
  await ready();
  maybeFail();
  countRead(col, 1);
  const v = await get("docs", `${col}/${id}`);
  if (col === "adminIndex" || col === "adminActivity") { if (!isAdminNow()) throw denied(); }
  return v ?? null;
}

function requireAdminWrite(col, id, data) {
  if (!isAdminNow()) {
    if (col === "jobReports") {
      const ok = data && Object.keys(data).sort().join() === "at,jobId,reason" && /^[A-Za-z0-9_]{1,64}$/.test(data.jobId) && Number.isInteger(data.at) && new RegExp(`^${data.jobId}__[0-9]{8}__[0-4]$`).test(id);
      if (ok) return;
    }
    throw denied();
  }
}

export async function setDocData(col, id, data) {
  await ready();
  maybeFail();
  requireAdminWrite(col, id, data);
  if (col === "jobReports" && (await get("docs", `${col}/${id}`))) throw denied(); // create-only
  await put("docs", `${col}/${id}`, structuredClone(data));
}

export async function deleteDocData(col, id) {
  await ready();
  if (!isAdminNow()) throw denied();
  await del("docs", `${col}/${id}`);
}

export async function queryDocs(col, opts = {}) {
  await ready();
  maybeFail();
  if (!isAdminNow()) throw denied(); // listing is admin-only in firestore.rules
  let rows = (await allKeysValues("docs")).filter(([k]) => k.startsWith(col + "/")).map(([k, v]) => ({ id: k.slice(col.length + 1), ...v }));
  for (const [f, op, v] of opts.where || []) rows = rows.filter((r) => (op === "==" ? r[f] === v : op === "!=" ? r[f] !== v : op === "in" ? v.includes(r[f]) : true));
  const key = opts.orderBy === "__name__" || !opts.orderBy ? "id" : opts.orderBy;
  const dir = opts.dir === "desc" ? -1 : 1;
  rows.sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  if (opts.after !== undefined) rows = rows.filter((r) => (dir === 1 ? r[key] > opts.after : r[key] < opts.after));
  rows = rows.slice(0, Math.min(opts.limit || 100, 1000));
  countRead(col, Math.max(1, rows.length));
  return rows;
}

export async function batchWrite(ops) {
  await ready();
  maybeFail();
  if (!isAdminNow()) throw denied();
  for (const op of ops) {
    if (op.type === "delete") await del("docs", `${op.col}/${op.id}`);
    else if (op.merge) await put("docs", `${op.col}/${op.id}`, { ...((await get("docs", `${op.col}/${op.id}`)) || {}), ...structuredClone(op.data) });
    else await put("docs", `${op.col}/${op.id}`, structuredClone(op.data));
  }
}

export async function uploadIndexFile(path, text) {
  await ready();
  if (!isAdminNow()) throw denied();
  if (LS("placio.demo.noStorage") === "1") throw new Error("Storage is not enabled (demo)");
  await put("files", path, text);
  const gz = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return { url: `https://demo.invalid/${path}`, bytes: gz.byteLength };
}
export async function deleteIndexFile(path) { await del("files", path); }
export async function fetchIndexText(url) {
  await ready();
  maybeFail();
  const path = url.replace("https://demo.invalid/", "");
  const t = await get("files", path);
  if (t === undefined) throw new Error("Index file request failed (404)");
  return t;
}

// ── auth ──
const listeners = new Set();
const authState = () => {
  const email = LS("placio.demo.user");
  return email ? { loading: false, user: { email, uid: "demo-" + email }, isAdmin: email === "admin@demo.test" } : { loading: false, user: null, isAdmin: false };
};
export function onAuth(cb) {
  listeners.add(cb);
  setTimeout(() => cb(authState()), 0);
  return () => listeners.delete(cb);
}
export async function signIn(email, password) {
  await new Promise((r) => setTimeout(r, 250));
  if (!((email === "admin@demo.test" && password === "demo1234") || (email === "user@demo.test" && password === "demo1234"))) {
    throw Object.assign(new Error("auth/invalid-credential"), { code: "auth/invalid-credential" });
  }
  LS("placio.demo.user", email);
  listeners.forEach((l) => l(authState()));
}
export async function signOutUser() {
  try { localStorage.removeItem("placio.demo.user"); } catch { /* ignore */ }
  listeners.forEach((l) => l(authState()));
}

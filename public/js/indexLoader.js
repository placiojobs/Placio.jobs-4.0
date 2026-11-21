/**
 * Browser-side loader for the job index (see jobIndex.js for the design).
 *
 * Caches, all intentional:
 *   meta/index doc   localStorage, 30 min TTL        (a returning visitor costs 0 reads for 30 minutes)
 *   the index data   IndexedDB, keyed by version/hash (re-downloaded only when the admin publishes)
 *   job documents    localStorage, 24 h, max 50, tied to the data version (a new daily version refreshes them)
 * Static data (FEATURES.staticData): meta, the job index and every job are first read from plain files in /data
 * (committed with the site), so browsing costs 0 Firestore reads. Anything missing falls back to Firestore.
 * Worst-case staleness for a visitor: ~30 minutes after a new version is deployed (lists, department tables and job pages).
 * If a publish lands while a visitor holds an old meta, the chunk-hash check below re-reads meta once automatically.
 */
import * as fb from "./firebase.js";
import { decodePayload, decodeChunks, decodeLatest, contentHash } from "./jobIndex.js";
import { FEATURES } from "./site-config.js";

const META_TTL = 30 * 60 * 1000;
const JOB_TTL = 24 * 60 * 60 * 1000;
const JOB_MAX = 50;
const STATIC_DIR = "/data";
const META_KEY = "placio.meta.v2";

// ── tiny IndexedDB key/value (all failures are non-fatal: caching is an optimisation) ──
function idb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
    const req = indexedDB.open("placio-index", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const r = db.transaction("kv").objectStore("kv").get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined);
    });
  } catch {
    return undefined;
  }
}
async function idbSet(key, value) {
  try {
    const db = await idb();
    await new Promise((res) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => res();
    });
  } catch {
    /* ignore */
  }
}

// ── static data files (written by the admin "Download website data" export) ──
async function staticFetch(path, as) {
  if (!FEATURES.staticData || typeof fetch === "undefined") return null;
  try {
    const r = await fetch(`${STATIC_DIR}/${path}`, { cache: "no-cache" }); // revalidates: a 304 costs no Firestore read
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    if (as === "json" && !/json/i.test(type)) return null; // a host that answers unknown paths with the HTML shell
    return as === "json" ? await r.json() : await r.text();
  } catch {
    return null;
  }
}

// ── meta ──
export async function loadMeta({ fresh = false } = {}) {
  if (!fresh) {
    try {
      const c = JSON.parse(localStorage.getItem(META_KEY) || "null");
      if (c && c.meta && Date.now() - c.at < META_TTL) return c.meta;
    } catch { /* ignore */ }
  }
  let meta = null;
  if (!fresh) {
    const st = await staticFetch("meta.json", "json");
    if (st && st.version && st.total >= 0 && st.payloadHash) meta = st;
  }
  if (!meta) meta = await fb.getDocData("meta", "index");
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ at: Date.now(), meta }));
  } catch { /* ignore */ }
  return meta;
}

export function forgetCaches() {
  try {
    localStorage.removeItem(META_KEY);
    Object.keys(sessionStorage).filter((k) => k.startsWith("placio.job.")).forEach((k) => sessionStorage.removeItem(k));
    Object.keys(localStorage).filter((k) => k.startsWith("placio.job.")).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  indexPromise = null;
}

// ── index ──
let indexPromise = null;

/** @returns {Promise<{entries:object[], meta:object|null, source:string}>} */
export function loadIndex({ fresh = false } = {}) {
  if (fresh) forgetCaches();
  if (!indexPromise) {
    indexPromise = fetchIndex(fresh).catch((e) => {
      indexPromise = null; // allow a retry after a failure
      throw e;
    });
  }
  return indexPromise;
}

async function fetchIndex(fresh, retried = false) {
  const meta = await loadMeta({ fresh });
  if (!meta || !meta.total) return { entries: [], meta: meta || null, source: "empty" };

  // 1. browser cache
  const cached = await idbGet("index");
  if (cached && cached.version === meta.version && cached.payloadHash === meta.payloadHash) {
    return { entries: decodeCached(cached), meta, source: "cache" };
  }

  // 2a. the static index file committed with the site (0 Firestore reads)
  const stText = await staticFetch(`index-v${meta.version}.json`, "text");
  if (stText) {
    if (contentHash(stText) === meta.payloadHash) {
      const record = { version: meta.version, payloadHash: meta.payloadHash, kind: "file", texts: [stText] };
      idbSet("index", record);
      return { entries: decodeCached(record), meta, source: "static" };
    }
    console.warn("[placio] static index file does not match meta; using the database instead");
  }

  // 2b. the single gzipped file in Storage (no Firestore reads)
  if (FEATURES.indexInStorage && meta.storage && meta.storage.url) {
    try {
      const text = await fb.fetchIndexText(meta.storage.url);
      if (contentHash(text) !== meta.payloadHash) throw new Error("Index file does not match meta (stale or corrupt)");
      const record = { version: meta.version, payloadHash: meta.payloadHash, kind: "file", texts: [text] };
      idbSet("index", record);
      return { entries: decodeCached(record), meta, source: "storage" };
    } catch (e) {
      console.warn("[placio] index file unavailable, using Firestore chunks instead:", e);
    }
  }

  // 3. fallback: Firestore chunk documents (a handful of reads)
  const docs = await Promise.all(meta.chunks.map((c) => fb.getDocData("jobIndex", c.id)));
  const mismatch = docs.some((d, i) => !d || d.h !== meta.chunks[i].h);
  if (mismatch) {
    // The admin published while we were reading. Re-read meta once, then give up gracefully.
    if (!retried) {
      forgetCaches();
      return fetchIndex(true, true);
    }
    throw new Error("The job list is being updated. Please try again in a moment.");
  }
  const record = { version: meta.version, payloadHash: meta.payloadHash, kind: "chunks", texts: docs.map((d) => d.d) };
  idbSet("index", record);
  return { entries: decodeCached(record), meta, source: "chunks" };
}

function decodeCached(record) {
  return record.kind === "file" ? decodePayload(record.texts[0]) : decodeChunks(record.texts.map((d) => ({ d })));
}

export { decodeLatest };

// ── single job: browser cache (24 h) -> static file -> Firestore (1 read) ──
function cachedJob(key, version) {
  try {
    const c = JSON.parse(localStorage.getItem(key) || "null");
    if (c && c.job && Date.now() - c.at < JOB_TTL && (version == null || c.v == null || c.v === version)) return c.job;
  } catch { /* ignore */ }
  return null;
}

function rememberJob(key, version, job) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("placio.job."));
    if (keys.length >= JOB_MAX) {
      keys
        .map((k) => { try { return [k, JSON.parse(localStorage.getItem(k)).at || 0]; } catch { return [k, 0]; } })
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - JOB_MAX + 1)
        .forEach(([k]) => localStorage.removeItem(k));
    }
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), v: version ?? null, job }));
  } catch { /* ignore */ }
}

export async function loadJob(jobId) {
  const key = `placio.job.${jobId}`;
  // The data version we already know about (never fetched just for this: a direct visit to a job link stays at 1 read).
  let version = null;
  try { version = JSON.parse(localStorage.getItem(META_KEY) || "null")?.meta?.version ?? null; } catch { /* ignore */ }
  const hit = cachedJob(key, version);
  if (hit) return hit;
  let job = await staticFetch(`jobs/${encodeURIComponent(jobId)}.json`, "json");
  if (!job || job.jobId !== jobId) job = await fb.getDocData("jobs", jobId); // new since the last deploy, or removed
  if (job) rememberJob(key, version, job);
  return job;
}

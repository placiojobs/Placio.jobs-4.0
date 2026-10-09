/**
 * Browser-side loader for the job index (see jobIndex.js for the design).
 *
 * Caches, all intentional:
 *   meta/index doc   sessionStorage, 5 min TTL       (1 Firestore read per session at most)
 *   the index data   IndexedDB, keyed by version/hash (re-downloaded only when the admin publishes)
 *   job documents    sessionStorage, 2 min, max 20    (back-button doesn't re-read)
 * Worst-case staleness for a visitor: ~5 minutes for lists, ~2 minutes for a job page, after an admin publish.
 */
import * as fb from "./firebase.js";
import { decodePayload, decodeChunks, decodeLatest, contentHash } from "./jobIndex.js";
import { FEATURES } from "./site-config.js";

const META_TTL = 5 * 60 * 1000;
const JOB_TTL = 2 * 60 * 1000;

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

// ── meta ──
export async function loadMeta({ fresh = false } = {}) {
  if (!fresh) {
    try {
      const c = JSON.parse(sessionStorage.getItem("placio.meta.v1") || "null");
      if (c && Date.now() - c.at < META_TTL) return c.meta;
    } catch { /* ignore */ }
  }
  const meta = await fb.getDocData("meta", "index");
  try {
    sessionStorage.setItem("placio.meta.v1", JSON.stringify({ at: Date.now(), meta }));
  } catch { /* ignore */ }
  return meta;
}

export function forgetCaches() {
  try {
    sessionStorage.removeItem("placio.meta.v1");
    Object.keys(sessionStorage).filter((k) => k.startsWith("placio.job.")).forEach((k) => sessionStorage.removeItem(k));
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

  // 2. the single gzipped file in Storage (no Firestore reads)
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

// ── single job document (1 Firestore read, memoised for the session) ──
export async function loadJob(jobId) {
  const key = `placio.job.${jobId}`;
  try {
    const c = JSON.parse(sessionStorage.getItem(key) || "null");
    if (c && Date.now() - c.at < JOB_TTL) return c.job;
  } catch { /* ignore */ }
  const job = await fb.getDocData("jobs", jobId);
  try {
    // keep the session cache small: drop the oldest job entries beyond 20
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("placio.job."));
    if (keys.length >= 20) sessionStorage.removeItem(keys[0]);
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), job }));
  } catch { /* ignore */ }
  return job;
}

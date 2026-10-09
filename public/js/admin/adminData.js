/**
 * ALL admin writes live here. Each one keeps the public job index in sync, so the public site
 * never shows stale/mismatched data.  (Security note: nothing in this file is trusted by the
 * server — firestore.rules / storage.rules decide whether any write is allowed.)
 *
 * Firestore cost of an admin action (writes are small and bounded):
 *   add / edit / remove ONE job  ->  1 job doc + (index chunks that changed) + admin hashes + meta + 1 activity
 *   Excel import                 ->  only NEW / UPDATED jobs are written (UNCHANGED rows cost nothing) + the same index writes
 * Reads: loading the admin state = meta + the index (Storage file; or a few chunk docs) + a few admin-hash docs.
 */
import * as fb from "../firebase.js";
import { loadIndex, loadMeta, forgetCaches } from "../indexLoader.js";
import { buildIndexDocs, diffChunks, entryFromDoc, mergeAdminData, docHash } from "../jobIndex.js";
import { normalizeJobRow } from "../normalize.js";
import { FEATURES } from "../site-config.js";

const KEEP_STORAGE_VERSIONS = 2;

/** Current published state with admin-only data (content hash + createdAt) merged in. */
export async function loadAdminState() {
  forgetCaches();
  const meta = await loadMeta({ fresh: true });
  if (!meta || !meta.total) return { meta: meta || null, entries: [] };
  const { entries } = await loadIndex({ fresh: true });
  const adminDocs = await Promise.all((meta.adminChunks || []).map((id) => fb.getDocData("adminIndex", id)));
  return { meta, entries: mergeAdminData(entries, adminDocs.filter(Boolean)) };
}

export async function logActivity(action, actorEmail, detail) {
  try {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await fb.setDocData("adminActivity", id, { action, actorEmail: actorEmail || null, detail: detail || {}, at: Date.now() });
  } catch (e) {
    console.warn("[placio] could not write activity log", e); // never block the real action because the log failed
  }
}

/**
 * Writes the new index and flips the live pointer (meta) LAST, so visitors never see a half-written index.
 * @returns {{meta:object, storageOk:boolean, warning?:string}}
 */
export async function publishIndex(entries, prevMeta, onProgress = () => {}) {
  const { chunks, adminChunks, meta, fullPayload } = buildIndexDocs(entries, prevMeta);
  let storageOk = false;
  let warning;

  if (FEATURES.indexInStorage && entries.length) {
    onProgress("Uploading job list file…");
    try {
      const path = `index/v${meta.version}.json`;
      const up = await fb.uploadIndexFile(path, fullPayload);
      meta.storage = { path, url: up.url, bytes: up.bytes };
      storageOk = true;
    } catch (e) {
      console.warn("[placio] storage upload failed, falling back to Firestore chunks", e);
      warning = "The job list file could not be uploaded to Firebase Storage, so visitors will use the (slightly more expensive) database fallback. Check that Storage is enabled and storage.rules is deployed.";
    }
  }

  onProgress("Writing job index…");
  const { write, remove } = diffChunks(chunks, prevMeta, "chunks");
  const ops = [
    ...write.map((c) => ({ type: "set", col: "jobIndex", id: c.id, data: c.data })),
    ...remove.map((id) => ({ type: "delete", col: "jobIndex", id })),
    ...adminChunks.map((c) => ({ type: "set", col: "adminIndex", id: c.id, data: c.data })),
    ...(prevMeta?.adminChunks || []).filter((id) => !adminChunks.some((c) => c.id === id)).map((id) => ({ type: "delete", col: "adminIndex", id })),
  ];
  // few, large documents: commit a handful at a time to stay far below request-size limits
  for (let i = 0; i < ops.length; i += 4) await fb.batchWrite(ops.slice(i, i + 4));

  onProgress("Publishing…");
  await fb.setDocData("meta", "index", meta); // the live switch

  // housekeeping (best effort): drop storage files older than the last two versions
  if (storageOk && meta.version > KEEP_STORAGE_VERSIONS) {
    fb.deleteIndexFile(`index/v${meta.version - KEEP_STORAGE_VERSIONS}.json`).catch(() => {});
  }
  forgetCaches();
  return { meta, storageOk, warning };
}

// ── single job ─────────────────────────────────────────────────────────
/** Creates or edits one job. `row` is already validated by validate.js. */
export async function saveJob(row, { mode, actorEmail }) {
  const jobId = row.jobId.trim();
  const existing = await fb.getDocData("jobs", jobId);
  if (mode === "create" && existing) {
    const err = new Error("A job with this Job ID already exists.");
    err.code = "duplicate";
    throw err;
  }
  if (mode === "edit" && !existing) {
    const err = new Error("Job not found.");
    err.code = "not-found";
    throw err;
  }
  const doc = normalizeJobRow(row, { createdAt: existing?.createdAt, status: "active" });
  await fb.setDocData("jobs", jobId, doc);

  const state = await loadAdminState();
  const next = state.entries.filter((e) => e.jobId !== jobId);
  next.push(entryFromDoc(doc));
  const res = await publishIndex(next, state.meta);
  await logActivity(mode === "create" ? "add_job" : "edit_job", actorEmail, { jobId, title: doc.title });
  return { doc, ...res };
}

export async function getJobForEdit(jobId) {
  const doc = await fb.getDocData("jobs", jobId);
  if (!doc) return null;
  return {
    jobId: doc.jobId, title: doc.title, company: doc.company, location: doc.location || "", salary: doc.salary || "",
    exp: doc.exp || "", type: doc.type || "", dept: doc.dept || "", link: doc.link || "", desc: doc.desc || "", skill_set: doc.skillSet || "",
    status: doc.status,
  };
}

/** Bulk activate / deactivate. Deactivating never deletes data: the job page shows "no longer available". */
export async function setJobsStatus(jobIds, status, { actorEmail, onProgress = () => {} }) {
  const ids = [...new Set(jobIds)];
  if (!ids.length) return { changed: 0 };
  const now = Date.now();
  let revived = [];
  if (status === "active") {
    onProgress("Reading jobs…");
    revived = (await Promise.all(ids.map((id) => fb.getDocData("jobs", id)))).filter(Boolean).map((d) => ({ ...d, status: "active" }));
  }
  onProgress("Updating jobs…");
  await fb.batchWrite(ids.map((id) => ({ type: "set", col: "jobs", id, data: { status, updatedAt: now }, merge: true })));

  const state = await loadAdminState();
  let next;
  if (status === "removed") {
    const gone = new Set(ids);
    next = state.entries.filter((e) => !gone.has(e.jobId));
  } else {
    const revive = new Set(revived.map((d) => d.jobId));
    next = state.entries.filter((e) => !revive.has(e.jobId)).concat(revived.map(entryFromDoc));
  }
  const res = await publishIndex(next, state.meta, onProgress);
  await logActivity(status === "removed" ? "deactivate_jobs" : "activate_jobs", actorEmail, { count: ids.length });
  return { changed: ids.length, ...res };
}

/** Admin-only: list inactive (removed) jobs. Costs one read per job returned. */
export async function listInactiveJobs(limit = 500) {
  return fb.queryDocs("jobs", { where: [["status", "==", "removed"]], orderBy: "__name__", limit });
}

// ── Excel import ───────────────────────────────────────────────────────
/**
 * Compares validated rows with what is live, using the content hashes — no per-job reads.
 * @returns {{plan, counts}}
 */
export function planImport(rows, state, mode, now = Date.now()) {
  const byId = new Map(state.entries.map((e) => [e.jobId, e]));
  const incoming = new Set();
  const toWrite = []; // docs to write
  const newIds = [], updatedIds = [], unchangedIds = [];
  rows.forEach((row, i) => {
    const jobId = row.jobId.trim();
    incoming.add(jobId);
    const existing = byId.get(jobId);
    // new jobs keep file order: first row = newest, so the page shows them in the order you wrote them
    const doc = normalizeJobRow(row, { createdAt: existing ? existing.createdAt : now - i });
    if (!existing) { newIds.push(jobId); toWrite.push(doc); }
    else if (existing.h !== docHash(doc)) { updatedIds.push(jobId); toWrite.push(doc); }
    else unchangedIds.push(jobId);
  });
  const removedIds = mode === "sync" ? state.entries.filter((e) => !incoming.has(e.jobId)).map((e) => e.jobId) : [];
  return {
    plan: { toWrite, removedIds },
    counts: { added: newIds.length, updated: updatedIds.length, unchanged: unchangedIds.length, removed: removedIds.length },
  };
}

/**
 * Applies a plan. Order matters for safety:
 *   1. job documents (new/updated), 2. mark removed (sync only), 3. publish the index (live switch).
 * If step 1/2 fails midway nothing visitors see has changed yet; just run the same file again (it is idempotent).
 */
export async function commitImport({ plan, counts, state, fileName, mode, warnings, actorEmail, onProgress = () => {} }) {
  const { toWrite, removedIds } = plan;
  if (!toWrite.length && !removedIds.length) return { counts, published: false };

  const BATCH = 400;
  const total = toWrite.length + removedIds.length;
  let done = 0;
  for (let i = 0; i < toWrite.length; i += BATCH) {
    const part = toWrite.slice(i, i + BATCH);
    await fb.batchWrite(part.map((doc) => ({ type: "set", col: "jobs", id: doc.jobId, data: doc })));
    done += part.length;
    onProgress({ phase: "Saving jobs", done, total });
  }
  const now = Date.now();
  for (let i = 0; i < removedIds.length; i += BATCH) {
    const part = removedIds.slice(i, i + BATCH);
    await fb.batchWrite(part.map((id) => ({ type: "set", col: "jobs", id, data: { status: "removed", updatedAt: now }, merge: true })));
    done += part.length;
    onProgress({ phase: "Removing jobs not in the file", done, total });
  }

  onProgress({ phase: "Publishing to the website", done: total, total });
  const gone = new Set([...removedIds, ...toWrite.map((d) => d.jobId)]);
  const next = state.entries.filter((e) => !gone.has(e.jobId)).concat(toWrite.map(entryFromDoc));
  const res = await publishIndex(next, state.meta, (phase) => onProgress({ phase, done: total, total }));
  await logActivity("excel_import", actorEmail, { fileName, mode, ...counts, warnings: warnings ?? 0, total: next.length });
  return { counts, published: true, ...res };
}

// ── repair ─────────────────────────────────────────────────────────────
/** Rebuilds the whole index from the jobs collection. Reads every ACTIVE job once (use after manual database edits or first deploy). */
export async function rebuildIndexFromDatabase({ actorEmail, onProgress = () => {} }) {
  const prev = await loadMeta({ fresh: true });
  const entries = [];
  let after;
  for (;;) {
    const page = await fb.queryDocs("jobs", { where: [["status", "==", "active"]], orderBy: "__name__", limit: 500, after });
    page.forEach((d) => entries.push(entryFromDoc(d)));
    onProgress(`Read ${entries.length} jobs…`);
    if (page.length < 500) break;
    after = page[page.length - 1].id;
  }
  const res = await publishIndex(entries, prev, onProgress);
  await logActivity("rebuild_index", actorEmail, { count: entries.length });
  return { count: entries.length, ...res };
}

/** Reads recent audit entries (admin only). */
export async function recentActivity(limit = 25) {
  return fb.queryDocs("adminActivity", { orderBy: "at", dir: "desc", limit });
}

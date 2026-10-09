/**
 * THE JOB INDEX — how Placio keeps database reads AND bandwidth low.
 *
 * Problem: search + multi-select filters (department x city x company x
 * experience) can't be one Firestore query, and reading every job per
 * request costs thousands of reads. This site has no server, so:
 *
 *   Admin publishes ->  a COMPACT "card index" of all active jobs is built:
 *        - dictionary-encoded (each company/department/city string stored once)
 *        - only card fields: no description, no link, no internal/admin fields
 *        - ONE gzipped file in Firebase Storage  (versioned URL => CDN/browser cacheable,
 *          costs zero Firestore reads), plus the same data split into a few
 *          Firestore "chunk" documents as an automatic FALLBACK
 *        - one small meta document (version, counts, 6 latest jobs, matrix data)
 *   Visitor browses ->  1 meta read per session + the index file (cached in
 *        IndexedDB until the version changes), then filters/searches/sorts
 *        locally with no further requests.
 *   Opening a job   ->  exactly 1 read (jobs/{jobId}); description/link are only ever fetched here.
 *
 * Admin-only data (content hashes + createdAt, used by Excel sync to detect
 * NEW/UPDATED/UNCHANGED without reading every job) lives in separate
 * `adminIndex` documents that the rules make unreadable to the public.
 *
 * Measured size (see tests/scale.mjs): ~65 bytes/job gzipped-ish; 10k jobs
 * ~ 0.9 MB raw / ~0.15 MB gzipped. Practical ceiling ~25k jobs on phones.
 *
 * Pure module (no DOM/Firebase) so it is unit-tested in Node.
 * Firestore forbids arrays-of-arrays, so rows live inside ONE JSON string field.
 */
import { parseExperience, cleanExperienceText } from "./experience.js";
import { buildJobSlug } from "./slug.js";
import { blankIfPlaceholder } from "./normalize.js";
import { DEPT_CITY_MATRIX } from "./site-config.js";

export const CHUNK_MAX_BYTES = 600_000; // keep well under Firestore's 1 MiB document limit
export const CHUNK_MAX_ENTRIES = 2500;
export const ADMIN_CHUNK_ROWS = 8000;
export const LATEST_COUNT = 6;
export const PAYLOAD_VERSION = 2;

/** Fast non-cryptographic 53-bit hash (cyrb53) -> base36. Change detection / cache keys only. */
export function contentHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Hash of the user-visible content of a job doc (Excel sync diff). */
export function docHash(doc) {
  const f = ["title", "company", "location", "salary", "exp", "type", "dept", "link", "desc", "skillSet"];
  return contentHash(f.map((k) => String(doc[k] ?? "")).join("␟"));
}

// ── In-memory entry ─────────────────────────────────────────────────────
/** Builds the decoded entry (with lowercase derived fields) from plain values. */
export function makeEntry(v) {
  const company = v.company || "", location = v.location || "", dept = v.dept || "", title = v.title || "", skills = v.skills || "";
  const min = v.experienceMin === undefined ? null : v.experienceMin;
  return {
    jobId: v.jobId, title, company, location, dept,
    exp: v.exp || "", type: v.type || "", salary: v.salary || "", skills,
    experienceMin: min,
    experienceMax: min === null || v.experienceMax === undefined ? null : v.experienceMax,
    isFresher: min === 0,
    order: v.order, // position in "latest" order (public); createdAt/h are admin-only extras below
    createdAt: v.createdAt, h: v.h,
    slug: buildJobSlug(v.jobId, title, company),
    normalizedCompany: company.toLowerCase(),
    normalizedLocation: location.toLowerCase(),
    normalizedDept: dept.toLowerCase(),
    // Description is deliberately NOT searchable: shipping it would multiply the download size.
    searchableText: [title, company, location, dept, skills].filter(Boolean).join(" ").toLowerCase(),
    normalizedSkills: skills ? skills.split(/[,;/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [],
  };
}

/** Index entry from a full Firestore job document (admin side). */
export function entryFromDoc(doc) {
  // Re-parse the stored experience TEXT so documents written by older versions index correctly.
  const range = parseExperience(blankIfPlaceholder(doc.exp));
  return makeEntry({
    jobId: doc.jobId, title: doc.title, company: doc.company, location: doc.location, dept: doc.dept,
    exp: cleanExperienceText(blankIfPlaceholder(doc.exp)), type: blankIfPlaceholder(doc.type), salary: blankIfPlaceholder(doc.salary), skills: blankIfPlaceholder(doc.skillSet),
    experienceMin: range ? range.min : null, experienceMax: range ? range.max : null,
    createdAt: doc.createdAt || 0, h: docHash(doc),
  });
}

export function sortEntries(entries) {
  return entries.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0));
}

// ── Compact payload (dictionary encoded) ────────────────────────────────
/**
 * Row = [jobId, title, companyIdx, locationIdx, deptIdx, exp, type, salary, skills, expMin, expMax]
 * expMin -1 = unknown experience, expMax -1 = no upper bound. "Fresher" is derived (expMin === 0).
 * Rows are written in "latest first" order, so position IS the sort order — no timestamp is shipped.
 */
export function encodePayload(sortedEntries) {
  const dict = { c: new Map(), d: new Map(), l: new Map() };
  const idx = (m, s) => {
    let i = m.get(s);
    if (i === undefined) { i = m.size; m.set(s, i); }
    return i;
  };
  const r = sortedEntries.map((e) => [
    e.jobId, e.title, idx(dict.c, e.company), idx(dict.l, e.location), idx(dict.d, e.dept),
    e.exp, e.type, e.salary, e.skills,
    e.experienceMin === null ? -1 : e.experienceMin,
    e.experienceMin === null || e.experienceMax === null ? -1 : e.experienceMax,
  ]);
  return JSON.stringify({ v: PAYLOAD_VERSION, c: [...dict.c.keys()], d: [...dict.d.keys()], l: [...dict.l.keys()], r });
}

/** @param {number} offset position of the first row in the global latest order (for chunks) */
export function decodePayload(text, offset = 0) {
  const p = typeof text === "string" ? JSON.parse(text) : text;
  if (p.v !== PAYLOAD_VERSION) throw new Error("Unsupported index version");
  return p.r.map((a, i) =>
    makeEntry({
      jobId: a[0], title: a[1], company: p.c[a[2]], location: p.l[a[3]], dept: p.d[a[4]],
      exp: a[5], type: a[6], salary: a[7], skills: a[8],
      experienceMin: a[9] < 0 ? null : a[9], experienceMax: a[10] < 0 ? null : a[10],
      order: offset + i,
    })
  );
}

// ── Facets (counts shown in filters, homepage chips, matrices) ──────────
export function computeFacets(entries) {
  const count = (get) => {
    const m = new Map();
    for (const e of entries) {
      const k = get(e);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const depts = count((e) => e.dept);
  const locs = count((e) => e.location);
  const cfg = DEPT_CITY_MATRIX;
  const topDepts = depts.filter(([n]) => !cfg.excludeDepartments.includes(n)).slice(0, cfg.maxDepartments).map(([n]) => n);
  const topCities = locs.filter(([n]) => !cfg.excludeCities.includes(n)).slice(0, cfg.maxCities).map(([n]) => n);
  const cell = new Map();
  for (const e of entries) if (e.dept && e.location) cell.set(`${e.dept}␟${e.location}`, (cell.get(`${e.dept}␟${e.location}`) || 0) + 1);
  const counts = [];
  topDepts.forEach((d) => topCities.forEach((c) => counts.push(cell.get(`${d}␟${c}`) || 0)));
  return {
    depts: { names: depts.map((d) => d[0]), counts: depts.map((d) => d[1]) },
    locs: { names: locs.map((d) => d[0]), counts: locs.map((d) => d[1]) },
    matrix: { depts: topDepts, cities: topCities, counts },
  };
}

// ── Building everything the admin publishes ─────────────────────────────
/**
 * @param entries admin entries (need createdAt + h)
 * @returns {{chunks, adminChunks, meta, fullPayload}}
 *   chunks      Firestore fallback docs   jobIndex/c0..cN
 *   adminChunks admin-only hash docs      adminIndex/h0..hN
 *   fullPayload the single string for the Storage file
 *   meta        meta/index doc (the admin adds `storage` after uploading the file)
 */
export function buildIndexDocs(entries, prevMeta = null, now = Date.now()) {
  const sorted = sortEntries(entries);
  const enc = new TextEncoder();

  const chunks = [];
  let rows = [];
  let bytes = 0;
  const flush = () => {
    if (!rows.length) return;
    const d = encodePayload(rows);
    chunks.push({ id: `c${chunks.length}`, data: { n: rows.length, h: contentHash(d), d, updatedAt: now } });
    rows = [];
    bytes = 0;
  };
  for (const e of sorted) {
    // cheap upper-bound of this row's size (dictionary entries are amortised by the chunk)
    const size = enc.encode(JSON.stringify([e.jobId, e.title, e.exp, e.type, e.salary, e.skills, e.company, e.location, e.dept])).length + 24;
    if (rows.length && (bytes + size > CHUNK_MAX_BYTES * 0.7 || rows.length >= CHUNK_MAX_ENTRIES)) flush();
    rows.push(e);
    bytes += size;
  }
  flush();

  const adminChunks = [];
  for (let i = 0; i < sorted.length; i += ADMIN_CHUNK_ROWS) {
    const d = JSON.stringify(sorted.slice(i, i + ADMIN_CHUNK_ROWS).map((e) => [e.jobId, e.h, e.createdAt]));
    adminChunks.push({ id: `h${adminChunks.length}`, data: { n: Math.min(ADMIN_CHUNK_ROWS, sorted.length - i), d, updatedAt: now } });
  }

  const facets = computeFacets(sorted);
  const fullPayload = encodePayload(sorted);
  const meta = {
    version: (prevMeta?.version || 0) + 1,
    updatedAt: now,
    total: sorted.length,
    chunks: chunks.map((c) => ({ id: c.id, h: c.data.h, n: c.data.n })),
    adminChunks: adminChunks.map((c) => c.id),
    latest: encodePayload(sorted.slice(0, LATEST_COUNT)),
    depts: facets.depts,
    locs: facets.locs,
    matrix: facets.matrix,
    payloadHash: contentHash(fullPayload),
  };
  return { chunks, adminChunks, meta, fullPayload };
}

/** Which chunk docs must be written / deleted to go from prevMeta to the new index. */
export function diffChunks(newChunks, prevMeta, key = "chunks") {
  const prev = new Map((prevMeta?.[key] || []).map((c) => [c.id, c.h]));
  const write = newChunks.filter((c) => prev.get(c.id) !== c.data.h);
  const keep = new Set(newChunks.map((c) => c.id));
  const old = (prevMeta?.[key] || []).map((c) => c.id);
  return { write, remove: old.filter((id) => !keep.has(id)) };
}

/** Chunk docs -> decoded entries in global order. */
export function decodeChunks(chunkDocsInOrder) {
  const out = [];
  for (const c of chunkDocsInOrder) out.push(...decodePayload(c.d, out.length));
  return out;
}

export function decodeLatest(meta) {
  try {
    return decodePayload(meta.latest || '{"v":2,"c":[],"d":[],"l":[],"r":[]}');
  } catch {
    return [];
  }
}

/** Admin: attach createdAt + hash from the admin-only docs onto the public entries. */
export function mergeAdminData(entries, adminChunkDocs) {
  const m = new Map();
  for (const c of adminChunkDocs) for (const [id, h, createdAt] of JSON.parse(c.d)) m.set(id, { h, createdAt });
  return entries.map((e) => {
    const a = m.get(e.jobId);
    return { ...e, h: a?.h || "", createdAt: a?.createdAt || 0 };
  });
}


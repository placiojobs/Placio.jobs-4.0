// In-memory stand-in for public/js/firebase.js, used by the Node integration tests (swapped in by tests/hooks.mjs).
// Same exports as the real module; additionally counts reads/writes and enforces the key security rules.
export const db = new Map(); // "col/id" -> data
export const files = new Map(); // storage path -> text
export const stats = { reads: 0, readsByCol: {}, writes: 0, deletes: 0, storageUploads: 0, storageFetches: 0 };
export const ctl = { admin: true, storageFails: false, fetchFails: false, denyAll: false }; // denyAll = "old rules still deployed"

export function resetStats() {
  stats.reads = 0; stats.writes = 0; stats.deletes = 0; stats.storageUploads = 0; stats.storageFetches = 0; stats.readsByCol = {};
}
export function resetAll() { db.clear(); files.clear(); resetStats(); ctl.admin = true; ctl.storageFails = false; ctl.fetchFails = false; ctl.denyAll = false; }
const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
const read = (col, n = 1) => { stats.reads += n; stats.readsByCol[col] = (stats.readsByCol[col] || 0) + n; };

export const isConfigured = () => true;
export async function getDocData(col, id) {
  if (ctl.denyAll) throw denied();
  if ((col === "adminIndex" || col === "adminActivity") && !ctl.admin) throw denied();
  read(col);
  return structuredClone(db.get(`${col}/${id}`) ?? null);
}
export async function setDocData(col, id, data) {
  if (!ctl.admin) { if (col === "jobReports" && !db.has(`${col}/${id}`)) { db.set(`${col}/${id}`, structuredClone(data)); stats.writes++; return; } throw denied(); }
  db.set(`${col}/${id}`, structuredClone(data)); stats.writes++;
}
export async function deleteDocData(col, id) { if (!ctl.admin) throw denied(); db.delete(`${col}/${id}`); stats.deletes++; }
export async function queryDocs(col, opts = {}) {
  if (ctl.denyAll) throw denied();
  if (!ctl.admin) throw denied();
  let rows = [...db.entries()].filter(([k]) => k.startsWith(col + "/")).map(([k, v]) => ({ id: k.slice(col.length + 1), ...structuredClone(v) }));
  for (const [f, op, v] of opts.where || []) rows = rows.filter((r) => (op === "==" ? r[f] === v : true));
  const key = !opts.orderBy || opts.orderBy === "__name__" ? "id" : opts.orderBy;
  const dir = opts.dir === "desc" ? -1 : 1;
  rows.sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  if (opts.after !== undefined) rows = rows.filter((r) => (dir === 1 ? r[key] > opts.after : r[key] < opts.after));
  rows = rows.slice(0, Math.min(opts.limit || 100, 1000));
  read(col, Math.max(1, rows.length));
  return rows;
}
export async function batchWrite(ops) {
  if (!ctl.admin) throw denied();
  for (const op of ops) {
    if (op.type === "delete") { db.delete(`${op.col}/${op.id}`); stats.deletes++; }
    else { db.set(`${op.col}/${op.id}`, op.merge ? { ...(db.get(`${op.col}/${op.id}`) || {}), ...structuredClone(op.data) } : structuredClone(op.data)); stats.writes++; }
  }
}
export async function uploadIndexFile(path, text) {
  if (!ctl.admin) throw denied();
  if (ctl.storageFails) throw new Error("storage/unauthorized");
  files.set(path, text); stats.storageUploads++;
  return { url: `https://mem.invalid/${path}`, bytes: Math.round(text.length / 8) };
}
export async function deleteIndexFile(path) { files.delete(path); }
export async function fetchIndexText(url) {
  stats.storageFetches++;
  if (ctl.fetchFails) throw new Error("Index file request failed (404)");
  const t = files.get(url.replace("https://mem.invalid/", ""));
  if (t === undefined) throw new Error("Index file request failed (404)");
  return t;
}
export function onAuth(cb) { cb({ loading: false, user: null, isAdmin: false }); return () => {}; }
export async function signIn() {}
export async function signOutUser() {}

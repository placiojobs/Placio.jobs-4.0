/**
 * THE ONLY FILE THAT TALKS TO FIREBASE.
 * Everything else (pages, admin, index loader) calls the small functions below, so:
 *   - to change a Firestore query or a collection name, this is the place;
 *   - dev/fake-firebase.js implements the same exports for offline demo/testing.
 *
 * The SDK is loaded lazily from Google's CDN (no build step). Public pages only
 * ever load Firestore; the Auth and Storage SDKs load only when the admin needs them.
 * Security does NOT rely on this code — see firestore.rules / storage.rules.
 */
import { FIREBASE_CONFIG } from "./site-config.js";

const SDK = "https://www.gstatic.com/firebasejs/12.18.0";

/** Developer-only: on localhost, `localStorage.setItem("placio.emulator","1")` points the site at the local Firebase emulators
 *  (firebase emulators:start). Never active on the real domain. */
const EMULATOR = typeof location !== "undefined" && location.hostname === "localhost" && (() => { try { return localStorage.getItem("placio.emulator") === "1"; } catch { return false; } })();

let appPromise = null;
let fsPromise = null;
let authPromise = null;
let storagePromise = null;

export function isConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}

function getApp() {
  if (!appPromise) {
    appPromise = import(`${SDK}/firebase-app.js`).then(({ initializeApp }) => initializeApp(FIREBASE_CONFIG));
  }
  return appPromise;
}
function fs() {
  if (!fsPromise) {
    fsPromise = Promise.all([getApp(), import(`${SDK}/firebase-firestore.js`)]).then(([app, m]) => {
      const db = m.getFirestore(app);
      if (EMULATOR) m.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      return { m, db };
    });
  }
  return fsPromise;
}
function authSdk() {
  if (!authPromise) {
    // initializeAuth WITHOUT a popup/redirect resolver: email+password sign-in needs none, and this
    // avoids loading Google's apis.google.com script + auth iframe (smaller, and a much tighter CSP).
    authPromise = Promise.all([getApp(), import(`${SDK}/firebase-auth.js`)]).then(([app, m]) => {
      const auth = m.initializeAuth(app, { persistence: [m.indexedDBLocalPersistence, m.browserLocalPersistence] });
      if (EMULATOR) m.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      return { m, auth };
    });
  }
  return authPromise;
}
function storageSdk() {
  if (!storagePromise) {
    storagePromise = Promise.all([getApp(), import(`${SDK}/firebase-storage.js`)]).then(([app, m]) => {
      const st = m.getStorage(app);
      if (EMULATOR) m.connectStorageEmulator(st, "127.0.0.1", 9199);
      return { m, st };
    });
  }
  return storagePromise;
}

// ── Firestore ───────────────────────────────────────────────────────────
/** @returns data object, or null when the document doesn't exist. Costs 1 read. */
export async function getDocData(col, id) {
  const { m, db } = await fs();
  const snap = await m.getDoc(m.doc(db, col, id));
  return snap.exists() ? snap.data() : null;
}

export async function setDocData(col, id, data) {
  const { m, db } = await fs();
  await m.setDoc(m.doc(db, col, id), data);
}

export async function deleteDocData(col, id) {
  const { m, db } = await fs();
  await m.deleteDoc(m.doc(db, col, id));
}

/**
 * Small, bounded query helper (admin screens + activity log only).
 * opts: { where: [[field, op, value]], orderBy: field|"__name__", dir: "asc"|"desc", limit, after (doc id or field value) }
 * Every public page uses getDocData / the index loader instead — never this.
 */
export async function queryDocs(col, opts = {}) {
  const { m, db } = await fs();
  const parts = [];
  for (const [f, op, v] of opts.where || []) parts.push(m.where(f, op, v));
  if (opts.orderBy) parts.push(m.orderBy(opts.orderBy === "__name__" ? m.documentId() : opts.orderBy, opts.dir || "asc"));
  if (opts.after !== undefined) parts.push(m.startAfter(opts.after));
  parts.push(m.limit(Math.min(opts.limit || 100, 1000)));
  const snap = await m.getDocs(m.query(m.collection(db, col), ...parts));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ops: [{type:"set"|"delete", col, id, data, merge?}] — committed in batches of <=400 operations. */
export async function batchWrite(ops) {
  const { m, db } = await fs();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = m.writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      const ref = m.doc(db, op.col, op.id);
      if (op.type === "delete") batch.delete(ref);
      else if (op.merge) batch.set(ref, op.data, { merge: true });
      else batch.set(ref, op.data);
    }
    await batch.commit();
  }
}

// ── Storage (job index file) ────────────────────────────────────────────
/** Gzips `text` in the browser and uploads it as an immutable, CDN-cacheable file. Returns its public URL. */
export async function uploadIndexFile(path, text) {
  if (typeof CompressionStream === "undefined") throw new Error("This browser cannot gzip files (CompressionStream missing).");
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const { m, st } = await storageSdk();
  const r = m.ref(st, path);
  await m.uploadBytes(r, bytes, {
    contentType: "application/json",
    contentEncoding: "gzip",
    cacheControl: "public, max-age=31536000, immutable",
  });
  return { url: await m.getDownloadURL(r), bytes: bytes.length };
}

export async function deleteIndexFile(path) {
  const { m, st } = await storageSdk();
  await m.deleteObject(m.ref(st, path));
}

/** Public fetch of the index file (a plain HTTPS GET — no SDK, no Firestore read). */
export async function fetchIndexText(url) {
  const res = await fetch(url, { credentials: "omit", cache: "default" });
  if (!res.ok) throw new Error(`Index file request failed (${res.status})`);
  return res.text();
}

// ── Auth (admin only) ───────────────────────────────────────────────────
/** cb({ loading, user, isAdmin }) — isAdmin comes from the signed `admin: true` token claim. */
export function onAuth(cb) {
  let unsub = () => {};
  let cancelled = false;
  authSdk().then(({ m, auth }) => {
    if (cancelled) return;
    unsub = m.onAuthStateChanged(auth, async (user) => {
      if (!user) return cb({ loading: false, user: null, isAdmin: false });
      const t = await user.getIdTokenResult();
      cb({ loading: false, user: { email: user.email, uid: user.uid }, isAdmin: t.claims.admin === true });
    });
  }).catch(() => cb({ loading: false, user: null, isAdmin: false, error: true }));
  return () => { cancelled = true; unsub(); };
}

export async function signIn(email, password) {
  const { m, auth } = await authSdk();
  await m.signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  const { m, auth } = await authSdk();
  await m.signOut(auth);
}

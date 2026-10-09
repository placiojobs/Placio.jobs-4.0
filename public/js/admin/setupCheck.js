/**
 * "Why don't my jobs show?" — runs the handful of checks that must pass for the public site to work and
 * returns plain-language results. Costs at most ~3 Firestore reads. Used by the admin Dashboard.
 *
 * Each result: { level: "ok" | "warn" | "fail", title, detail }
 */
import * as fb from "../firebase.js";
import { loadMeta } from "../indexLoader.js";
import { FEATURES } from "../site-config.js";

const DEPLOY = FEATURES.indexInStorage ? "firebase deploy --only firestore:rules,storage" : "firebase deploy --only firestore:rules";

export async function runSetupCheck() {
  const out = [];
  const add = (level, title, detail = "") => out.push({ level, title, detail });
  let meta = null;
  let metaReadable = false;

  // 1. Can the PUBLIC read the published index pointer? (needs the new firestore.rules to be deployed)
  try {
    meta = await loadMeta({ fresh: true });
    metaReadable = true;
    add("ok", "The database allows the public site to read the job index", "Your new security rules are deployed.");
  } catch (e) {
    if (e?.code === "permission-denied") {
      add("fail", "The database refuses to let visitors read jobs",
        `Your new security rules are almost certainly NOT deployed yet (the old rules block everything). Run this once in the project folder, then reload:  ${DEPLOY}`);
    } else if (e?.code === "unavailable" || /offline|network/i.test(String(e?.message))) {
      add("fail", "Can't reach Firebase", "Check your internet connection, and that Firestore is created (Firebase console → Build → Firestore Database).");
    } else if (/not-found|NOT_FOUND/.test(String(e?.code) + String(e?.message))) {
      add("fail", "Firestore database not found", "Create it in Firebase console → Build → Firestore Database → Create database.");
    } else {
      add("fail", "Reading the job index failed", String(e?.code || e?.message || e));
    }
  }

  // 2. Can THIS account (admin) list jobs? (needs the admin claim + deployed rules)
  let jobsInDb = null;
  try {
    const rows = await fb.queryDocs("jobs", { limit: 1 });
    jobsInDb = rows.length > 0;
    add("ok", "This admin account can read the jobs collection", jobsInDb ? "The database contains jobs." : "The database has no job documents yet.");
  } catch (e) {
    if (e?.code === "permission-denied") {
      add("fail", "This account is not allowed to list jobs",
        `Either the new rules are not deployed (${DEPLOY}) or this account has no admin permission: run  node scripts/grant-admin.mjs <key.json> <your-email>  then sign out and sign in again.`);
    } else add("fail", "Listing jobs failed", String(e?.code || e?.message || e));
  }

  // 3. Is an index published?
  if (metaReadable) {
    if (!meta || !meta.total) {
      add("warn", "No public job list has been published yet",
        jobsInDb
          ? "Your database already contains jobs — press “Rebuild job index” below (one-time), and they will appear on the website."
          : "Import an Excel file (Admin → Excel) or add a job. The website stays empty until something is published.");
    } else {
      add("ok", `${meta.total} jobs are published (version ${meta.version})`, "");
    }
  }

  // 4. How is the job list delivered?
  if (!FEATURES.indexInStorage) {
    if (meta?.total) add("ok", "Job list is delivered from database documents (free Spark plan mode)", `About ${(meta.chunks || []).length} documents + 1 small meta document per new visitor, then cached in the browser.`);
  } else if (meta?.storage?.url) {
    try {
      await fb.fetchIndexText(meta.storage.url);
      add("ok", "The job list file in Firebase Storage is reachable", "Visitors download one small cached file instead of many database reads.");
    } catch (e) {
      add("warn", "The job list file in Storage can't be downloaded",
        "The site still works: it automatically falls back to database documents (more reads). To fix: enable Storage (needs the Blaze plan), deploy the rules (" + DEPLOY + ") and publish again.");
    }
  } else if (meta?.total) {
    add("warn", "Job list is delivered from database documents (fallback)", "Storage is switched on in site-config.js but no Storage file was published. Enable Firebase Storage (Blaze plan) and publish again, or set FEATURES.indexInStorage to false.");
  }

  return out;
}

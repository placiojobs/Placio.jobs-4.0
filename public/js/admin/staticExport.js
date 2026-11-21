/**
 * "Download website data": builds the static files visitors read instead of Firestore (see indexLoader.js).
 *   data/meta.json            the published meta document
 *   data/index-v<N>.json      the full job list for that meta version
 *   data/jobs/<jobId>.json    one file per ACTIVE job (removed jobs simply have no file)
 * Costs the admin one read per active job (done once a day, after the Excel import).
 */
import * as fb from "../firebase.js";
import { loadIndex, loadMeta } from "../indexLoader.js";
import { encodePayload, contentHash } from "../jobIndex.js";
import { makeZip } from "./zip.js";

export async function buildStaticData(onProgress = () => {}) {
  const meta = await loadMeta({ fresh: true });
  if (!meta || !meta.total) throw new Error("Nothing is published yet. Publish (import an Excel or Rebuild job index) first.");
  const { entries } = await loadIndex({ fresh: true });
  const indexText = encodePayload(entries);
  if (contentHash(indexText) !== meta.payloadHash) {
    throw new Error("The job list changed while exporting, or does not match the published version. Press Rebuild job index, then try again.");
  }
  const files = [
    { name: "data/meta.json", text: JSON.stringify(meta) },
    { name: `data/index-v${meta.version}.json`, text: indexText },
  ];
  let after;
  let n = 0;
  for (;;) {
    const page = await fb.queryDocs("jobs", { where: [["status", "==", "active"]], orderBy: "__name__", limit: 500, after });
    for (const d of page) {
      const { id, ...doc } = d;
      files.push({ name: `data/jobs/${encodeURIComponent(doc.jobId || id)}.json`, text: JSON.stringify({ ...doc, jobId: doc.jobId || id }) });
      n++;
    }
    onProgress(`Read ${n} jobs…`);
    if (page.length < 500) break;
    after = page[page.length - 1].id;
  }
  return { zip: makeZip(files), version: meta.version, jobs: n, indexJobs: entries.length };
}

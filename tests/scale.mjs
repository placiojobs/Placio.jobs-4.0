// Scale measurement:  node tests/scale.mjs
// Measures what a visitor really downloads/decodes and what the admin really writes, at several catalogue sizes.
import zlib from "node:zlib";
import { normalizeJobRow } from "../public/js/normalize.js";
import { entryFromDoc, buildIndexDocs, decodePayload } from "../public/js/jobIndex.js";
import { filterEntries, recommend } from "../public/js/jobsFilter.js";

const D = ["Software", "Fresher-IT", "Finance", "Marketing", "Data Analyst", "Engineering", "Sales", "Human Resources", "Software-Java", "Operations"];
const C = ["Bengaluru", "Pune", "Mumbai", "Delhi", "Remote", "Hyderabad", "Chennai", "Noida", "Gurgaon", "Kolkata"];
const T = ["Software Engineer", "Data Analyst", "Frontend Developer", "Marketing Executive", "Associate Consultant", "Backend Developer Intern"];
const S = ["react, node, sql", "python, pandas, excel", "", "java, spring, aws", "seo, content, analytics"];
const EXP = ["Fresher", "0-1", "1-2", "2-4", "5+", "3 - 5 years", ""];

function docs(n) {
  const a = [];
  for (let i = 0; i < n; i++) {
    a.push(normalizeJobRow({
      jobId: "PL" + String(i).padStart(6, "0"), title: `${T[i % 6]} ${i % 11 ? "" : "II"}`.trim(), company: `Company ${i % Math.max(50, Math.floor(n / 8))}`,
      location: C[i % 10], exp: EXP[i % 7], dept: D[(i * 7) % 10], link: "https://careers.example.com/" + i, salary: i % 3 ? "" : "6 LPA",
      skill_set: S[i % 5], desc: "Responsibilities include building features. ".repeat(40),
    }, { createdAt: 1.7e12 - i }));
  }
  return a;
}
const kb = (n) => (n / 1024).toFixed(0).padStart(6);
const ms = (f) => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };

console.log("jobs    | index raw KB | gzip KB | chunk docs | admin docs | decode ms | filter ms | recommend ms | heap MB");
for (const n of [4000, 10000, 25000, 50000]) {
  const entries = docs(n).map(entryFromDoc);
  const { chunks, adminChunks, fullPayload } = buildIndexDocs(entries);
  const gz = zlib.gzipSync(fullPayload).length;
  if (global.gc) global.gc();
  const [decoded, dDecode] = ms(() => decodePayload(fullPayload));
  const [, dFilter] = ms(() => filterEntries(decoded, { search: "engineer react", dept: ["Software", "Finance"], location: ["Pune", "Mumbai"], exp: ["1"] }));
  const [, dRec] = ms(() => recommend(decoded, decoded[5]));
  const heap = process.memoryUsage().heapUsed / 1048576;
  console.log(
    `${String(n).padEnd(7)} | ${kb(fullPayload.length)}       | ${kb(gz)}  | ${String(chunks.length).padStart(6)}     | ${String(adminChunks.length).padStart(6)}     | ${dDecode.toFixed(0).padStart(7)}   | ${dFilter.toFixed(0).padStart(7)}   | ${dRec.toFixed(0).padStart(8)}     | ${heap.toFixed(0)}`
  );
}

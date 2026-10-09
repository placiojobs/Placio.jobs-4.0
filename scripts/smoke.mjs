// Post-deployment smoke test:   node scripts/smoke.mjs https://your-test-site.vercel.app
//   (or:  npm run smoke -- https://your-test-site.vercel.app)
// Checks the DEPLOYED site over HTTPS the way a visitor / attacker sees it. Read-only. Exit code 1 if anything fails.
import { FIREBASE_CONFIG } from "../public/js/site-config.js";
import { decodeChunks } from "../public/js/jobIndex.js";

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke.mjs https://your-site.example.com");
  process.exit(2);
}
const host = new URL(base).hostname.replace(/^www\./, "");
const isProdDomain = host === "placio.co.in";
const isLocal = host === "localhost" || host === "127.0.0.1"; // the local dev server has no Vercel host rules
let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
};
const get = (p, init) => fetch(base + p, { redirect: "manual", ...init });

console.log(`\nSmoke test: ${base}  (${isProdDomain ? "PRODUCTION domain" : "test domain: expects noindex"})\n`);

console.log("Pages");
for (const p of ["/", "/jobs", "/saved-jobs", "/about", "/contact", "/privacy", "/terms", "/cookies", "/admin/login", "/admin", "/admin/jobs", "/admin/excel", "/admin/config"]) {
  const r = await get(p);
  const t = r.status === 200 ? await r.text() : "";
  ok(r.status === 200 && t.includes("<title>"), `GET ${p}`, String(r.status));
}
{
  const r = await get("/jobs/1-some-old-or-new-slug");
  const t = await r.text();
  ok(r.status === 200 && t.includes('id="job-root"'), "GET /jobs/<slug> serves the job page (rewrite)", String(r.status));
  const a = await get("/admin/jobs/new"), b = await get("/admin/jobs/12345/edit");
  ok(a.status === 200 && (await a.text()).includes("admin-main"), "GET /admin/jobs/new (rewrite)");
  ok(b.status === 200 && (await b.text()).includes("admin-main"), "GET /admin/jobs/<id>/edit (rewrite)");
  const nf = await get("/definitely/not/a/page");
  ok(nf.status === 404 && (await nf.text()).includes("Page not found"), "Unknown URL gives the real 404 page", String(nf.status));
  const old = await get("/jobs.html");
  ok([301, 302, 307, 308].includes(old.status) || old.status === 200, "Legacy /jobs.html still works", String(old.status));
  for (const p of ["/robots.txt", "/sitemap.xml", "/favicon.png", "/googlee00f0b0130b67b23.html", "/js/theme-init.js", "/vendor/exceljs.min.js"]) {
    const r = await get(p);
    ok(r.status === 200, `GET ${p}`, String(r.status));
  }
  const f = await get("/assets/fonts/inter-normal.woff2");
  ok(f.status === 200 && /immutable/.test(f.headers.get("cache-control") || ""), "Fonts are self-hosted and cached", f.headers.get("cache-control") || "");
}

console.log("\nSecurity headers");
{
  const r = await get("/");
  const h = (k) => r.headers.get(k) || "";
  ok(/script-src 'self' https:\/\/www\.gstatic\.com;/.test(h("content-security-policy")) && !/unsafe-eval/.test(h("content-security-policy")), "Content-Security-Policy present, no unsafe-eval");
  ok(/frame-ancestors 'none'/.test(h("content-security-policy")) && /object-src 'none'/.test(h("content-security-policy")), "CSP forbids framing and plugins");
  ok(/nosniff/i.test(h("x-content-type-options")), "X-Content-Type-Options: nosniff");
  ok(/deny/i.test(h("x-frame-options")), "X-Frame-Options: DENY");
  ok(/strict-origin/.test(h("referrer-policy")), "Referrer-Policy", h("referrer-policy"));
  ok(/camera=\(\)/.test(h("permissions-policy")), "Permissions-Policy");
  ok(/max-age=\d{7,}/.test(h("strict-transport-security")) || !base.startsWith("https"), "HSTS");
  const robots = h("x-robots-tag");
  if (!isLocal) ok(isProdDomain ? !/noindex/.test(robots) : /noindex/.test(robots), isProdDomain ? "Production is indexable" : "Test domain is noindex (cannot be indexed by Google)", robots || "(none)");
  const adm = await get("/admin");
  ok(/noindex/.test(adm.headers.get("x-robots-tag") || "") && /no-store/.test(adm.headers.get("cache-control") || ""), "/admin: noindex + no-store");
  const html = await (await get("/jobs")).text();
  ok(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html.replace(/<script[^>]*type="application\/ld\+json"[\s\S]*?<\/script>/g, "")), "No inline scripts in HTML (CSP-safe)");
}

console.log("\nLive database (public, unauthenticated — real rules)");
{
  const B = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
  const K = `key=${FIREBASE_CONFIG.apiKey}`;
  const req = (p, init) => fetch(`${B}/${p}${p.includes("?") ? "&" : "?"}${K}`, init);
  const m = await req("meta/index");
  const meta = m.status === 200 ? await m.json() : null;
  const total = Number(meta?.fields?.total?.integerValue || 0);
  ok(m.status === 200 && total > 0, "meta/index readable and a job list is published", `${total} jobs, version ${meta?.fields?.version?.integerValue}`);
  if (meta) {
    const ids = (meta.fields.chunks.arrayValue.values || []).map((v) => v.mapValue.fields.id.stringValue);
    const docs = [];
    for (const id of ids) {
      const c = await req(`jobIndex/${id}`);
      if (c.status === 200) docs.push({ d: (await c.json()).fields.d.stringValue });
      else ok(false, `jobIndex/${id} readable`, String(c.status));
    }
    const entries = docs.length === ids.length ? decodeChunks(docs) : [];
    ok(entries.length === total, "Index chunks decode to exactly the published job count", `${entries.length}/${total}`);
    const sample = entries[Math.floor(entries.length / 2)];
    if (sample) {
      const j = await req(`jobs/${sample.jobId}`);
      ok(j.status === 200, "A single job document is readable by id", sample.jobId);
      const page = await get(`/jobs/${sample.slug}`);
      ok(page.status === 200, "Its public page URL works", `/jobs/${sample.slug}`);
    }
  }
  for (const [label, p, init] of [
    ["LIST jobs is refused", "jobs?pageSize=3", undefined],
    ["LIST jobIndex is refused", "jobIndex?pageSize=3", undefined],
    ["READ adminIndex is refused", "adminIndex/h0", undefined],
    ["LIST adminActivity is refused", "adminActivity?pageSize=3", undefined],
    ["LIST jobReports is refused", "jobReports?pageSize=3", undefined],
    ["WRITE a job is refused", "jobs/SMOKE_TEST", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { title: { stringValue: "x" } } }) }],
    ["WRITE meta is refused", "meta/index", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { total: { integerValue: "0" } } }) }],
  ]) {
    const r = await req(p, init);
    ok(r.status === 403, label, String(r.status));
  }
}

console.log(`\n${fail ? "FAILED" : "ALL GOOD"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

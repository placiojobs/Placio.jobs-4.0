// Generates the static department pages from site-config.js:  node scripts/build-departments.mjs
//   public/departments.html            the hub
//   public/departments/<slug>.html     one page per DEPARTMENT_PAGES entry
// Static HTML = real <title>, <h1> and crawlable specialisation links for search engines; the live counts are filled in by js/pages/departments.js.
// Re-run this after editing DEPARTMENT_PAGES in site-config.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { DEPARTMENT_PAGES, DEPARTMENT_MORE, DEPARTMENT_GROUPS } = await import(pathToFileURL(path.join(root, "public/js/site-config.js")).href);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const label = (d) => d.replace(/^SAP-/, "SAP ").replace(/^(Software|Fresher|Engineer|Engineering|Finance|Sales|Marketing)-/, "");
const SITE = "https://placio.co.in";

const head = (title, desc, url) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="Placio">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/logo-full.png">
<link rel="icon" href="/favicon.png">
<link rel="preload" href="/assets/fonts/inter-normal.woff2" as="font" type="font/woff2" crossorigin>
<script src="/js/theme-init.js"></script>
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/responsive.css">
</head>`;
const foot = `<div id="site-footer"></div>
<script type="module" src="/js/layout.js"></script>
<script type="module" src="/js/pages/departments.js"></script>
</body>
</html>
`;
const jobsHref = (d) => `/jobs?dept=${encodeURIComponent(d)}`;

fs.mkdirSync(path.join(root, "public/departments"), { recursive: true });

// hub
{
  const title = "Jobs by Department in India | Placio";
  const desc = "Browse jobs by department — software, data, engineering, finance, sales and fresher roles — with live counts by city on Placio.";
  const links = DEPARTMENT_PAGES.map((p) => `<li><a href="/departments/${p.slug}">${esc(p.title)} jobs</a> — ${esc(p.blurb)}</li>`).join("");
  fs.writeFileSync(path.join(root, "public/departments.html"), `${head(title, desc, `${SITE}/departments`)}
<body>
<div id="site-nav"></div>
<main id="main"><div class="container">
  <div class="page-hero"><div class="eyebrow">Departments</div><h1>Jobs by <em>department.</em></h1><p>Pick a field to see every specialisation and the cities hiring right now, with live job counts.</p></div>
  <div class="info-cards two" id="hub-cards" style="max-width:56rem"><noscript><ul>${links}</ul></noscript></div>
  <section class="section" id="hub-more" hidden><h2 class="h-section">More areas</h2><div class="pill-row" id="hub-more-list"></div></section>
</div></main>
${foot}`);
}

// The 14-pill strip in every department hero: the 8 full pages link to their page, the 6 smaller groups link to the job list filtered to that group.
const STRIP = [
  ["software-it", "Software & IT"], ["freshers", "Freshers"], ["data-analytics", "Data"], ["engineering", "Engineering"],
  ["finance-accounting", "Finance"], ["sales-marketing", "Sales & Marketing"], ["management-strategy", "Management"], ["supply-chain-procurement", "Supply Chain"],
  ["Customer Service", "Customer Service"], ["Legal, Corporate & Admin", "Legal & Admin"], ["Human Resources", "Human Resources"],
  ["Pharma & Life Sciences", "Pharma"], ["Risk & Compliance", "Risk & Compliance"], ["Banking & Fund Operations", "Banking"],
];
const stripHref = (key) => {
  if (DEPARTMENT_PAGES.some((p) => p.slug === key)) return `/departments/${key}`;
  const g = DEPARTMENT_MORE.find((m) => m.title === key);
  if (!g) throw new Error("strip: unknown department " + key);
  return `/jobs?dept=${encodeURIComponent(g.depts.join(","))}`;
};
const stripHtml = (slug) => `<div class="dept-strip" role="navigation" aria-label="All departments"><button type="button" class="dept-strip__arrow dept-strip__arrow--l" aria-label="Scroll departments left" hidden>‹</button><div class="dept-strip__track">${STRIP.map(([k, t]) => `<a class="pill${k === slug ? " is-active" : ""}" href="${esc(stripHref(k))}"${k === slug ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("")}</div><button type="button" class="dept-strip__arrow dept-strip__arrow--r" aria-label="Scroll departments right" hidden>›</button></div>`;

// one page per department
for (const p of DEPARTMENT_PAGES) {
  const title = `${p.title} Jobs in India — by Specialisation and City | Placio`;
  const desc = `${p.blurb} See live ${p.title} job counts by specialisation and city on Placio.`;
  const subs = p.depts.map((d) => `<a class="pill" href="${esc(jobsHref(d))}">${esc(label(d))}</a>`).join("");
  // Long departments (Software & IT) group their specialisations into labelled sections; the rest stay one flat list.
  const chip = (d) => `<a class="pill" data-d="${esc(d)}" href="${esc(jobsHref(d))}">${esc(label(d))}</a>`;
  const groupDefs = DEPARTMENT_GROUPS?.[p.slug];
  let specHtml = `<div class="pill-row">${subs}</div>`;
  if (groupDefs) {
    const used = new Set(groupDefs.flatMap((g) => g.depts));
    const rest = p.depts.filter((d) => !used.has(d));
    const all = [...groupDefs.map((g) => ({ title: g.title, depts: g.depts.filter((d) => p.depts.includes(d)) })), ...(rest.length ? [{ title: "Other roles", depts: rest }] : [])].filter((g) => g.depts.length);
    specHtml = `<div class="dept-groups" id="dept-groups">${all.map((g) => `<div class="dept-group"><div class="dept-group__head"><h3>${esc(g.title)}</h3><span class="dept-group__n">${g.depts.length} specialisation${g.depts.length === 1 ? "" : "s"}</span></div><div class="pill-row">${g.depts.map(chip).join("")}</div></div>`).join("")}</div>`;
  }
  const others = DEPARTMENT_PAGES.filter((o) => o.slug !== p.slug).map((o) => `<a class="pill" href="/departments/${o.slug}">${esc(o.title)}</a>`).join("");
  fs.writeFileSync(path.join(root, `public/departments/${p.slug}.html`), `${head(title, desc, `${SITE}/departments/${p.slug}`)}
<body data-dept="${p.slug}" data-home>
<div id="site-nav"></div>
<main id="main"><div class="container">
  <div class="page-hero page-hero--compact"><div class="eyebrow">Department</div><h1>${esc(p.title)} jobs in <em>India.</em></h1><p>${esc(p.blurb)}</p>
    <div class="dept-cta"><a class="btn btn--primary" id="dept-cta" href="/jobs">See all ${esc(p.title)} jobs</a><a class="btn btn--outline" id="dept-share" href="#" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>
    <div class="dept-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="dept-q" type="search" placeholder="Search by skill, role, or city..." autocomplete="off" aria-label="Search specialisations and cities"></div>
    ${stripHtml(p.slug)}</div>
  <section class="section"><h2 class="h-section">${esc(p.title)} jobs by specialisation and city</h2>
    <div class="dept-status" id="dept-status" hidden></div>
    <p class="muted" id="dept-summary" style="font-size:.9rem;margin-top:.25rem">Loading the latest numbers…</p>
    <div id="dept-state"></div>
    <div class="dept-cards" id="dept-cards"></div>
    <div class="matrix-wrap dept-only-wide reveal" id="dept-table-wrap" style="margin-top:1.1rem" hidden><table class="matrix" id="dept-table"></table></div>
    <p class="muted" id="dept-more" style="font-size:.85rem;margin-top:.6rem" hidden>Showing the biggest specialisations. Browse the full list below.</p>
    <noscript><p class="muted">Placio needs JavaScript to show live job counts. You can still <a href="/jobs">browse all jobs</a>.</p></noscript>
  </section>
  <section class="section"><h2 class="h-section" id="dept-all-h">All ${esc(p.title)} specialisations</h2>${specHtml}</section>
  <section class="section"><h2 class="h-section">Explore other departments</h2><div class="pill-row">${others}</div></section>
</div></main>
${foot}`);
}
console.log(`wrote hub + ${DEPARTMENT_PAGES.length} department pages`);

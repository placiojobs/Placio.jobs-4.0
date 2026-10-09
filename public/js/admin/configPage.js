/**
 * Configuration overview. The site's lists (departments, cities, job types, experience chips…) live in ONE file,
 * public/js/site-config.js — deliberately not in the database, so visitors never pay a read for them.
 * This page shows what is configured, how much each value is used, what's in use but NOT configured,
 * and generates a ready-to-paste block for new departments / cities.
 */
import { requireAdmin } from "./guard.js";
import { loadMeta } from "../indexLoader.js";
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS, JOB_TYPES, EXPERIENCE_TOKENS, QUICK_ACCESS, NAV_LINKS, SORT_OPTIONS, PAGE_SIZE, FEATURES, ANALYTICS, DEPT_CITY_MATRIX, REPORT_REASONS } from "../site-config.js";
import { $, esc, errorInfo, toast } from "../utils.js";

const main = $("#admin-main");
await requireAdmin();

main.innerHTML = `<div class="admin-head"><div><h1>Configuration</h1><p class="lead">Everything below comes from <code>public/js/site-config.js</code> — edit that one file, then redeploy. Colours and fonts are in the <code>:root</code> block at the top of <code>public/css/style.css</code>.</p></div></div>
  <div id="usage"><div class="skeleton" style="height:120px"></div></div>
  <div class="grid-2" style="margin-top:1rem">
    <div class="panel"><h2>Settings in effect</h2>
      <div class="kv"><span>Jobs per “Load more” step</span><span>${PAGE_SIZE}</span></div>
      <div class="kv"><span>Job list delivered via Storage file</span><span>${FEATURES.indexInStorage ? "yes (Blaze plan)" : "no — database documents (free Spark plan)"}</span></div>
      <div class="kv"><span>Analytics</span><span>${ANALYTICS.gaId ? "Google Analytics (consent required)" : "none"}</span></div>
      <div class="kv"><span>Department × City matrix</span><span>top ${DEPT_CITY_MATRIX.maxDepartments} × ${DEPT_CITY_MATRIX.maxCities}</span></div>
      <div class="kv"><span>Job types</span><span>${JOB_TYPES.map(esc).join(", ")}</span></div>
      <div class="kv"><span>Sort options</span><span>${SORT_OPTIONS.map((s) => esc(s.label)).join(", ")}</span></div>
      <div class="kv"><span>Menu items</span><span>${NAV_LINKS.map((l) => esc(l.label)).join(", ")}</span></div>
      <div class="kv"><span>Report reasons</span><span>${REPORT_REASONS.length}</span></div>
      <div class="kv"><span>Experience chips</span><span>Fresher, 1 … ${EXPERIENCE_TOKENS.length - 1}</span></div>
      <div class="kv"><span>Homepage quick shortcuts</span><span>${QUICK_ACCESS.length}</span></div></div>
    <div class="panel"><h2>Add a department or city</h2>
      <p class="muted" style="font-size:.85rem">Type new names (one per line), choose where they go, and copy the generated lines into <code>site-config.js</code>.</p>
      <div class="field" style="margin-top:.8rem"><label class="field__label" for="kind">List</label><select class="select" id="kind"><option value="dept">Departments (MAJOR_DEPARTMENTS)</option><option value="loc">Cities (MAJOR_LOCATIONS)</option></select></div>
      <div class="field" style="margin-top:.8rem"><label class="field__label" for="names">New names</label><textarea class="textarea" id="names" rows="4" placeholder="Software-Rust&#10;Legal-Compliance"></textarea></div>
      <div class="code-block" id="snippet" style="margin-top:.8rem">// your new lines will appear here</div>
      <div class="row" style="margin-top:.6rem"><button class="btn btn--outline btn--sm" id="copy" type="button">Copy</button></div></div>
  </div>
  <div class="grid-2" style="margin-top:1rem">
    <div class="panel"><h2>Configured departments <span class="badge">${MAJOR_DEPARTMENTS.length}</span></h2><div id="dept-list" style="max-height:20rem;overflow:auto"></div></div>
    <div class="panel"><h2>Configured cities <span class="badge">${MAJOR_LOCATIONS.length}</span></h2><div id="loc-list" style="max-height:20rem;overflow:auto"></div></div>
  </div>`;

const row = (name, n) => `<div class="kv"><span>${esc(name)}</span><span>${n === undefined ? "" : n ? `${n} job${n > 1 ? "s" : ""}` : '<span class="faint">unused</span>'}</span></div>`;

let meta = null;
try { meta = await loadMeta({ fresh: true }); } catch (e) { $("#usage").innerHTML = `<div class="state state--error"><div class="state__title">Couldn’t load usage</div><p class="state__text">${esc(errorInfo(e).message)}</p></div>`; }

const dcount = new Map((meta?.depts?.names || []).map((n, i) => [n.toLowerCase(), meta.depts.counts[i]]));
const lcount = new Map((meta?.locs?.names || []).map((n, i) => [n.toLowerCase(), meta.locs.counts[i]]));
$("#dept-list").innerHTML = MAJOR_DEPARTMENTS.map((d) => row(d, meta ? dcount.get(d.toLowerCase()) || 0 : undefined)).join("");
$("#loc-list").innerHTML = MAJOR_LOCATIONS.map((d) => row(d, meta ? lcount.get(d.toLowerCase()) || 0 : undefined)).join("");

if (meta) {
  const kd = new Set(MAJOR_DEPARTMENTS.map((d) => d.toLowerCase())), kl = new Set(MAJOR_LOCATIONS.map((d) => d.toLowerCase()));
  const strayD = meta.depts.names.filter((d) => !kd.has(d.toLowerCase())), strayL = meta.locs.names.filter((d) => !kl.has(d.toLowerCase()));
  $("#usage").innerHTML = strayD.length || strayL.length
    ? `<div class="banner banner--warn"><b>In use by jobs but not configured:</b><br>${strayD.length ? `Departments: ${strayD.map((d) => `<code>${esc(d)}</code> (${dcount.get(d.toLowerCase())})`).join(", ")}<br>` : ""}${strayL.length ? `Cities: ${strayL.map((d) => `<code>${esc(d)}</code> (${lcount.get(d.toLowerCase())})`).join(", ")}` : ""}<br><span class="faint">They still show up in filters, but a typo here splits a department in two. Fix the spelling in Excel, or add the name to the list below.</span></div>`
    : `<div class="banner banner--ok">Every department and city used by live jobs is in the configured lists.</div>`;
}

const update = () => {
  const names = $("#names").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const which = $("#kind").value === "dept" ? "MAJOR_DEPARTMENTS" : "MAJOR_LOCATIONS";
  $("#snippet").textContent = names.length ? `// add inside ${which} in public/js/site-config.js\n${names.map((n) => `  ${JSON.stringify(n)},`).join("\n")}` : "// your new lines will appear here";
};
$("#names").addEventListener("input", update);
$("#kind").addEventListener("change", update);
$("#copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#snippet").textContent); toast("Copied"); } catch { toast("Select the text and copy it manually"); } });

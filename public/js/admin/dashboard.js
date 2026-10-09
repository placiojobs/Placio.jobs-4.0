/** Admin dashboard. Reads: meta (1) + recent activity (<= 25). Everything else is local. */
import { requireAdmin, withBusy } from "./guard.js";
import { loadMeta, loadIndex } from "../indexLoader.js";
import { recentActivity, rebuildIndexFromDatabase } from "./adminData.js";
import { downloadBlob } from "./excelIO.js";
import { runSetupCheck } from "./setupCheck.js";
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS, SITE, FEATURES } from "../site-config.js";
import { $, esc, formatDateTime, errorInfo, toast } from "../utils.js";

const main = $("#admin-main");
const ACTION = {
  add_job: "Added a job", edit_job: "Edited a job", deactivate_jobs: "Deactivated jobs", activate_jobs: "Reactivated jobs",
  excel_import: "Excel import", rebuild_index: "Rebuilt the job index",
};

const bars = (names, counts, n = 8) => {
  const max = Math.max(1, ...counts.slice(0, n));
  return names.slice(0, n).map((name, i) => `<div style="margin-bottom:.6rem"><div class="kv" style="border:0;padding:0"><span>${esc(name)}</span><span>${counts[i]}</span></div><div class="bar"><i style="width:${Math.round((counts[i] / max) * 100)}%"></i></div></div>`).join("") || '<p class="muted">No data yet.</p>';
};

function sitemapXml(entries) {
  const urls = ["/", "/jobs", "/about", "/contact", "/privacy", "/terms", "/cookies"].map((p) => `<url><loc>${SITE.url}${p}</loc></url>`);
  const jobs = entries.map((e) => `<url><loc>${SITE.url}/jobs/${esc(e.slug)}</loc><changefreq>weekly</changefreq></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls, ...jobs].join("\n")}\n</urlset>\n`;
}

const { email } = await requireAdmin();

main.innerHTML = `<div class="admin-head"><div><h1>Dashboard</h1><p class="lead">Overview of what visitors see right now.</p></div>
  <div class="row"><a class="btn btn--primary btn--sm" href="/admin/jobs/new">+ Add job</a><a class="btn btn--outline btn--sm" href="/admin/excel">Excel import</a></div></div>
  <div id="stats" class="stat-cards stat-cards--4"><div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:84px"></div></div>
  <div id="health" style="margin-top:1rem;display:grid;gap:.6rem"></div>
  <div class="panel" id="setup-panel" style="margin-top:1rem"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Setup check</h2><button class="btn btn--outline btn--sm" id="run-check" type="button">Run setup check</button></div><div id="setup" style="margin-top:.7rem"><p class="muted" style="font-size:.85rem">Jobs not showing on the website? Run this — it tests the rules, the admin permission and the published job list, and tells you what to fix.</p></div></div>
  <div class="grid-2" style="margin-top:1.25rem"><div class="panel"><h2>Jobs by department</h2><div id="depts"></div></div><div class="panel"><h2>Jobs by city</h2><div id="locs"></div></div></div>
  <div class="panel" style="margin-top:1rem"><h2>Tools</h2><div class="row">
    <button class="btn btn--outline btn--sm" id="sitemap" type="button">Download sitemap.xml</button>
    <button class="btn btn--outline btn--sm" id="rebuild" type="button">Rebuild job index</button></div>
    <p class="faint" style="font-size:.78rem;margin-top:.7rem">Rebuild re-reads every active job once (one read each) and republishes the public list — use it after editing jobs directly in the Firebase console, or the very first time on an existing database. The sitemap: upload it to the <code>public/</code> folder and redeploy so Google can find every job page.</p>
    <p id="tool-msg" class="banner" hidden style="margin-top:.8rem"></p></div>
  <div class="panel" style="margin-top:1rem"><h2>Import history &amp; recent activity</h2><div id="activity"><div class="skeleton" style="height:120px"></div></div></div>`;

let meta = null;
let loadFailed = false;
try {
  meta = await loadMeta({ fresh: true });
} catch (e) {
  loadFailed = true;
  $("#stats").innerHTML = `<div class="state state--error" style="grid-column:1/-1"><div class="state__title">Couldn’t load the dashboard</div><p class="state__text">${esc(errorInfo(e).message)}</p></div>`;
}

if (meta !== null || $("#stats").querySelector(".skeleton")) {
  const total = meta?.total || 0;
  const dn = meta?.depts?.names || [], dc = meta?.depts?.counts || [], ln = meta?.locs?.names || [], lc = meta?.locs?.counts || [];
  const via = meta?.storage ? "Storage file (cheapest)" : meta ? (FEATURES.indexInStorage ? "Database chunks (fallback)" : "Database documents (free-plan mode)") : "—";
  $("#stats").innerHTML = [
    ["Active jobs", total, ""], ["Departments in use", dn.length, ""], ["Cities in use", ln.length, ""],
    ["Last published", meta ? formatDateTime(meta.updatedAt) : "never", `stat--sm`],
  ].map(([l, n, c]) => `<div class="stat ${c}"><div class="stat__n" ${c ? 'style="font-size:1.05rem;line-height:1.7"' : ""}>${esc(n)}</div><div class="stat__l">${l}</div></div>`).join("");

  const health = [];
  if (!meta) health.push(`<div class="banner banner--warn">Nothing is published yet. Add a job or import an Excel file — or, if jobs already exist in the database, press <b>Rebuild job index</b>.</div>`);
  if (meta && !meta.storage && FEATURES.indexInStorage) health.push(`<div class="banner banner--warn">Visitors are loading the job list from database documents (fallback). Enable Firebase Storage and deploy <code>storage.rules</code>, then publish again, to cut bandwidth and reads.</div>`);
  const knownD = new Set(MAJOR_DEPARTMENTS.map((d) => d.toLowerCase())), knownL = new Set(MAJOR_LOCATIONS.map((d) => d.toLowerCase()));
  const strayD = dn.filter((d) => !knownD.has(d.toLowerCase())), strayL = ln.filter((d) => !knownL.has(d.toLowerCase()));
  if (strayD.length || strayL.length) health.push(`<div class="banner banner--warn">${strayD.length} department(s) and ${strayL.length} city/cities are used by jobs but aren’t in <code>site-config.js</code>. They still work in filters, but check for typos — <a class="link-accent" href="/admin/config">see Configuration</a>.</div>`);
  if (meta) health.push(`<div class="banner banner--ok">Published version ${meta.version} · delivered via: ${esc(via)}${meta.storage ? ` · ${meta.storage.bytes >= 10240 ? (meta.storage.bytes / 1024).toFixed(0) : (meta.storage.bytes / 1024).toFixed(1)} KB download` : ""}</div>`);
  $("#health").innerHTML = health.join("");
  $("#depts").innerHTML = bars(dn, dc);
  $("#locs").innerHTML = bars(ln, lc);
}

try {
  const acts = await recentActivity(25);
  $("#activity").innerHTML = acts.length
    ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Action</th><th>Details</th><th>By</th></tr></thead><tbody>${acts.map((a) => {
        const d = a.detail || {};
        const det = a.action === "excel_import" ? `${esc(d.fileName || "")} · ${d.added ?? 0} added, ${d.updated ?? 0} updated, ${d.unchanged ?? 0} unchanged, ${d.removed ?? 0} removed (${esc(d.mode || "")})` : d.title ? esc(d.title) : d.count !== undefined ? `${d.count} job(s)` : esc(d.jobId || "");
        return `<tr><td class="mono" style="white-space:nowrap">${esc(formatDateTime(a.at))}</td><td>${esc(ACTION[a.action] || a.action)}</td><td class="wrap">${det}</td><td class="mono">${esc(a.actorEmail || "")}</td></tr>`;
      }).join("")}</tbody></table></div>`
    : '<p class="muted">No activity yet.</p>';
} catch (e) {
  $("#activity").innerHTML = `<p class="field__error">${esc(errorInfo(e).message)}</p>`;
}

const msg = (text, kind = "ok") => { const el = $("#tool-msg"); el.hidden = false; el.className = `banner banner--${kind}`; el.textContent = text; };
$("#sitemap").addEventListener("click", (ev) => withBusy(ev.currentTarget, async () => {
  try {
    const { entries } = await loadIndex({ fresh: true });
    downloadBlob(new Blob([sitemapXml(entries)], { type: "application/xml" }), "sitemap.xml");
    msg(`Sitemap with ${entries.length + 7} URLs downloaded. Put it in the public/ folder and redeploy.`);
  } catch (e) { msg(errorInfo(e).message, "error"); }
}));
$("#rebuild").addEventListener("click", (ev) => withBusy(ev.currentTarget, async () => {
  if (!confirm("Rebuild the public job index from the database?\n\nThis reads every active job once (that many Firestore reads) and republishes the list. It is safe to run.")) return;
  try {
    const r = await rebuildIndexFromDatabase({ actorEmail: email, onProgress: (t) => msg(t, "warn") });
    msg(`Done — ${r.count} jobs published.${r.warning ? " " + r.warning : ""}`, r.warning ? "warn" : "ok");
    toast("Index rebuilt");
  } catch (e) { msg(errorInfo(e).message, "error"); }
}));

// Setup check: runs by itself when something looks wrong (nothing published, or the index could not be read)
const ICON = { ok: "✓", warn: "!", fail: "✗" };
async function setupCheck(ev) {
  const btn = $("#run-check");
  btn.classList.add("is-loading"); btn.disabled = true;
  try {
    const res = await runSetupCheck();
    $("#setup").innerHTML = res.map((r) => `<div class="banner banner--${r.level === "ok" ? "ok" : r.level === "warn" ? "warn" : "error"}" style="margin-bottom:.5rem"><b>${ICON[r.level]} ${esc(r.title)}</b>${r.detail ? `<div style="margin-top:.2rem;font-size:.82rem;opacity:.95">${esc(r.detail)}</div>` : ""}</div>`).join("");
  } catch (e) {
    $("#setup").innerHTML = `<div class="banner banner--error">${esc(errorInfo(e).message)}</div>`;
  } finally {
    btn.classList.remove("is-loading"); btn.disabled = false;
  }
}
$("#run-check").addEventListener("click", setupCheck);
if (loadFailed || !meta || !meta.total) setupCheck();

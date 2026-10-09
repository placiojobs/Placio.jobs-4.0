/**
 * Job detail page  (/jobs/<slug>).
 * Reads exactly ONE Firestore document (jobs/{jobId}). Recommendations come from the
 * local job index and load only when scrolled into view — a failure there never affects the page.
 */
import { REPORT_REASONS, SITE } from "../site-config.js";
import { parseJobIdFromSlug } from "../slug.js";
import { loadJob, loadIndex } from "../indexLoader.js";
import { entryFromDoc } from "../jobIndex.js";
import { recommend } from "../jobsFilter.js";
import { applyJobSeo, applyNoIndex, jobCanonicalUrl } from "../seo.js";
import { avatarHtml, saveButtonHtml, shareButtonHtml, stateHtml } from "../ui.js";
import { icons } from "../icons.js";
import { esc, errorInfo, safeHttpUrl, $, toast, lockScroll } from "../utils.js";
import { blankIfPlaceholder as clean } from "../normalize.js";
import { cleanExperienceText } from "../experience.js";
import { recordViewed } from "../store.js";
import { track } from "../analytics.js";
import { setDocData } from "../firebase.js";

const root = $("#job-root");

function slugFromLocation() {
  const m = location.pathname.match(/^\/jobs\/([^/]+)/);
  return decodeURIComponent(m ? m[1] : new URLSearchParams(location.search).get("slug") || "");
}

const notFoundHtml = (title, text) => `<div class="container section">${stateHtml({ title, text, actions: `<a class="btn btn--primary btn--sm" href="/jobs">Explore other jobs</a><a class="btn btn--outline btn--sm" href="/">Go home</a>` })}</div>`;

function applyButton(link, cls = "") {
  const url = safeHttpUrl(link);
  if (!url) return `<button class="btn btn--primary ${cls}" type="button" disabled title="No application link is available for this job.">Application link unavailable</button>`;
  return `<a class="btn btn--primary ${cls}" data-apply href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">Apply Now ${icons.external.replace("<svg", '<svg style="width:16px;height:16px"')}</a>`;
}

function render(raw) {
  // old documents may contain "—" / "N/A" placeholders: treat them as blank
  const job = { ...raw, salary: clean(raw.salary), type: clean(raw.type), exp: cleanExperienceText(clean(raw.exp)), location: clean(raw.location), dept: clean(raw.dept), skillSet: clean(raw.skillSet), desc: raw.desc ? String(raw.desc).trim() : "" };
  const skills = job.skillSet ? job.skillSet.split(/[,;/]/).map((s) => s.trim()).filter(Boolean) : [];
  const meta = [
    job.location && `<span>${icons.pin}${esc(job.location)}</span>`,
    job.exp && `<span>${icons.compass}${esc(job.exp)} experience</span>`,
    job.type && `<span>${icons.building}${esc(job.type)}</span>`,
    job.salary && `<span class="salary">${icons.rupee}${esc(job.salary)}</span>`,
  ].filter(Boolean).join("");
  const hasLink = Boolean(safeHttpUrl(job.link));
  root.innerHTML = `<div class="job-layout">
    <article>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/jobs">Browse Jobs</a> / <span>${esc(job.title)}</span></nav>
      <div class="job-head">
        <div><h1 class="job-title">${esc(job.title)}</h1><div class="job-company">${esc(job.company)}</div></div>
        <div class="job-actions">${saveButtonHtml(job.jobId)}${shareButtonHtml(job)}</div>
      </div>
      ${meta ? `<div class="job-meta">${meta}</div>` : ""}
      ${job.dept ? `<div class="job-dept">${esc(job.dept)}</div>` : ""}
      <div class="job-apply">${applyButton(job.link)}${hasLink ? `<p class="leaving-note">Opens the employer’s own website in a new tab. ${esc(SITE.name)} doesn’t handle your application.</p>` : ""}</div>
      ${job.desc ? `<section class="job-section"><h2>Job Description</h2><p class="job-desc preserve-linebreaks">${esc(job.desc)}</p></section>` : ""}
      ${skills.length ? `<section class="job-section"><h2>Skills</h2><div class="tags">${skills.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div></section>` : ""}
      <p class="disclaimer">Disclaimer: This job posting has been aggregated from an external source. Role details, content, and availability are subject to change. ${esc(SITE.name)} is not the employer and does not guarantee hiring, interviews or the accuracy of the listing. Please confirm the latest information on the company’s website before applying, and never pay money to apply for a job.</p>
      <p style="margin-top:.8rem"><button type="button" class="link-quiet" id="report-open">Report this job</button></p>
      <div id="recs" aria-live="polite"></div>
    </article>
    <aside style="display:grid;gap:1.25rem;align-content:start">
      <div class="side-card"><div class="eyebrow">Company</div><div class="company-mini">${avatarHtml(job.company, "lg")}<div><b>${esc(job.company)}</b>${job.location ? `<div class="muted" style="font-size:.85rem">Hiring in ${esc(job.location)}</div>` : ""}</div></div></div>
      <div class="side-card side-card--soft"><div class="eyebrow">Before applying</div><ul class="checklist"><li>Review role requirements</li><li>Check eligibility</li><li>Prepare your resume</li><li>Verify the application link</li><li>Submit your application</li></ul></div>
    </aside>
  </div>
  <div class="sticky-apply"><div class="sticky-apply__in"><div class="sticky-apply__t">${esc(job.title)} · ${esc(job.company)}</div>${applyButton(job.link, "btn--sm")}</div></div>`;
  root.addEventListener("click", (e) => { if (e.target.closest("[data-apply]")) track("apply_click"); });
  $("#report-open").addEventListener("click", () => openReport(job.jobId));
}

// ── recommendations: local, lazy, optional ──
function recCards(list) {
  return list.map((j) => `<a class="rec-card" href="/jobs/${esc(j.slug)}"><b>${esc(j.title)}</b><span>${esc(j.company)}</span><small>${esc([j.location, j.exp].filter(Boolean).join(" · "))}</small></a>`).join("");
}
function lazyRecommendations(job) {
  const el = $("#recs");
  if (!el) return;
  const run = async () => {
    try {
      const { entries } = await loadIndex();
      const cur = entryFromDoc(job);
      const like = recommend(entries, cur, { limit: 6 });
      const more = recommend(entries, cur, { limit: 4, sameCompanyOnly: true });
      el.innerHTML =
        (like.length ? `<section class="job-section"><h2>Jobs Like This</h2><div class="rec-grid">${recCards(like)}</div></section>` : "") +
        (more.length ? `<section class="job-section"><h2>More from ${esc(job.company)}</h2><div class="rec-grid">${recCards(more)}</div></section>` : "");
    } catch {
      /* recommendations are a bonus: never show an error for them */
    }
  };
  if (!("IntersectionObserver" in window)) return run();
  const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); run(); } }, { rootMargin: "400px" });
  io.observe(el);
}

// ── report a job (write-only collection; rules validate the shape) ──
function openReport(jobId) {
  const opener = document.activeElement;
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="rep-t">
    <h2 class="modal__title" id="rep-t">Report job</h2>
    <label class="field"><span class="field__label">What’s wrong?</span><select class="select" id="rep-reason">${REPORT_REASONS.map((r, i) => `<option value="${i}">${esc(r)}</option>`).join("")}</select></label>
    <p class="field__error" id="rep-err" role="alert" hidden></p>
    <div class="row" style="margin-top:1rem"><button class="btn btn--primary" id="rep-send" type="button" style="flex:1">Submit</button><button class="btn btn--outline" id="rep-cancel" type="button" style="flex:1">Cancel</button></div></div>`;
  document.body.appendChild(m);
  lockScroll(true);
  const close = () => { m.remove(); lockScroll(false); document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  m.addEventListener("mousedown", (e) => { if (e.target === m) close(); });
  $("#rep-cancel", m).addEventListener("click", close);
  $("#rep-reason", m).focus();
  $("#rep-send", m).addEventListener("click", async () => {
    const err = $("#rep-err", m);
    err.hidden = true;
    // light client-side throttle (the real guard is the one-report-per-job/reason/day document id in firestore.rules)
    const key = "placio.reportsSent";
    let sent = [];
    try { sent = JSON.parse(localStorage.getItem(key) || "[]").filter((t) => Date.now() - t < 3600e3); } catch { /* ignore */ }
    if (sent.length >= 5) { err.textContent = "Too many reports from this device recently. Please try again later."; err.hidden = false; return; }
    const idx = Number($("#rep-reason", m).value);
    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    try {
      await setDocData("jobReports", `${jobId}__${day}__${idx}`, { jobId, reason: REPORT_REASONS[idx], at: Date.now() });
    } catch (e) {
      // permission-denied here means "this exact report already exists today" — fine for the reporter
      if (e?.code !== "permission-denied") { err.textContent = errorInfo(e).message; err.hidden = false; return; }
    }
    try { localStorage.setItem(key, JSON.stringify([...sent, Date.now()])); } catch { /* ignore */ }
    close();
    toast("Thanks — we’ll take a look at this listing.");
  });
}

async function init() {
  const slug = slugFromLocation();
  const jobId = parseJobIdFromSlug(slug);
  if (!/^[A-Za-z0-9_]{1,64}$/.test(jobId)) {
    applyNoIndex("Job not found");
    root.innerHTML = notFoundHtml("We couldn’t find that job.", "The link may be incorrect or the job may have been removed.");
    return;
  }
  let job;
  try {
    job = await loadJob(jobId);
  } catch (e) {
    const info = errorInfo(e);
    root.innerHTML = `<div class="container section">${stateHtml({ kind: "error", title: "Couldn’t load this job", text: info.message, actions: `<button class="btn btn--primary btn--sm" id="retry" type="button">Try again</button><a class="btn btn--outline btn--sm" href="/jobs">Browse jobs</a>` })}</div>`;
    $("#retry").addEventListener("click", init);
    return;
  }
  if (!job) {
    applyNoIndex("Job not found");
    root.innerHTML = notFoundHtml("We couldn’t find that job.", "The link may be incorrect or the job may have been removed.");
    return;
  }
  if (job.status !== "active") {
    applyNoIndex("Job no longer available");
    root.innerHTML = notFoundHtml("This job is no longer available.", "It may have been filled or removed by the employer. Explore other opportunities on Placio instead.");
    return;
  }
  // old/stale slug (title changed since the link was shared): same job, canonical URL is the current slug
  if (job.slug && slug !== job.slug && location.pathname.startsWith("/jobs/")) history.replaceState(null, "", `/jobs/${job.slug}`);
  applyJobSeo(job);
  render(job);
  recordViewed({ jobId: job.jobId, slug: job.slug, title: job.title, company: job.company });
  track("view_job");
  lazyRecommendations(job);
}
init();
void jobCanonicalUrl;

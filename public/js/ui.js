/**
 * Reusable renderers: job card, avatar, empty / error states, skeletons,
 * plus the one delegated click handler for Save / Share buttons.
 * Every dynamic value passes through esc() — never concatenate raw data into HTML.
 */
import { icons } from "./icons.js";
import { esc, shareLink, toast, siteOrigin } from "./utils.js";
import { isSaved, toggleSaved } from "./store.js";
import { SITE } from "./site-config.js";
import { track } from "./analytics.js";

const TINTS = 5;
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initial-letter badge standing in for a company logo (the dataset has no logo images). */
export function avatarHtml(name, size = "") {
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  return `<div class="avatar t${hash(String(name)) % TINTS} ${size ? "avatar--" + size : ""}" aria-hidden="true">${esc(initial)}</div>`;
}

export const jobUrl = (slug) => `/jobs/${slug}`;
export const jobShareUrl = (slug) => `${siteOrigin(SITE.url)}/jobs/${slug}`;

export function saveButtonHtml(jobId) {
  const on = isSaved(jobId);
  return `<button type="button" class="act-btn" data-save="${esc(jobId)}" aria-pressed="${on}" aria-label="${on ? "Remove from saved jobs" : "Save job"}" title="${on ? "Saved" : "Save"}">${icons.star}</button>`;
}
export function shareButtonHtml(job) {
  return `<button type="button" class="act-btn" data-share="${esc(job.slug)}" data-title="${esc(job.title)}" data-company="${esc(job.company)}" aria-label="Share job" title="Share">${icons.share}</button>`;
}

/**
 * Hierarchy: Title → Company → Location → Experience → Type → Salary → Department.
 * A blank field simply isn't rendered (no "N/A", no empty row).
 */
export function jobCardHtml(job, i = 0) {
  const meta = [
    job.location && `<span>${icons.pin}${esc(job.location)}</span>`,
    job.exp && `<span>${icons.compass}${esc(job.exp)}</span>`,
    job.type && `<span>${icons.building}${esc(job.type)}</span>`,
  ].filter(Boolean).join("");
  return `<article class="job-card" style="--i:${Math.min(i, 8)}">
    <a class="job-card__link" href="${esc(jobUrl(job.slug))}">
      <div class="job-card__top">${avatarHtml(job.company)}<div style="min-width:0">
        <h3 class="job-card__title">${esc(job.title)}</h3>
        <div class="job-card__company">${esc(job.company)}</div></div></div>
      ${meta ? `<div class="job-card__meta">${meta}</div>` : ""}
      ${job.salary ? `<div class="job-card__salary">${esc(job.salary)}</div>` : ""}
      ${job.dept ? `<div class="job-card__dept">${esc(job.dept)}</div>` : ""}
    </a>
    <div class="job-card__actions">${saveButtonHtml(job.jobId)}${shareButtonHtml(job)}</div>
  </article>`;
}

export function skeletonCards(n = 6) {
  const one = `<div class="job-skeleton" aria-hidden="true"><div class="skeleton" style="width:70%;height:16px"></div><div class="skeleton" style="width:45%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:60%"></div></div>`;
  return `<div class="grid-jobs" role="status" aria-label="Loading jobs">${one.repeat(n)}</div>`;
}

/** kind: "empty" | "error". actions = ready-made HTML (buttons/links). */
export function stateHtml({ kind = "empty", icon, title, text, actions = "" }) {
  const ic = icon || (kind === "error" ? icons.alert : icons.inbox);
  return `<div class="state ${kind === "error" ? "state--error" : ""}" ${kind === "error" ? 'role="alert"' : ""}>
    <div class="state__icon">${ic}</div>
    <div class="state__title">${esc(title)}</div>
    ${text ? `<p class="state__text">${esc(text)}</p>` : ""}
    ${actions ? `<div class="state__actions">${actions}</div>` : ""}
  </div>`;
}

/** One delegated listener handles every Save / Share button on the page, including ones rendered later. */
let bound = false;
export function bindJobActions() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const save = e.target.closest("[data-save]");
    if (save) {
      e.preventDefault();
      e.stopPropagation();
      const on = toggleSaved(save.dataset.save);
      document.querySelectorAll(`[data-save="${CSS.escape(save.dataset.save)}"]`).forEach((b) => {
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-label", on ? "Remove from saved jobs" : "Save job");
        b.title = on ? "Saved" : "Save";
      });
      toast(on ? "Saved to your list" : "Removed from saved jobs");
      if (on) track("save_job");
      window.dispatchEvent(new CustomEvent("placio:saved-changed", { detail: { jobId: save.dataset.save, saved: on } }));
      return;
    }
    const share = e.target.closest("[data-share]");
    if (share) {
      e.preventDefault();
      e.stopPropagation();
      track("share_job");
      shareLink({ title: `${share.dataset.title} at ${share.dataset.company}`, url: jobShareUrl(share.dataset.share) });
    }
  });
  // soft pointer-following glow on job cards (mouse only)
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest?.(".job-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    }, { passive: true });
  }
}

/** Fade-up reveal for elements with .reveal (call again after rendering new content). */
let io;
export function observeReveals(root = document) {
  const els = [...root.querySelectorAll(".reveal:not(.is-in)")];
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("is-in"));
  io ||= new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
}

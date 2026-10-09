/** Small DOM + formatting helpers shared by every page. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML-escape any value before putting it into an HTML string. EVERY dynamic value must go through this. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Returns the URL only if it is plain http(s); anything else (javascript:, data:, …) becomes "". */
export function safeHttpUrl(value) {
  try {
    const u = new URL(String(value ?? ""));
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Lets the browser paint during long loops (Excel parsing etc.). */
export const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/** Turns any thrown error into a calm, user-facing message + a kind the UI can branch on. Details go to the console only. */
export function errorInfo(err) {
  const code = String(err?.code || "").replace("firestore/", "");
  const msg = String(err?.message || "");
  let kind = "unknown";
  if (code === "resource-exhausted" || /quota/i.test(msg)) kind = "quota";
  else if (code === "permission-denied" || code === "unauthenticated") kind = "permission";
  else if (code === "failed-precondition" && /index/i.test(msg)) kind = "index";
  else if (code === "unavailable" || code === "deadline-exceeded" || /network|offline|failed to fetch|load failed/i.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false)) kind = "network";
  const messages = {
    quota: "Placio is very busy right now. Please try again in a little while.",
    permission: typeof location !== "undefined" && location.pathname.startsWith("/admin")
      ? "The database refused this. Most likely the security rules are not deployed yet (run: firebase deploy --only firestore:rules), or this account has no admin permission (run scripts/grant-admin.mjs, then sign out and in)."
      : "Jobs can't be loaded right now. Please try again later.",
    index: "The database needs a one-time setup step. Please let the Placio team know.",
    network: "We couldn't reach the server. Check your connection and try again.",
    unknown: "Something went wrong. Please try again.",
  };
  console.error("[placio]", kind, err);
  return { kind, message: messages[kind] };
}

/** The address links should use: the real site address on the production domain, but the CURRENT address on a
 *  test/preview deployment (so "Share" on a test site shares the test site, not the live one). Canonical/SEO tags
 *  always use SITE.url (seo.js). */
export function siteOrigin(siteUrl) {
  try {
    const prod = new URL(siteUrl).hostname.replace(/^www\./, "");
    const here = location.hostname.replace(/^www\./, "");
    return here === prod ? siteUrl : location.origin;
  } catch {
    return siteUrl;
  }
}

export function formatDateTime(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

let toastTimer;
/** Small bottom toast (copy-link confirmation, save feedback…). */
export function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

/** Native share sheet where available, copy-link fallback everywhere else. */
export async function shareLink({ title, text = "See what I found on Placio", url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // user closed the sheet — not an error
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    window.prompt("Copy this link:", url); // very old browsers / insecure contexts
  }
}

/** Locks page scroll while a sheet/modal is open. */
export function lockScroll(on) {
  document.documentElement.classList.toggle("scroll-locked", on);
}

export function setMeta(name, content, attr = "name") {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

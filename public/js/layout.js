/**
 * Shared page chrome, injected on every page so it exists in exactly ONE place:
 * navigation, footer, theme toggle, privacy preferences / consent banner,
 * back-to-top, desktop-only custom cursor, scroll reveals.
 * Navigation items and footer links come from site-config.js.
 */
import { SITE, NAV_LINKS, FOOTER_LINKS } from "./site-config.js";
import { icons } from "./icons.js";
import { esc, lockScroll } from "./utils.js";
import { STORAGE_ITEMS, getConsent, setConsent } from "./store.js";
import { analyticsConfigured, syncAnalytics } from "./analytics.js";
import { bindJobActions, observeReveals } from "./ui.js";

const path = location.pathname.replace(/\/+$/, "") || "/";
const isActive = (href) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

function navHtml() {
  const links = NAV_LINKS.map((l) => `<a class="nav__link ${isActive(l.href) ? "is-active" : ""}" href="${esc(l.href)}" ${isActive(l.href) ? 'aria-current="page"' : ""}>${esc(l.label)}</a>`).join("");
  const menu = NAV_LINKS.map((l) => `<a class="menu__link ${isActive(l.href) ? "is-active" : ""}" href="${esc(l.href)}">${esc(l.label)}</a>`).join("");
  return `<a class="skip-link" href="#main">Skip to content</a>
  <nav class="nav" aria-label="Main"><div class="nav__inner">
    <a class="nav__brand" href="/" aria-label="${esc(SITE.name)} home"><img src="/assets/logo-header.png" width="28" height="28" alt="">${esc(SITE.name)}</a>
    <div class="nav__links">${links}</div>
    <div class="nav__actions">
      <button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle dark mode"></button>
      <a class="btn btn--outline btn--sm nav__cta" href="/contact">Contact Us</a>
      <button class="icon-btn burger-btn" id="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="menu"><span class="burger" aria-hidden="true"><span></span><span></span><span></span></span></button>
    </div></div></nav>
  <div class="menu" id="menu"><div class="menu__panel" role="dialog" aria-label="Menu">${menu}<a class="menu__link" href="/contact">Contact Us</a></div></div>`;
}

function footerHtml() {
  const col = (list) => list.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("");
  return `<footer class="footer"><div class="container footer__grid">
    <div><div class="footer__brand"><img src="/assets/logo-footer.png" width="26" height="26" alt="">${esc(SITE.name)}</div>
      <p class="footer__about">A premium career platform designed for India’s next generation of professionals.</p>
      <div class="footer__small"><span>${esc(SITE.email)}</span><span>placio.co.in</span></div>
      <a class="footer__small" style="margin-top:.6rem" href="${esc(SITE.instagramUrl)}" target="_blank" rel="noopener noreferrer">${esc(SITE.instagramHandle)} on Instagram</a></div>
    <div><div class="footer__head">Platform</div><nav class="footer__col" aria-label="Platform">${col(FOOTER_LINKS.platform)}</nav></div>
    <div><div class="footer__head">Legal</div><nav class="footer__col" aria-label="Legal">${col(FOOTER_LINKS.legal)}<button type="button" data-open-prefs>Privacy &amp; cookie preferences</button></nav></div>
    <div><div class="footer__head">Contact</div><nav class="footer__col" aria-label="Contact"><a href="/contact">Contact Us</a><a href="mailto:${esc(SITE.email)}">Email Us</a></nav></div>
  </div><div class="footer__legal">© ${new Date().getFullYear()} ${esc(SITE.name)}.co.in — All rights reserved.</div></footer>`;
}

// ── theme ──
function setupTheme() {
  const btn = document.getElementById("theme-toggle");
  const paint = () => {
    const dark = document.documentElement.classList.contains("dark");
    btn.innerHTML = dark ? icons.sun : icons.moon;
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.setAttribute("aria-pressed", String(dark));
  };
  paint();
  btn.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("placio.theme", dark ? "dark" : "light"); } catch { /* ignore */ }
    paint();
  });
}

// ── mobile menu ──
function setupMenu() {
  const burger = document.getElementById("burger");
  const menu = document.getElementById("menu");
  const set = (open) => {
    menu.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    lockScroll(open);
  };
  burger.addEventListener("click", () => set(!menu.classList.contains("is-open")));
  menu.addEventListener("click", (e) => { if (e.target === menu || e.target.closest("a")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) { set(false); burger.focus(); } });
  matchMedia("(min-width: 768px)").addEventListener("change", (e) => e.matches && set(false));
}

// ── scroll: nav shadow + back to top ──
function setupScroll() {
  const nav = document.querySelector(".nav");
  const top = document.createElement("button");
  top.className = "to-top";
  top.type = "button";
  top.setAttribute("aria-label", "Back to top");
  top.innerHTML = icons.arrowUp;
  top.addEventListener("click", () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  document.body.appendChild(top);
  let ticking = false;
  const update = () => {
    nav.classList.toggle("is-scrolled", scrollY > 8);
    top.classList.toggle("is-visible", scrollY > 600);
    ticking = false;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// ── desktop custom cursor: only with a real mouse and when motion is allowed ──
function setupCursor() {
  if (location.pathname.startsWith("/admin")) return; // tables and forms: keep the normal cursor
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dot = document.createElement("div");
  const ring = document.createElement("div");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  dot.setAttribute("aria-hidden", "true");
  ring.setAttribute("aria-hidden", "true");
  document.body.append(dot, ring);
  document.documentElement.classList.add("has-cursor");
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, raf = 0, shown = false;
  const INTERACTIVE = "a, button, input, select, textarea, summary, label, [role='button'], [data-save], [data-share]";
  addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (!shown) { shown = true; dot.classList.add("is-visible"); ring.classList.add("is-visible"); }
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  function tick() {
    rx += (mx - rx) * 0.25; ry += (my - ry) * 0.25;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    raf = Math.abs(mx - rx) + Math.abs(my - ry) > 0.4 ? requestAnimationFrame(tick) : 0; // stops when idle: no constant CPU use
  }
  document.addEventListener("mouseover", (e) => e.target.closest?.(INTERACTIVE) && ring.classList.add("is-hover"), { passive: true });
  document.addEventListener("mouseout", (e) => e.target.closest?.(INTERACTIVE) && ring.classList.remove("is-hover"), { passive: true });
  document.addEventListener("mousedown", () => ring.classList.add("is-down"));
  document.addEventListener("mouseup", () => ring.classList.remove("is-down"));
  document.documentElement.addEventListener("mouseleave", () => { shown = false; dot.classList.remove("is-visible"); ring.classList.remove("is-visible"); });
}

// ── privacy: banner (only if analytics exists) + preferences dialog ──
function closeBanner() { document.getElementById("consent-banner")?.remove(); }

function showBanner() {
  if (document.getElementById("consent-banner")) return;
  const el = document.createElement("section");
  el.id = "consent-banner";
  el.className = "consent";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", "Privacy choices");
  el.innerHTML = `<p class="consent__text">${esc(SITE.name)} stores a few things on your device to work (your saved jobs, theme and a cached job list). With your permission we also use <strong>optional analytics</strong> to understand how the site is used. You can browse everything without it. <a href="/privacy">Privacy</a> · <a href="/cookies">Cookies</a></p>
    <div class="consent__actions">
      <button class="btn btn--outline btn--sm" type="button" data-choice="reject">Reject optional</button>
      <button class="btn btn--outline btn--sm" type="button" data-choice="accept">Accept all</button>
      <button class="btn btn--ghost btn--sm" type="button" data-open-prefs>Manage preferences</button>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    const c = e.target.closest("[data-choice]")?.dataset.choice;
    if (!c) return;
    setConsent(c === "accept");
    closeBanner();
  });
}

let prefsOpener = null;
function openPrefs() {
  if (document.getElementById("prefs-modal")) return;
  prefsOpener = document.activeElement;
  const hasAnalytics = analyticsConfigured();
  const consent = getConsent();
  const rows = STORAGE_ITEMS.map((i) => `<tr><td>${esc(i.key)}</td><td>${esc(i.category)} · ${esc(i.where)}<br>${esc(i.purpose)}</td></tr>`).join("");
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "prefs-modal";
  modal.innerHTML = `<div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="prefs-title" style="max-width:34rem">
    <h2 class="modal__title" id="prefs-title">Privacy &amp; cookie preferences</h2>
    <p class="muted" style="font-size:.85rem">${esc(SITE.name)} sets <strong>no cookies</strong> of its own and shows no ads. It keeps a small amount of data in your browser so the site works; none of it is sent to us.</p>
    <div class="prefs-row"><div><h3>Necessary</h3><p>Remembers your choice and caches the job list so pages load fast. Always on.</p></div><label class="switch"><input type="checkbox" checked disabled aria-label="Necessary storage (always on)"><span></span></label></div>
    <div class="prefs-row"><div><h3>Functional</h3><p>Saved jobs, recently viewed jobs, recent searches and dark-mode choice. Only stored when you use those features, and only on this device.</p></div><label class="switch"><input type="checkbox" checked disabled aria-label="Functional storage (set only when you use the feature)"><span></span></label></div>
    ${hasAnalytics
      ? `<div class="prefs-row"><div><h3>Analytics (optional)</h3><p>Anonymous usage statistics (which pages are used) via Google Analytics. Off unless you switch it on.</p></div><label class="switch"><input type="checkbox" id="pref-analytics" ${consent?.analytics ? "checked" : ""} aria-label="Analytics"><span></span></label></div>`
      : `<div class="prefs-row"><div><h3>Analytics &amp; marketing</h3><p>Not used. ${esc(SITE.name)} currently runs no analytics, advertising or tracking scripts.</p></div></div>`}
    <details style="margin-top:.5rem"><summary class="link-quiet" style="cursor:pointer">What exactly is stored?</summary><table class="storage-table"><tbody>${rows}</tbody></table></details>
    <div class="row" style="margin-top:1.1rem;justify-content:flex-end">
      <button class="btn btn--ghost btn--sm" type="button" id="pref-clear">Clear data on this device</button>
      ${hasAnalytics ? `<button class="btn btn--outline btn--sm" type="button" id="pref-reject">Reject optional</button><button class="btn btn--primary btn--sm" type="button" id="pref-save">Save choices</button>` : `<button class="btn btn--primary btn--sm" type="button" id="pref-close">Close</button>`}
    </div></div>`;
  document.body.appendChild(modal);
  lockScroll(true);
  const box = modal.querySelector(".modal__box");
  const close = () => { modal.remove(); lockScroll(false); document.removeEventListener("keydown", onKey); prefsOpener?.focus?.(); };
  const onKey = (e) => {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab") return;
    const f = [...box.querySelectorAll("button, input:not([disabled]), summary, a[href]")];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", onKey);
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
  const $ = (s) => modal.querySelector(s);
  $("#pref-close")?.addEventListener("click", close);
  $("#pref-save")?.addEventListener("click", () => { setConsent($("#pref-analytics").checked); closeBanner(); close(); });
  $("#pref-reject")?.addEventListener("click", () => { setConsent(false); closeBanner(); close(); });
  $("#pref-clear").addEventListener("click", async () => {
    if (!confirm("Remove saved jobs, recent jobs, recent searches and cached data from this device?")) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("placio.") && k !== "placio.consent.v1").forEach((k) => localStorage.removeItem(k));
      Object.keys(sessionStorage).filter((k) => k.startsWith("placio.")).forEach((k) => sessionStorage.removeItem(k));
      indexedDB.deleteDatabase("placio-index");
    } catch { /* ignore */ }
    close();
    location.reload();
  });
  (hasAnalytics ? $("#pref-analytics") : $("#pref-close")).focus();
}

function setupPrivacy() {
  document.addEventListener("click", (e) => { if (e.target.closest("[data-open-prefs]")) { e.preventDefault(); openPrefs(); } });
  window.addEventListener("placio:consent-changed", syncAnalytics);
  if (analyticsConfigured()) {
    syncAnalytics();
    if (getConsent() === null) showBanner();
  }
}

// ── boot ──
function boot() {
  document.getElementById("site-nav").innerHTML = navHtml();
  document.getElementById("site-footer").innerHTML = footerHtml();
  const m = document.querySelector("main"); if (m && !m.id) m.id = "main";
  setupTheme();
  setupMenu();
  setupScroll();
  setupCursor();
  setupPrivacy();
  bindJobActions();
  observeReveals();
}
boot();


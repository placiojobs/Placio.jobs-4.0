/**
 * Admin page guard + admin bar + idle sign-out.
 * IMPORTANT: this only decides what the admin UI SHOWS. The real protection is firestore.rules /
 * storage.rules, which check the signed `admin` claim on every read/write — hiding or showing buttons
 * here can never grant (or remove) access.
 */
import { onAuth, signOutUser } from "../firebase.js";
import { ADMIN } from "../site-config.js";
import { esc } from "../utils.js";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/jobs", label: "Manage Jobs" },
  { href: "/admin/jobs/new", label: "Add Job" },
  { href: "/admin/excel", label: "Excel" },
  { href: "/admin/config", label: "Configuration" },
];

function startIdleTimer(onWarn, onTimeout) {
  let warn, out;
  const reset = () => {
    clearTimeout(warn);
    clearTimeout(out);
    onWarn(false);
    warn = setTimeout(() => onWarn(true), ADMIN.idleTimeoutMs - ADMIN.idleWarningMs);
    out = setTimeout(onTimeout, ADMIN.idleTimeoutMs);
  };
  ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach((e) => addEventListener(e, reset, { passive: true }));
  reset();
}

/** Resolves with { email } once a signed-in admin is confirmed. Redirects everyone else. */
export function requireAdmin() {
  const bar = document.getElementById("admin-bar");
  const main = document.getElementById("admin-main");
  main.innerHTML = `<div class="admin-center muted">Checking admin access…</div>`;
  return new Promise((resolve) => {
    let resolved = false;
    onAuth(({ user, isAdmin, error }) => {
      if (error) { main.innerHTML = `<div class="admin-center"><div class="state state--error"><div class="state__title">Sign-in service unavailable</div><p class="state__text">Couldn’t reach Firebase Authentication. Check your connection and reload.</p></div></div>`; return; }
      if (!user) { location.replace("/admin/login"); return; }
      if (!isAdmin) {
        bar.innerHTML = "";
        main.innerHTML = `<div class="admin-center"><div><div class="state"><div class="state__title">No admin access</div><p class="state__text">${esc(user.email)} is signed in but isn’t an administrator. If this is your account, run the grant-admin script (see README), then sign out and in again.</p><div class="state__actions"><button class="btn btn--primary btn--sm" id="so" type="button">Sign out</button></div></div></div></div>`;
        document.getElementById("so").addEventListener("click", async () => { await signOutUser(); location.replace("/admin/login"); });
        return;
      }
      if (resolved) return;
      resolved = true;
      const path = location.pathname.replace(/\/+$/, "") || "/";
      bar.innerHTML = `<div class="admin-bar"><nav class="admin-nav" aria-label="Admin">${LINKS.map((l) => `<a href="${l.href}" class="${l.href === path ? "is-active" : ""}" ${l.href === path ? 'aria-current="page"' : ""}>${esc(l.label)}</a>`).join("")}</nav>
        <div class="admin-user"><span>${esc(user.email)}</span><button class="btn btn--ghost btn--sm" id="signout" type="button">Sign out</button></div></div>
        <div class="banner banner--warn" id="idle-warn" role="alert" hidden style="margin-bottom:1rem">You’ve been idle for a while — you’ll be signed out in about 2 minutes. Move the mouse or press a key to stay signed in.</div>`;
      document.getElementById("signout").addEventListener("click", async () => { await signOutUser(); location.replace("/admin/login"); });
      startIdleTimer((show) => { const w = document.getElementById("idle-warn"); if (w) w.hidden = !show; }, async () => { await signOutUser(); location.replace("/admin/login"); });
      main.innerHTML = "";
      resolve({ email: user.email });
    });
  });
}

/** Run a long admin action with a busy button, calm errors and a result message. */
export async function withBusy(button, fn) {
  button.classList.add("is-loading");
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.classList.remove("is-loading");
    button.disabled = false;
  }
}

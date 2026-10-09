/** Admin sign-in (Firebase email + password). Accounts get admin rights only via scripts/grant-admin.mjs. */
import { onAuth, signIn, signOutUser } from "../firebase.js";
import { $, esc } from "../utils.js";

const main = $("#admin-main");
const LOCK_KEY = "placio.adminLock";

function lockedUntil() {
  try { return Number(sessionStorage.getItem(LOCK_KEY) || 0); } catch { return 0; }
}
function noteFailure() {
  // gentle client-side brake on top of Firebase's own server-side throttling
  try {
    const k = "placio.adminFails";
    const n = Number(sessionStorage.getItem(k) || 0) + 1;
    sessionStorage.setItem(k, String(n));
    if (n >= 5) { sessionStorage.setItem(LOCK_KEY, String(Date.now() + 60_000 * Math.min(n - 4, 10))); }
  } catch { /* ignore */ }
}
const clearFailures = () => { try { sessionStorage.removeItem("placio.adminFails"); sessionStorage.removeItem(LOCK_KEY); } catch { /* ignore */ } };

function showForm() {
  main.innerHTML = `<div class="admin-center"><form class="login-card" id="f" novalidate>
    <h1>Admin sign in</h1>
    <label class="field"><span class="field__label">Email</span><input class="input" id="email" type="email" autocomplete="username" required></label>
    <label class="field"><span class="field__label">Password</span><input class="input" id="pw" type="password" autocomplete="current-password" required></label>
    <p class="field__error" id="err" role="alert" hidden style="margin-top:.7rem"></p>
    <button class="btn btn--primary btn--block" id="go" type="submit" style="margin-top:1.1rem">Sign in</button>
    <p class="faint" style="margin-top:1rem;font-size:.72rem">Only accounts granted admin access can use this area (see README → “Make yourself admin”).</p>
  </form></div>`;
  const err = $("#err");
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const wait = lockedUntil() - Date.now();
    if (wait > 0) { err.textContent = `Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`; err.hidden = false; return; }
    const email = $("#email").value.trim(), pw = $("#pw").value;
    if (!email || !pw) { err.textContent = "Enter your email and password."; err.hidden = false; return; }
    const btn = $("#go");
    btn.classList.add("is-loading"); btn.disabled = true;
    try {
      await signIn(email, pw);
      clearFailures();
    } catch (ex) {
      noteFailure();
      // one generic message: never reveal whether the email exists
      err.textContent = /too-many-requests/.test(ex?.code || "") ? "Too many attempts. Please wait a few minutes and try again." : /network/.test(ex?.code || "") ? "Network problem. Please try again." : "Invalid email or password.";
      err.hidden = false;
      btn.classList.remove("is-loading"); btn.disabled = false;
    }
  });
  $("#email").focus();
}

showForm();
onAuth(({ user, isAdmin }) => {
  if (user && isAdmin) location.replace("/admin");
  else if (user && !isAdmin) {
    main.innerHTML = `<div class="admin-center"><div class="state"><div class="state__title">No admin access</div><p class="state__text">${esc(user.email)} is signed in but isn’t an administrator yet. After running the grant-admin script, sign out and sign in again so the new permission is picked up.</p><div class="state__actions"><button class="btn btn--primary btn--sm" id="so" type="button">Sign out</button></div></div></div>`;
    $("#so").addEventListener("click", async () => { await signOutUser(); location.reload(); });
  }
});

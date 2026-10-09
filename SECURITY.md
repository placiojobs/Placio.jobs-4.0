# Placio — security checklist

Architecture in one line: a static website (Vercel) talking **directly** to Firebase Firestore + Auth (Spark plan; `storage.rules` is shipped and tested but not deployed because Storage is not enabled). There is **no application server**, so
the security boundary is the **Firebase Security Rules** (`firestore.rules`, `storage.rules`) plus Firebase Auth.
Nothing the browser does (hidden buttons, admin screens, JavaScript) is trusted.

Legend: ✅ verified by an automated test that was run · 🔎 inspected / reasoned (not executed) · ⚠️ remaining risk

## What was checked and what the evidence is

| Area | Result | Evidence |
|---|---|---|
| **Authorisation (admin vs public)** | ✅ Only a token with the signed custom claim `admin == true` can write jobs, the index, hashes or the audit log, or list collections. A signed-in non-admin, and an account with the *right e-mail but no claim*, are rejected everywhere. | `tests/rules/rules.test.mjs` run against the real Firestore + Storage emulators (6/6 pass) and again through the real browser SDK with real Auth tokens (non-admin account → “No admin access”; admin → works) |
| **Public can only do intended things** | ✅ Read one job by id, read `meta/index`, read index chunks / the index file. **Cannot** list or scrape collections, read admin data/reports/activity, or write anything except a report. | same |
| **Anonymous report spam/abuse** | ✅ Create-only; exact 3 fields; reason from a fixed list; timestamp must be ±10 min of server time; document id must be `<jobId>__<yyyymmdd>__<reasonIdx>` so the same job+reason can be reported **once per day**; no update/delete/read. 5-per-hour client throttle on top. ⚠️ A script could still report many *different* jobs (bounded cost: one small write each) — add Firebase App Check if it ever happens. | rules tests + real-SDK test |
| **Schema enforcement even for admins** | ✅ Job documents must have matching `jobId`, `status` ∈ {active, removed}, title/company length-capped, `link` must be http(s) or empty, `desc` ≤ 30,000 chars. Audit log is append-only. | rules tests |
| **Admin route protection** | ✅ `/admin/*` pages redirect to login when signed out; show “No admin access” for non-admins; `X-Robots-Tag: noindex` + `<meta robots noindex>`; `Cache-Control: no-store`. Real enforcement is in the rules (above), not the UI. | browser tests (demo + real SDK) |
| **Brute force** | ✅ Generic error text (no user enumeration); client lockout after 5 failures (60 s, growing) — executed: the 6th attempt, and even the correct password, were refused. Firebase Auth’s own server-side throttling (`auth/too-many-requests`) is the real brake (🔎 not triggered in testing). Recommend: use a strong password, **disable public sign-up** in Firebase Auth settings. | browser test |
| **Session handling** | ✅ No cookies at all → **no CSRF surface**. Firebase ID token lives in IndexedDB, 1-hour refreshable. 30-minute idle sign-out + warning (observed firing in testing). ⚠️ Idle sign-out is client-side; a stolen token would remain valid until Firebase expires it (≤1 h). | observed |
| **XSS / HTML injection** | ✅ Every dynamic value goes through `esc()`; `desc` is rendered with `textContent`-equivalent escaping + CSS `white-space`; JSON-LD is set via `textContent`; hostile `<img onerror>`, `<script>`, `</script>`, `<svg onload>` in title/company/desc/skills/salary/location were stored and then displayed as inert text on home, browse, job page, admin list, chips, recent-viewed, `<title>`. | executed in the browser (`window.__xss` stayed undefined) |
| **CSP** | ✅ `default-src 'self'; script-src 'self' https://www.gstatic.com; no inline scripts or handlers (enforced by `npm run check`); `object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests`. The whole site (public + admin, including the real Firebase SDK against the emulators) ran under this CSP with no violation messages in the console. ⚠️ `style-src 'unsafe-inline'` is allowed (inline `style=` attributes for widths/animation delay). | browser console clean; `scripts/check.mjs` |
| **Other headers** | 🔎 HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic, geolocation, payment off), `Cross-Origin-Opener-Policy: same-origin`. Delivered by Firebase Hosting from `firebase.json`; verified present on the dev server which reads the same file. | header inspection |
| **URL / query manipulation** | ✅ Filters are length- and count-capped, unknown sort values fall back to default, no `limit`/`cursor` parameter exists, hostile values only ever appear escaped; slug/jobId validated by `^[A-Za-z0-9_]{1,64}$` before any read. | unit tests + browser with a hostile query string |
| **Open redirects** | ✅ No redirect uses user input; all `location` changes are to fixed paths or `buildJobsHref()` output. | code review of every `location.*` assignment |
| **Unsafe external links** | ✅ Apply links must parse as `http:`/`https:` (`javascript:`/`data:` rejected on import, on the form, in rules and again at render); opened with `target=_blank rel="noopener noreferrer nofollow"`; page states the user is leaving Placio. | unit + rules + browser |
| **Excel upload / import** | ✅ `.xlsx` only, 25 MB / 60,000 rows, ZIP-signature check, corrupted/hostile files rejected with calm messages, 40,000-char cell cap, full validation before any write, all-or-nothing publishing of errors, formula-injection-safe CSV export of issue lists. ExcelJS is self-hosted (no CDN) and `npm audit` reports 0 vulnerabilities. | integration tests (hostile/empty/corrupt/10k-row files) |
| **Export** | ✅ Admin-only (rules deny listing to others); exactly the 11 public columns; xlsx strings are never interpreted as formulas. | integration test |
| **Bulk / destructive admin actions** | ✅ Nothing is hard-deleted; deactivate/reactivate with confirmation; Full Sync lists what will be removed and demands typed confirmation when >30% of live jobs would go; idempotent re-imports; failures never change the public list. | integration + browser tests |
| **SSRF / server-side injection** | ✅ N/A — no server code, no server-side fetches. NoSQL abuse is limited to what the rules above allow. | n/a |
| **Secrets** | ✅ Nothing secret ships in the site: the Firebase web config is public by design; `check.mjs` fails the build on private keys / service-account JSON / `.env` files; `.gitignore` blocks them. ⚠️ **The Admin SDK private key was pasted in a chat during development: rotate it** (README §3). | `npm run check` |
| **Dependencies / supply chain** | ✅ Zero runtime npm dependencies. Dev-only: ExcelJS (`npm audit`: 0 vulnerabilities, `uuid` override). ⚠️ Firebase SDK is loaded from `www.gstatic.com` at a pinned version (Google-operated, but no SRI for ES modules). Self-hosting the SDK would remove that trust — needs a bundler. | `npm audit` |
| **Error / info leakage** | ✅ Users see short calm messages (`errorInfo`); raw errors only in the browser console; no stack traces in the UI; no source maps are produced. | code + browser |
| **Privacy** | ✅ No cookies, no analytics unless configured *and* consented; self-hosted fonts; truthful policy pages; preferences dialog lists exactly what is stored. | browser tests |
| **CORS** | 🔎 The site only calls Google APIs. ⚠️ The browser reading the **Storage index file** cross-origin worked with the emulator; against real Cloud Storage confirm once after deploy (if blocked, the site transparently falls back to Firestore chunks and the dashboard says so). |

## Remaining / out of scope

* ⚠️ **No server-side rate limiting is possible** without a server. Cost-abuse protection options if needed: Firebase App Check, budget alerts, Cloud Armor (not needed at current scale).
* ⚠️ Anyone can request individual public job documents by id (they are public data).
* ⚠️ Not security-tested against the *production* project (no credentials were used). All rule tests ran on the official emulators with the exact rule files that ship.
* Re-run any time: `npm run check`, `npm test`, `npm run test:rules`.

# Placio

Job-discovery site for students and freshers in India — **plain HTML + CSS + vanilla JavaScript + Firebase**
(Firestore + Auth; hosted on Vercel). No build step, no framework, no server to maintain.

> **Deploying?** Read **[DEPLOY.md](DEPLOY.md)** — every command in order (first time / before / after each deployment).
> Runs on the Firebase **Spark (free) plan**: no Firebase Storage, no Firebase Hosting needed.

> This is a conversion of the earlier Next.js/React/Tailwind project. Same pages, same features, same Firebase
> project and `jobs` documents — now simple enough for one person to read and change.

---

## 1. Try it in 30 seconds (no Firebase needed)

```bash
npm install          # only needed for tests (ExcelJS); the site itself has no dependencies
npm run demo         # http://localhost:5173  — fake in-browser database with 4,000 demo jobs
```

Admin panel in demo mode: <http://localhost:5173/admin> → `admin@demo.test` / `demo1234`.
Demo data lives in your browser only (reset: DevTools console → `__demo.reset(4000)`; see read counts → `__demo.reads()`).

To run against your **real** Firebase project instead: `npm run dev`.

**Test with the real Firebase SDK but no real project** (needs Java 17+): start the Firebase emulators
(`npx firebase emulators:start --only auth,firestore,storage --project placio4`), run `npm run dev:emulator`,
and in the browser console on localhost run `localStorage.setItem("placio.emulator","1")`. The site then uses the real SDK, the real
`firestore.rules` / `storage.rules`, real Auth tokens and real Storage uploads against your local emulators. (This is how the final
end-to-end test was done; the switch only works on `localhost`.)

---

## 2. Where do I change…? (everything is findable in minutes)

| I want to… | Edit this |
|---|---|
| Add / rename / reorder a **department**, add a **city**, change job types, experience chips, menu links, footer links, sort options, contact email, “Load more” size | **`public/js/site-config.js`** (one small block each) |
| Change **colours / fonts / spacing look** | the `:root` blocks at the top of **`public/css/style.css`** (light + dark) |
| Change **filter / search / sort / recommendation** logic | `public/js/jobsFilter.js` |
| Change **Excel validation rules** (what is an error vs a warning) | `public/js/validate.js` (rules are listed in its header comment) |
| Change **experience parsing** (“1 to 3 years”, “3+” …) | `public/js/experience.js` |
| Change **what is stored/queried in Firestore**, collection names, Storage | `public/js/firebase.js` (the *only* file that talks to Firebase) |
| Change **how the job list is packed / downloaded** | `public/js/jobIndex.js` (pack) + `public/js/indexLoader.js` (download + cache) |
| Change **admin writes** (add/edit/import/deactivate) | `public/js/admin/adminData.js` |
| Change **who can read/write what** | `firestore.rules`, `storage.rules` |
| Change security headers / CSP / URL rewrites | `firebase.json` |
| Edit page text (About, Privacy, Terms…) | the matching `public/*.html` |

```
public/                 ← the website (this folder is what gets deployed)
  index.html jobs.html job.html saved-jobs.html about.html contact.html privacy.html terms.html cookies.html 404.html
  admin/                login · dashboard · jobs · job-form · excel · config
  css/                  style.css (tokens+base) · components.css · admin.css · responsive.css
  js/                   site-config.js · firebase.js · jobIndex.js · indexLoader.js · jobsFilter.js · validate.js · …
    pages/ components/ admin/
  assets/               logos + self-hosted fonts      vendor/  ExcelJS (admin only)
firestore.rules  storage.rules  firestore.indexes.json  firebase.json
dev/                    demo server + fake database (never deployed)
tests/                  unit, integration and security-rule tests
scripts/                grant-admin.mjs · check.mjs
```

---

## 3. Deploy (first time) — short version, full details in [DEPLOY.md](DEPLOY.md)

1. `npm i -g firebase-tools`, then `firebase login` (the project owner, placio.jobs@gmail.com). `.firebaserc` already points at `placio4`.
2. Deploy the Firestore rules **first**: `firebase deploy --only firestore:rules --project placio4`. *(Don't deploy `storage`: it needs the paid Blaze plan.)*
3. **Admin permission** for placio.jobs@gmail.com (once): the account must exist in Firebase → Authentication → Users, then `node scripts/grant-admin.mjs C:\path\to\service-account.json placio.jobs@gmail.com`, then sign out and in. In Authentication → Settings also turn **off** “Enable create (sign-up)”.
4. Admin → Dashboard → **Rebuild job index** once (reads each existing job once and publishes the public list). From then on Excel imports / Add Job keep it up to date automatically.
5. Deploy the site to Vercel (new project from the GitHub repo; output directory `public`) and run `npm run smoke -- https://<your-project>.vercel.app`.
6. Search Console: upload `sitemap.xml` (Dashboard → *Download sitemap.xml* → replace `public/sitemap.xml` → push).

> ⚠️ **Rotate the old Firebase Admin key.** The private key for `firebase-adminsdk-fbsvc@placio4…` was pasted into a chat during development.
> In Google Cloud console → IAM → Service Accounts → that account → Keys: **create a new key if you need one, then delete the old key**.
> This website never needs the key (the browser never holds it); only `grant-admin.mjs` on your own computer does.

---

## 3b. “I can log in as admin but no jobs show” — read this first

Login only proves Firebase **Auth** works. Jobs also need these, in order. **Admin → Dashboard → Setup check** tests all of them and says what to do.

| Symptom | Cause | Fix |
|---|---|---|
| Public pages say “Jobs can’t be loaded”, admin says “database refused this” | The **new rules are not deployed** (the old project’s rules block everything) | `firebase deploy --only firestore:rules` |
| Public pages say “No jobs yet”, dashboard says “Nothing is published yet” | Jobs are in the database but the **public job index was never built** | Dashboard → **Rebuild job index** (one time) |
| Rebuild/Import says “refused” | Account is not admin, or rules not deployed | `node scripts/grant-admin.mjs key.json you@mail.com`, then **sign out and in** |
| Dashboard says “database documents (free-plan mode)” | Normal on the Spark plan (Storage is switched off in `site-config.js`) | Nothing to fix |
| Everything looks right but old data is shown | Browser cache (5 min) | Hard-reload, or DevTools → Application → Clear storage |

## 4. Daily admin workflow

* **Excel** (`/admin/excel`): choose file → *Validate* (nothing saved) → review → *Commit*.
  Required columns: **Job ID, title, company**. Everything else may be blank. Extra columns are ignored with a warning.
  Errors block everything (no half-published files). Re-uploading the same file changes nothing. *Full sync* also deactivates live jobs missing from the file and asks for explicit confirmation (typed confirmation if it would remove >30%).
* **Manage Jobs**: search, filter, sort, bulk *Deactivate / Reactivate*. Nothing is ever hard-deleted.
* **Dashboard**: counts, import history, health warnings, *Rebuild job index*, sitemap download.
* **Configuration**: shows what `site-config.js` contains, what’s in use but not configured (typo detector), and generates the lines to paste.

---

## 5. How it stays cheap (the important design decision)

Firestore can’t do “search + department × city × experience” in one query, and reading every job per visitor would cost thousands of reads.
So the admin publishes a **compact job index** (a few Firestore documents; optionally also one gzipped file in Firebase Storage if you ever move to the Blaze plan)
and the browser filters locally.

| Visitor action | Firestore reads | Data downloaded |
|---|---|---|
| Home page | **1** | ~3 KB |
| Browse Jobs, first visit (any filters, search, sorting, load-more afterwards) | **3** at 4,900 jobs (1 meta + 2 index documents) | ~0.5 MB, cached until you publish again |
| Browse Jobs, returning visitor | **1** per 5 min session at most | 0 (IndexedDB cache) |
| Open a job | **1** | the job |
| Recommendations, saved jobs, suggestions, matrices | **0** | uses the cached index |

Measured (`npm run scale`, synthetic data): index file size → 4,000 jobs **320 KB raw / 32 KB gzipped**, 10,000 → 0.8 MB / 82 KB, 25,000 → 2.0 MB / 194 KB, 50,000 → 4.0 MB / 401 KB. Decoding 25k jobs takes ~90 ms, filtering ~10 ms.
Measured admin writes: importing 4,000 new jobs = 4,005 document writes; re-importing the same file = 0; editing 2 jobs out of 1,000 = 6 writes + 1 file upload.

**Rough budget:** 200 visitors/day ≈ a few hundred reads. 50,000 visitors/day ≈ 50k–150k reads (≈ cents/day on the Blaze plan; the free Spark plan allows 50k reads/day, so at that scale use Blaze with a budget alert).
Bandwidth is the real cost at scale: on the free plan every new visitor downloads ~0.5 MB of index documents (then cached). At high traffic, upgrade to Blaze and switch on the gzipped Storage file (`FEATURES.indexInStorage`), which cuts that to ~50 KB.

**Honest limits:** all card data is downloaded to the visitor, so comfortable up to **~25,000 jobs** (phones: a few MB of memory and ~0.1–0.2 s decode). Beyond that, move search to a service (Algolia / Typesense); only `jobIndex.js`, `indexLoader.js` and `jobsFilter.js` would change.
Search covers title, company, city, department and skills — **not the description** (shipping descriptions would multiply the download).
Salary and skills *are* in the index because the job card shows salary and search/recommendations use skills; descriptions, apply links and all admin fields are not.
Free-plan write limit is 20,000 writes/day: a first-time import of 25,000 jobs must be split over two days.

---

## 6. Security summary (details in `SECURITY.md`)

* Real protection = **`firestore.rules` + `storage.rules`**, verified against the actual Firebase emulators (`npm run test:rules`): public can read one job / the index, cannot list or write; only a signed `admin` claim can write; reports are create-only and strictly shaped; audit log is append-only.
* No secrets in the site (Firebase web config is public by design). No inline scripts → strict Content-Security-Policy; HSTS, nosniff, frame-deny, referrer & permissions policies in `firebase.json`.
* All data is HTML-escaped before display; apply links must be http(s); external links use `rel="noopener noreferrer nofollow"`.
* Excel upload: 25 MB / 60,000-row cap, ZIP-signature check, per-cell caps, validated before any write.
* Sign-in has a client-side lockout on top of Firebase’s own throttling; 30-minute idle sign-out.

## 7. Privacy

Placio sets **no cookies**; it uses localStorage/sessionStorage/IndexedDB (listed in the footer → *Privacy & cookie preferences* and in `cookies.html`). No analytics is loaded unless you set `ANALYTICS.gaId` in `site-config.js` — and then only after the visitor opts in (equal-weight Accept / Reject banner). If you enable GA you must also allow `https://www.googletagmanager.com` (script-src) and `https://*.google-analytics.com` (connect-src) in the CSP in `firebase.json`, and update the Privacy Policy. Fonts are self-hosted (no Google Fonts requests).
Legal pages describe what the code really does; they are not legal advice — have them reviewed if you operate in regions with specific rules.

## 8. Tests

```bash
npm test             # 33 tests: parsing, validation, index, filters, pagination, recommendations, admin pipeline, reads/writes counting
npm run check        # syntax, CSP-safe HTML, colour tokens only in :root, no secrets
npm run scale        # payload / decode / filter timing at 4k–50k jobs
# security rules against the real emulators (needs Java 17+ and: npm i -D firebase-tools @firebase/rules-unit-testing)
npm run test:rules
```

## 9. Known limitations

* Per-job Open Graph / Twitter tags and JobPosting data are set by JavaScript. Google renders JS and reads them; WhatsApp/Instagram/Facebook link previews will show the generic site preview, not the job.
* `public/sitemap.xml` is static: regenerate from the dashboard after big imports.
* Anyone can request individual job documents by ID (public data) — a determined script could add reads. Optional hardening: Firebase App Check.
* One admin editing at a time is assumed (index publish is last-writer-wins).
* The demo/fake database and the Node tests simulate Firebase; the real-SDK path was tested against the official emulators and against your live Firestore (read-only checks + the first index publish).
* Spark-plan limits (50k reads, 20k writes per day, 10 GiB/month egress) are described in DEPLOY.md §G. Storage/CDN delivery (cheaper at scale) needs the Blaze plan — it is built in, just switched off.

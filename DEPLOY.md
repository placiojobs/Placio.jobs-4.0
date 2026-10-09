# Placio — deployment guide (Vercel + Firebase Spark/free plan)

Frontend: **Vercel** (static site from `public/`). Backend: **Firebase** project `placio4` — **Firestore + Auth only**.
Firebase Storage is **not used** (it needs the paid Blaze plan); the job list is stored as Firestore documents
(`FEATURES.indexInStorage = false` in `public/js/site-config.js`).

Admin account: **placio.jobs@gmail.com** (must have the `admin` permission — see step A4).

Legend: ✅ = already done for your project on 2026-10-09 (you can skip it) · 🔁 = repeat on every release.

---

## A. First-time setup (once)

| # | Step | Command / where | Status |
|---|---|---|---|
| A1 | Install tools | `npm i -g firebase-tools vercel` | `firebase` ✅ installed; install `vercel` if you use the CLI |
| A2 | Log in to Firebase with the project owner | `firebase login` → choose **placio.jobs@gmail.com** | ✅ |
| A3 | Firebase console → **Authentication → Sign-in method → Email/Password = enabled**; **Settings → User actions → untick “Enable create (sign-up)”** | console | email/password ✅ · sign-up switch: please check |
| A4 | Give the admin permission to placio.jobs@gmail.com | account must exist in Authentication → Users, then `node scripts/grant-admin.mjs <service-account.json> placio.jobs@gmail.com`, then **sign out and in** | ✅ (account already has `admin: true`) |
| A5 | Deploy the Firestore security rules | `firebase deploy --only firestore:rules --project placio4` | ✅ |
| A6 | Publish the public job list (first time) | Admin → **Dashboard → Rebuild job index** (reads each job once) | ✅ (done from the command line: 4,918 jobs, version 2) |
| A7 | Check everything | Admin → Dashboard → **Run setup check** → all green | after login |

> Do **not** run `firebase deploy --only storage` — it fails without Blaze. `firebase deploy --only firestore:rules` is the only Firebase deploy command you need.

## B. Before every deployment 🔁

```bash
cd Placio.jobs-4.0
npm install            # once per machine (only needed for tests)
npm test               # 33 tests must pass
npm run check          # syntax, CSP-safe HTML, colour tokens, no secrets, vercel.json == firebase.json headers
git status             # commit your changes
```
Changed `firestore.rules`? Also run `firebase deploy --only firestore:rules --project placio4` (and `npm run test:rules` if you have Java).

## C. Deploy to Vercel (test domain — NOT placio.co.in)

Create a **new** Vercel project for this repo, so the live site on placio.co.in (your old project) is not touched.

**Option 1 — dashboard (recommended, auto-deploys on every `git push`)**
1. <https://vercel.com/new> → *Import Git Repository* → `placiojobs/Placio.jobs-4.0`.
2. Framework Preset: **Other**. Root Directory: `./`. Leave build/install/output as detected — `vercel.json` already sets `outputDirectory: public` and no-op install/build commands.
3. No environment variables are needed (Firebase web config is public by design).
4. **Deploy.** You get `https://<project>.vercel.app`. **Do not add placio.co.in** to this project yet.

**Option 2 — CLI**
```bash
vercel login
vercel link            # create a NEW project, e.g. "placio-test"
vercel deploy --prod   # prints https://<project>.vercel.app
```

Any domain other than placio.co.in automatically gets `X-Robots-Tag: noindex` (see `vercel.json`), so the test site can’t be indexed by Google.

## D. After every deployment 🔁

```bash
npm run smoke -- https://<project>.vercel.app
```
Must end with `ALL GOOD`. It checks pages, URL rewrites (`/jobs/<slug>`, `/admin/jobs/new`), the 404 page, fonts/caching, all security headers, `noindex` on the test domain, and — against your **live database** — that the job list is published and decodes to the right count, a job page loads, and public users **cannot** list, read admin data or write.

Then, **first time on a new domain only**:
1. Firebase console → Authentication → Settings → **Authorized domains → Add** `<project>.vercel.app` (recommended; email/password sign-in works without it, but this keeps Firebase happy).
2. Open `https://<project>.vercel.app/admin`, sign in as **placio.jobs@gmail.com** → Dashboard → **Run setup check** → all green. (The admin password is never stored in the repo or shared with anyone but you.)
3. Click through: Home → Browse → filter → open a job → Save → Share → Admin → Excel → Manage Jobs.

## E. Go live on placio.co.in (later, when you are happy)

1. Vercel: remove `placio.co.in` (+ `www`) from the **old** project, add it to **this** project (*Settings → Domains*), update DNS exactly as Vercel shows.
2. Firebase console → Authentication → Authorized domains → add `placio.co.in` and `www.placio.co.in`.
3. `npm run smoke -- https://placio.co.in` (the noindex rule switches off automatically on the production domain).
4. Admin → Dashboard → *Download sitemap.xml* → replace `public/sitemap.xml` → commit & push (Google Search Console: submit it; your `googlee00f…html` verification file is already in `public/`).
5. Old Vercel env vars `FIREBASE_ADMIN_*` are no longer needed anywhere — delete them, and **rotate the old Admin SDK key** (Google Cloud → IAM → Service accounts → Keys).

## F. Everyday operation

* New jobs: Admin → **Excel** (validate → commit) or **Add job**. The public list updates itself; visitors see it within ~5 minutes (cache).
* Edited jobs directly in the Firebase console? Admin → Dashboard → **Rebuild job index**.
* Content changes (departments, cities, labels): edit `public/js/site-config.js` → `npm test` → `git push` (Vercel redeploys automatically).

## G. Free-plan (Spark) limits to know

| Limit | Spark | What Placio uses |
|---|---|---|
| Firestore reads / day | 50,000 | new visitor = 3 reads (1 meta + 2 job-list documents, ~0.5 MB), then cached; opening a job = 1 read |
| Firestore writes / day | 20,000 | an Excel import of N new jobs ≈ N writes (re-importing identical rows = 0) |
| Firestore data egress | 10 GiB / month | ~0.5 MB per new visitor ⇒ ~20,000 new visitors / month |

If traffic outgrows this, upgrade to Blaze, enable Storage, set `FEATURES.indexInStorage = true`, and publish again — nothing else changes.

// Tiny dependency-free dev server that behaves like Firebase Hosting (clean URLs, rewrites, 404 page, headers).
//
//   node dev/server.mjs            -> serves ./public against your REAL Firebase project
//   node dev/server.mjs --demo     -> same site, but with a fake in-browser database (4,000 demo jobs),
//                                     so you can try everything — including the admin panel — without touching production.
//                                     Demo admin login:  admin@demo.test / demo1234
//
// Options: --port=5173   --jobs=4000 (demo size, applied when the demo DB is first created)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const demo = "demo" in args;
const emulator = "emulator" in args; // real SDK + real rules against the local Firebase emulators (see README / tests)
const port = Number(args.port || 5173);

const firebaseJson = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
// Firebase Hosting glob -> RegExp (supports **, *, and @(a|b) which is all firebase.json uses)
function globToRe(g) {
  let re = "";
  for (let i = 0; i < g.length;) {
    if (g.startsWith("**/", i)) { re += "(?:.*/)?"; i += 3; }
    else if (g.startsWith("**", i)) { re += ".*"; i += 2; }
    else if (g[i] === "*") { re += "[^/]*"; i++; }
    else if (g.startsWith("@(", i)) { const j = g.indexOf(")", i); re += "(" + g.slice(i + 2, j) + ")"; i = j + 1; }
    else { re += g[i].replace(/[.+^${}()|[\]\\]/g, "\\$&"); i++; }
  }
  return new RegExp("^" + re + "$");
}
const headerRules = firebaseJson.hosting.headers.map((h) => ({ re: globToRe(h.source), headers: h.headers }));
const rewrites = firebaseJson.hosting.rewrites.map((r) => ({ re: globToRe(r.source), to: r.destination }));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".xlsx": "application/octet-stream" };

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/\/+$/, "") || "/";
  const attempt = (p) => {
    const f = path.join(pub, p);
    if (!f.startsWith(pub)) return null; // path traversal guard
    return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
  };
  if (demo && clean === "/js/firebase.js") return path.join(root, "dev", "fake-firebase.js");
  if (demo && clean.startsWith("/__test__/")) { const f = path.join(root, "tests", "test-data", path.basename(clean)); return fs.existsSync(f) ? f : null; } // sample .xlsx files for manual/browser testing
  return attempt(clean) || attempt(clean + ".html") || attempt(path.join(clean, "index.html"));
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = resolveFile(url.pathname);
  let status = 200;
  if (!file) {
    const rw = rewrites.find((r) => r.re.test(url.pathname));
    if (rw) file = resolveFile(rw.to);
  }
  if (!file) { file = path.join(pub, "404.html"); status = 404; }
  const ext = path.extname(file);
  const headers = { "Content-Type": TYPES[ext] || "application/octet-stream" };
  for (const r of headerRules) if (r.re.test(url.pathname)) for (const h of r.headers) headers[h.key] = h.value;
  if (demo || emulator) headers["Cache-Control"] = "no-store"; // always fresh while developing
  if (emulator && headers["Content-Security-Policy"]) {
    // emulators speak plain http on localhost: relax ONLY those bits of the CSP, and only in this dev mode
    headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace("connect-src ", "connect-src http://127.0.0.1:8080 http://127.0.0.1:9099 http://127.0.0.1:9199 ws://127.0.0.1:8080 ").replace("; upgrade-insecure-requests", "");
    delete headers["Strict-Transport-Security"];
  }
  res.writeHead(status, headers);
  fs.createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`\n  Placio dev server  http://localhost:${port}   ${demo ? "(DEMO mode: fake database, admin@demo.test / demo1234)" : "(REAL Firebase project)"}\n`);
  if (!demo && !emulator) {
    console.log("  First time on the real project?  Jobs only appear after BOTH of these:");
    console.log("    1) firebase deploy --only firestore:rules               (the new security rules)");
    console.log("    2) Admin -> Dashboard -> Rebuild job index              (publishes your existing jobs)");
    console.log("  Not sure what is wrong?  Admin -> Dashboard -> Setup check tells you.\n");
  }
});

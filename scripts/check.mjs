// Static project checks:  npm run check
//   - every .js/.mjs file parses (node --check)
//   - no inline <script> / inline event handlers in HTML (the Content-Security-Policy forbids them)
//   - colours are defined ONLY in the :root token blocks of css/style.css
//   - no secrets (private keys / service-account JSON) anywhere in the project
//   - no innerHTML assignment of a template that interpolates a value without esc()/number formatting (heuristic)
//   - only allowed external origins are referenced
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const walk = (d, out = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(f.name)) continue;
    const p = path.join(d, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const files = walk(root);
const rel = (p) => path.relative(root, p).replaceAll("\\", "/");
let problems = 0;
const bad = (msg) => { problems++; console.error("  ✖ " + msg); };

console.log("Syntax");
for (const f of files.filter((f) => /\.(js|mjs)$/.test(f) && !f.includes("vendor"))) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch (e) { bad(`${rel(f)}: ${String(e.stderr).split("\n").slice(0, 3).join(" ")}`); }
}

console.log("HTML (CSP-safe)");
for (const f of files.filter((f) => f.endsWith(".html") && f.includes("public"))) {
  const t = fs.readFileSync(f, "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(t)) bad(`${rel(f)}: inline <script>`);
  if (/\son(click|load|error|submit|change|input)\s*=/i.test(t)) bad(`${rel(f)}: inline event handler`);
  if (/<link[^>]+href="https?:\/\/(?!placio\.co\.in)/i.test(t)) bad(`${rel(f)}: external stylesheet/link`);
}

console.log("Colours only in tokens");
for (const f of files.filter((f) => /public\/(css|js)\//.test(f.replaceAll("\\", "/")) && /\.(css|js)$/.test(f))) {
  const t = fs.readFileSync(f, "utf8");
  const name = rel(f);
  if (name.endsWith("css/style.css")) {
    // allow hex colours inside the two :root blocks, the dark :root block and the data-URI chevron
    const stripped = t.replace(/:root\s*\{[\s\S]*?\n\}/g, "").replace(/html\.dark\s*\{[\s\S]*?\n\}/g, "").replace(/url\("data:[^"]*"\)/g, "");
    const m = stripped.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (m) bad(`${name}: hex colours outside token blocks: ${[...new Set(m)].slice(0, 5).join(", ")}`);
  } else if (name.endsWith(".css")) {
    const m = t.match(/#[0-9a-fA-F]{3,8}\b(?![^{]*\})/g) || t.match(/(?<![&\w])#[0-9a-fA-F]{6}\b/g);
    // components.css has one deliberate dark gradient panel (final call-to-action) + its light text
    const allowed = new Set(["#3b2a20", "#1d1511", "#f5efe6", "#efe6d6", "#f3e6c8"]);
    const extra = (m || []).filter((c) => !allowed.has(c.toLowerCase()));
    if (extra.length) bad(`${name}: stray hex colours: ${[...new Set(extra)].slice(0, 5).join(", ")}`);
  }
}

console.log("Secrets");
for (const f of files) {
  if (/\.(png|woff2|xlsx)$/i.test(f) || f.includes("vendor") || rel(f) === "scripts/check.mjs") continue;
  const t = fs.readFileSync(f, "utf8");
  if (/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(t)) bad(`${rel(f)}: contains a private key`);
  if (/"private_key"\s*:/.test(t) && !rel(f).startsWith("scripts/")) bad(`${rel(f)}: looks like a service-account file`);
  if (/\.env/.test(path.basename(f)) && !/example/.test(f)) bad(`${rel(f)}: env file present`);
}

console.log("Unescaped template values (heuristic)");
const SAFE = /^(esc\(|i\b|n\b|r\.|Number|Math\.|icons\.|c\.|\d|slice|jobCardHtml|avatarHtml|stat\(|pager\(|tab\(|bars\(|saveButtonHtml|shareButtonHtml|skeletonCards|applyButton|recCards|fieldHtml|optHtml|row\(|id\b|ph\b|label\b|f\.list|extra|meta\b|total|count|page|pages|rows\.length|list\.length|kind|cls\b|rest|active\b|mode\b|key\b|name\b)/;
for (const f of files.filter((f) => /public\/js\/.*\.js$/.test(f.replaceAll("\\", "/")))) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((ln, i) => {
    if (!/(innerHTML|insertAdjacentHTML)/.test(ln) && !/`[^`]*<[a-z]/.test(ln)) return;
    for (const m of ln.matchAll(/\$\{([^}]+)\}/g)) {
      const expr = m[1].trim();
      if (SAFE.test(expr) || /esc\(/.test(expr) || /\.map\(|\.join\(|\?\s*[`"']/.test(expr) || /^[\w.]+\s*\?/.test(expr)) continue;
      if (/^(\w+\.)?(\w+)$/.test(expr) && /^(sub|href|msg|t|text|note|verb|body|cls|hint|phase|label|status|via|action|id|n)$/i.test(expr.split(".").pop())) continue;
      console.log(`  ? ${rel(f)}:${i + 1}  \${${expr.slice(0, 50)}}`);
    }
  });
}

console.log("Hosting config parity (vercel.json vs firebase.json)");
try {
  const v = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const f = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
  const fg = f.hosting.headers.find((h) => h.source === "**").headers;
  const vg = v.headers.find((h) => h.source === "/(.*)" && !h.missing).headers;
  if (JSON.stringify(fg) !== JSON.stringify(vg)) bad("security headers differ between firebase.json and vercel.json");
  const need = ["/jobs/:slug", "/admin/jobs/new", "/admin/jobs/:id/edit"];
  for (const s of need) if (!v.rewrites.some((r) => r.source === s)) bad("vercel.json is missing rewrite " + s);
  if (v.outputDirectory !== "public") bad("vercel.json outputDirectory must be public");
  if (!v.headers.some((h) => h.missing && JSON.stringify(h.missing).includes("placio")) ) bad("vercel.json lost the noindex-on-test-domains rule");
  if (!/script-src 'self' https:\/\/www\.gstatic\.com;/.test(vg.find((h) => h.key === "Content-Security-Policy").value)) bad("CSP script-src changed unexpectedly");
} catch (e) {
  bad("vercel.json / firebase.json not readable: " + e.message);
}

console.log(problems ? `\n${problems} problem(s).` : "\nAll checks passed.");
process.exit(problems ? 1 : 0);

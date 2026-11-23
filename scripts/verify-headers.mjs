// Checks that the live site sends the security headers we rely on.
// Usage: node scripts/verify-headers.mjs https://www.placio.co.in
// On a push to main, Vercel may still be deploying, so a failed check is retried a few times.
const targetUrl = process.argv[2] || "https://www.placio.co.in";
const RETRIES = 4;
const WAIT_MS = 30_000;

const required = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "content-security-policy",
];

async function check() {
  const res = await fetch(targetUrl, { method: "GET", redirect: "follow" });
  const problems = [];
  for (const h of required) {
    if (!res.headers.get(h)) problems.push(`MISSING REQUIRED HEADER: ${h}`);
  }
  if (res.headers.get("x-powered-by")) {
    problems.push(`INFO LEAK: x-powered-by is exposed (${res.headers.get("x-powered-by")})`);
  }
  return problems;
}

for (let attempt = 1; attempt <= RETRIES; attempt++) {
  let problems;
  try {
    problems = await check();
  } catch (e) {
    problems = [`COULD NOT REACH ${targetUrl}: ${e.message}`];
  }
  if (!problems.length) {
    console.log(`PASS: all required security headers verified on ${targetUrl}`);
    process.exit(0);
  }
  problems.forEach((p) => console.error(p));
  if (attempt < RETRIES) {
    console.error(`Attempt ${attempt}/${RETRIES} failed. Retrying in ${WAIT_MS / 1000}s...`);
    await new Promise((r) => setTimeout(r, WAIT_MS));
  }
}
process.exit(1);

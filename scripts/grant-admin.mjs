// Gives (or removes) the "admin" permission on a Firebase Auth account. Run this on YOUR computer only — never deploy it.
//
//   1. Create the admin account first: Firebase console → Authentication → Users → Add user (email + password).
//   2. Firebase console → Project settings → Service accounts → Generate new private key → save the JSON file
//      OUTSIDE this project folder (for example in your Documents folder). NEVER commit or share it.
//   3. Run:
//        node scripts/grant-admin.mjs  C:\path\to\service-account.json  you@example.com
//      (to remove admin rights:  add  --revoke  at the end)
//   4. Sign out of the admin panel and sign in again so the new permission is picked up.
//
// Zero dependencies: it signs a Google token with the key file and calls the Identity Toolkit REST API directly.
import fs from "node:fs";
import crypto from "node:crypto";

const [keyPath, email, flag] = process.argv.slice(2);
if (!keyPath || !email) {
  console.error("Usage: node scripts/grant-admin.mjs <service-account.json> <email> [--revoke]");
  process.exit(1);
}
const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Could not get an access token: " + JSON.stringify(j));
  return j.access_token;
}

const token = await accessToken();
const base = `https://identitytoolkit.googleapis.com/v1/projects/${key.project_id}`;
const call = async (path, body) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j.error || j));
  return j;
};

const found = await call("/accounts:lookup", { email: [email] });
const user = found.users?.[0];
if (!user) {
  console.error(`No account with email ${email} in project ${key.project_id}. Create it first in Firebase console → Authentication → Users.`);
  process.exit(1);
}
const attrs = JSON.parse(user.customAttributes || "{}");
if (flag === "--revoke") delete attrs.admin; else attrs.admin = true;
await call("/accounts:update", { localId: user.localId, customAttributes: JSON.stringify(attrs) });
console.log(`${flag === "--revoke" ? "Removed admin rights from" : "Granted admin rights to"} ${email} (project ${key.project_id}).`);
console.log("Now sign out and back in on the admin page.");

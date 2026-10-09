// Security-rules tests against the REAL Firebase emulators and the REAL firestore.rules / storage.rules files.
// Needs Java + `npm i -D firebase-tools @firebase/rules-unit-testing`, then:   npm run test:rules
import test, { before, after } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, setDoc as set, updateDoc, deleteDoc, getDocs, collection, query, where, limit, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const root = new URL("../../", import.meta.url);
let env;
const goodJob = (id, over = {}) => ({ jobId: id, title: "Engineer", company: "Acme", status: "active", link: "https://acme.com/x", desc: "hello", ...over });
const day = () => new Date().toISOString().slice(0, 10).replaceAll("-", "");

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-placio",
    firestore: { rules: readFileSync(new URL("firestore.rules", root), "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync(new URL("storage.rules", root), "utf8"), host: "127.0.0.1", port: 9199 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, "jobs/J1"), goodJob("J1"));
    await setDoc(doc(d, "jobs/J2"), goodJob("J2", { status: "removed" }));
    await setDoc(doc(d, "meta/index"), { version: 1, total: 2 });
    await setDoc(doc(d, "jobIndex/c0"), { d: "{}" });
    await setDoc(doc(d, "adminIndex/h0"), { d: "[]" });
    await setDoc(doc(d, "adminActivity/a1"), { action: "x", actorEmail: "a", detail: {}, at: 1 });
    await setDoc(doc(d, "jobReports/R1"), { jobId: "J1", reason: "Other", at: Date.now() });
  });
});
after(async () => env?.cleanup());

const anon = () => env.unauthenticatedContext().firestore();
const user = () => env.authenticatedContext("u1", { email: "someone@gmail.com" }).firestore();
const fakeAdminEmail = () => env.authenticatedContext("u2", { email: "placio.jobs@gmail.com", email_verified: true }).firestore(); // right email, NO claim
const admin = () => env.authenticatedContext("a1", { admin: true, email: "placio.jobs@gmail.com" }).firestore();

test("public: may read one job (active or removed), the meta doc and index chunks", async () => {
  await assertSucceeds(getDoc(doc(anon(), "jobs/J1")));
  await assertSucceeds(getDoc(doc(anon(), "jobs/J2")));
  await assertSucceeds(getDoc(doc(anon(), "meta/index")));
  await assertSucceeds(getDoc(doc(anon(), "jobIndex/c0")));
});

test("public: may NOT list/scrape collections", async () => {
  await assertFails(getDocs(collection(anon(), "jobs")));
  await assertFails(getDocs(query(collection(anon(), "jobs"), where("status", "==", "active"), limit(5))));
  await assertFails(getDocs(collection(anon(), "jobIndex")));
  await assertFails(getDocs(collection(anon(), "meta")));
});

test("public / signed-in non-admin / right-email-without-claim: cannot write anything privileged", async () => {
  for (const d of [anon(), user(), fakeAdminEmail()]) {
    await assertFails(setDoc(doc(d, "jobs/HACK"), goodJob("HACK")));
    await assertFails(setDoc(doc(d, "jobs/J1"), goodJob("J1", { title: "defaced" })));
    await assertFails(updateDoc(doc(d, "jobs/J1"), { status: "removed" }));
    await assertFails(deleteDoc(doc(d, "jobs/J1")));
    await assertFails(setDoc(doc(d, "meta/index"), { version: 99, total: 0 }));
    await assertFails(setDoc(doc(d, "jobIndex/c0"), { d: "evil" }));
    await assertFails(setDoc(doc(d, "adminIndex/h0"), { d: "evil" }));
    await assertFails(setDoc(doc(d, "adminActivity/x"), { action: "x", actorEmail: "a", detail: {}, at: 1 }));
    await assertFails(getDoc(doc(d, "adminIndex/h0")));
    await assertFails(getDoc(doc(d, "adminActivity/a1")));
    await assertFails(getDoc(doc(d, "jobReports/R1")));
    await assertFails(getDocs(collection(d, "jobReports")));
  }
});

test("public: anonymous job report is create-only and strictly shaped", async () => {
  const d = anon();
  const id = `J1__${day()}__0`;
  const good = { jobId: "J1", reason: "Incorrect information", at: Date.now() };
  await assertSucceeds(setDoc(doc(d, "jobReports", id), good));
  await assertFails(setDoc(doc(d, "jobReports", id), good), "second report same job/reason/day is rejected (no spam)");
  await assertFails(updateDoc(doc(d, "jobReports", id), { reason: "Other" }));
  await assertFails(deleteDoc(doc(d, "jobReports", id)));
  await assertFails(setDoc(doc(d, "jobReports", `J1__${day()}__1`), { ...good, reason: "made up reason" }));
  await assertFails(setDoc(doc(d, "jobReports", `J1__${day()}__2`), { ...good, extra: "x".repeat(1000) }));
  await assertFails(setDoc(doc(d, "jobReports", `J1__${day()}__3`), { ...good, at: 1 }));
  await assertFails(setDoc(doc(d, "jobReports", `J1__${day()}__4`), { ...good, at: String(Date.now()) }));
  await assertFails(setDoc(doc(d, "jobReports", "random-id"), good));
  await assertFails(setDoc(doc(d, "jobReports", `OTHER__${day()}__0`), good), "id must match the reported job");
  await assertFails(setDoc(doc(d, "jobReports", `J1__${day()}__9`), good));
});

test("admin (signed claim): can manage jobs, index, activity; schema is enforced even for admins", async () => {
  const d = admin();
  await assertSucceeds(setDoc(doc(d, "jobs/A1"), goodJob("A1")));
  await assertSucceeds(setDoc(doc(d, "jobs/A1"), { status: "removed", updatedAt: 1 }, { merge: true }));
  await assertSucceeds(getDocs(query(collection(d, "jobs"), where("status", "==", "removed"), limit(5))));
  await assertSucceeds(setDoc(doc(d, "meta/index"), { version: 2, total: 1 }));
  await assertSucceeds(setDoc(doc(d, "jobIndex/c0"), { d: "{}" }));
  await assertSucceeds(setDoc(doc(d, "adminIndex/h0"), { d: "[]" }));
  await assertSucceeds(getDoc(doc(d, "adminIndex/h0")));
  await assertSucceeds(setDoc(doc(d, "adminActivity/n1"), { action: "x", actorEmail: "a", detail: { n: 1 }, at: 1 }));
  await assertFails(setDoc(doc(d, "adminActivity/n2"), { action: "x", actorEmail: "a", detail: {}, at: 1, sneaky: true }));
  await assertFails(updateDoc(doc(d, "adminActivity/n1"), { action: "edited" }), "audit log is append-only");
  await assertFails(deleteDoc(doc(d, "adminActivity/n1")));
  await assertSucceeds(getDocs(collection(d, "jobReports")));
  await assertSucceeds(deleteDoc(doc(d, "jobReports/R1")));
  // schema guards
  await assertFails(setDoc(doc(d, "jobs/B1"), goodJob("B1", { status: "weird" })));
  await assertFails(setDoc(doc(d, "jobs/B2"), goodJob("B2", { title: "" })));
  await assertFails(setDoc(doc(d, "jobs/B3"), goodJob("B3", { jobId: "different" })));
  await assertFails(setDoc(doc(d, "jobs/B4"), goodJob("B4", { link: "javascript:alert(1)" })));
  await assertFails(setDoc(doc(d, "jobs/B 5"), goodJob("B 5")));
  await assertFails(setDoc(doc(d, "jobs/B6"), goodJob("B6", { desc: "x".repeat(30001) })));
  await assertSucceeds(setDoc(doc(d, "jobs/B7"), goodJob("B7", { link: "" })));
  // everything else is closed, even to admins
  await assertFails(setDoc(doc(d, "randomCollection/x"), { a: 1 }));
  await assertFails(getDoc(doc(d, "randomCollection/x")));
});

// ── Storage ──
const bytes = () => new TextEncoder().encode("{}");
const stAnon = () => env.unauthenticatedContext().storage();
const stAdmin = () => env.authenticatedContext("a1", { admin: true }).storage();
const stUser = () => env.authenticatedContext("u1", {}).storage();

test("storage: only admins may create index/vN.json (json, small); anyone may read; versions are immutable", async () => {
  const json = { contentType: "application/json" };
  await assertSucceeds(uploadBytes(ref(stAdmin(), "index/v1.json"), bytes(), json));
  await assertFails(uploadBytes(ref(stAdmin(), "index/v1.json"), bytes(), json), "no overwrite");
  await assertFails(uploadBytes(ref(stAdmin(), "index/evil.html"), bytes(), json), "bad name");
  await assertFails(uploadBytes(ref(stAdmin(), "index/v2.json"), bytes(), { contentType: "text/html" }), "bad type");
  await assertFails(uploadBytes(ref(stAdmin(), "other/v3.json"), bytes(), json), "other paths closed");
  await assertFails(uploadBytes(ref(stAnon(), "index/v9.json"), bytes(), json));
  await assertFails(uploadBytes(ref(stUser(), "index/v9.json"), bytes(), json));
  await assertSucceeds(getBytes(ref(stAnon(), "index/v1.json")));
  await assertFails(deleteObject(ref(stAnon(), "index/v1.json")));
  await assertFails(deleteObject(ref(stUser(), "index/v1.json")));
  await assertSucceeds(deleteObject(ref(stAdmin(), "index/v1.json")));
});

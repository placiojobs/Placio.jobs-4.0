import test from "node:test";
import assert from "node:assert/strict";
import { DEPARTMENT_PAGES, DEPARTMENT_GROUPS } from "../public/js/site-config.js";

test("department groups: every group entry belongs to its page, and none is listed twice", () => {
  for (const [slug, groups] of Object.entries(DEPARTMENT_GROUPS)) {
    const page = DEPARTMENT_PAGES.find((p) => p.slug === slug);
    assert.ok(page, `group config for unknown page ${slug}`);
    const seen = new Set();
    for (const g of groups) for (const d of g.depts) {
      assert.ok(page.depts.includes(d), `${d} is not a ${slug} department`);
      assert.ok(!seen.has(d), `${d} appears in two groups`);
      seen.add(d);
    }
  }
});

test("software-it: all 54 specialisations are grouped (nothing falls into 'Other roles')", () => {
  const page = DEPARTMENT_PAGES.find((p) => p.slug === "software-it");
  const grouped = new Set(DEPARTMENT_GROUPS["software-it"].flatMap((g) => g.depts));
  assert.deepEqual(page.depts.filter((d) => !grouped.has(d)), []);
});

# Test Data

**These are TEST DATA files, not real job listings.** Every company name
("TestCorp Technologies", "SampleData Analytics", "Placio Test
Industries"), job link, and description here is fictional, generated for
testing the Excel import/validation pipeline. Do not treat any of it as
real production data, and delete it from your live database if you ever
import it there by mistake (Job IDs are prefixed `TD` specifically so
they're easy to find and bulk-delete later).

Regenerate any of these at any time with:
```bash
npx tsx scripts/generate-test-data.ts
```

## Files

### `valid-sample.xlsx` (10 rows)
A clean file that should import with **zero errors**. Deliberately covers
every case called out in the hard-testing brief:
- Experience formats: `Fresher`, `0`, `0-1`, `1-2`, `2-4`, `5-7`, `8-10`, `12+`
- Multiple departments (Software, Data Analyst, Sales, Design, ...)
- Multiple cities, including `Remote`
- Blank `salary` (rows 2, 5, 10) and blank `skill_set` (rows 2, 5, 9, 10) —
  confirms optional fields don't get flagged as errors and don't render
  empty UI blocks on the job card
- A long, multi-sentence description (row 1) — confirms long text doesn't
  break the layout
- The same company appearing multiple times under different Job IDs

**Use this to test:** Admin → Excel Import → upload this file → should
show "10 valid, 0 errors" and let you commit immediately.

### `invalid-sample.xlsx` (6 rows, 5 deliberately broken)
Row 1 is a valid control row (to confirm the validator doesn't
over-flag). Rows 2–6 each break exactly one rule:

| Row | What's wrong | Expected error |
|---|---|---|
| 2 | Blank Job ID | "Job ID is required." |
| 3 | Duplicate Job ID (same as row 1) | "Duplicate Job ID — already used on row 2." |
| 4 | Unparseable experience ("a couple of years") | "Unsupported experience format..." |
| 5 | Invalid URL ("not-a-real-url") | "Invalid URL format..." |
| 6 | Blank location (required field) | "Location is required." |

**Use this to test:** Admin → Excel Import → upload this file → should
show "1 valid, 5 errors" with all 5 issues listed, and the Commit button
should be disabled until you fix them and re-upload.

### `large-sample-500-rows.xlsx` (500 rows)
All valid — exercises the 500-row batch-import path end-to-end against a
real Firebase project (this is exactly the PROMPT 4 §12 "500-row" test
case). About a third of rows have blank salary/skill_set to keep testing
the optional-field behaviour at scale too.

**Use this to test:** Admin → Excel Import → Full Sync mode → upload this
file → should show "500 valid, 0 errors" → commit → should process in a
single batch (since it's exactly at, not over, the 500-row batch size)
and the change summary should read "Added: 500".

## What was actually verified in this session (without a live Firebase project)

All three files were run through the real `parseAndValidateExcel()`
pipeline (not just eyeballed) and confirmed to produce exactly the
row/error counts documented above — see
`scripts/generate-test-data.ts` to regenerate, and
`scripts/smoketest-excel-scale.ts` for the equivalent automated test.
**Not yet verified**: actually uploading these through the live `/admin/excel`
UI against a real Firestore project, since this session had no live
Firebase credentials available. That's the first thing to try once you
complete SETUP.md — see `HARD_TESTING.md` tests `TEST-EXCEL-*`.

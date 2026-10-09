import { normalizeLocation } from "./location.js";
import { parseExperience } from "./experience.js";
import { buildJobSlug } from "./slug.js";

/** The 11 Excel columns — the ONLY public contract of the import/export. */
export const EXCEL_COLUMNS = ["Job ID", "title", "company", "location", "salary", "exp", "type", "dept", "link", "desc", "skill_set"];

/** Fields that must be filled. Everything else may be blank. */
export const REQUIRED_FIELDS = ["jobId", "title", "company"];

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function normalizeUrl(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/**
 * Placeholder text that means "not provided": "—", "-", "N/A", "Not specified", "None"…
 * Treated exactly like a blank cell, so the UI omits the field instead of showing "₹ —".
 */
const PLACEHOLDER = /^(?:[\s\-\u2010-\u2015\u2212_.?]*|n\s*\/\s*a|na|nil|none|null|undisclosed|tbd|unknown|not\s+(?:specified|disclosed|available|mentioned|provided|applicable))$/i;
export function blankIfPlaceholder(v) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return PLACEHOLDER.test(s) ? "" : s;
}

/** True for http(s) URLs with a real hostname. Blank is NOT checked here. */
export function isValidUrl(value) {
  try {
    const u = new URL(normalizeUrl(value));
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Builds the Firestore job document from a validated raw row.
 * Same shape the previous Next.js version stored, so existing data keeps
 * working. Blank optional fields are stored as undefined-free (omitted).
 */
export function normalizeJobRow(row, opts = {}) {
  const jobId = String(row.jobId ?? "").trim();
  const title = collapse(row.title);
  const company = collapse(row.company);
  const location = normalizeLocation(collapse(row.location));
  const dept = collapse(row.dept);
  const expText = blankIfPlaceholder(row.exp);
  const link = normalizeUrl(collapse(row.link));
  const desc = collapse(row.desc);
  const salary = blankIfPlaceholder(row.salary);
  const type = blankIfPlaceholder(row.type);
  const skillSet = blankIfPlaceholder(row.skill_set);

  const range = parseExperience(expText);
  const normalizedSkills = skillSet ? skillSet.split(/[,;/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const searchableText = [title, company, location, dept, skillSet, desc].filter(Boolean).join(" ").toLowerCase();
  const now = opts.createdAt ?? Date.now();

  const doc = {
    jobId, title, company, location, exp: expText, dept, link,
    slug: buildJobSlug(jobId, title, company),
    normalizedTitle: title.toLowerCase(),
    normalizedCompany: company.toLowerCase(),
    normalizedLocation: location.toLowerCase(),
    normalizedDept: dept.toLowerCase(),
    experienceMin: range ? range.min : null,
    experienceMax: range ? range.max : null,
    isFresher: range ? range.isFresher : false,
    searchableText,
    normalizedSkills,
    status: opts.status ?? "active",
    createdAt: now,
    updatedAt: Date.now(),
  };
  // Optional fields: only present when the admin actually provided a value,
  // so the UI never has to render an empty row for them.
  if (salary) doc.salary = salary;
  if (type) doc.type = type;
  if (desc) doc.desc = desc;
  if (skillSet) doc.skillSet = skillSet;
  return doc;
}

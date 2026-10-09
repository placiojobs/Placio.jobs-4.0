/**
 * Job URL identity. A slug always STARTS with the Job ID (Job IDs may only
 * contain letters, digits and underscores — enforced by the validator), so
 * /jobs/<slug> keeps working after a title/company edit: the page only reads
 * the part before the first "-" and ignores the readable suffix.
 */
export function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function buildJobSlug(jobId, title, company) {
  const readable = slugify(`${title}-${company}`);
  return readable ? `${jobId}-${readable}` : jobId;
}

export function parseJobIdFromSlug(slug) {
  return String(slug ?? "").split("-")[0];
}

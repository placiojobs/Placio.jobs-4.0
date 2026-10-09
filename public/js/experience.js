/**
 * Experience normalization (single source of truth).
 *
 * Turns the free-text "exp" cell from Excel into a numeric [min, max] range
 * once, at import time. The browse filter then compares numbers — it never
 * re-parses text. The original text is always kept for display.
 *
 * Accepted (case-insensitive): Fresher, Freshers, Entry level, 0, 0 yrs,
 * 0-1, 0 – 1, 1 to 3, 1-2 years, 2 years, 3+, 3 plus, 5+ yrs, 1.5-3,
 * "Fresher-2" (treated as 0-2).
 * Blank is valid (unknown experience). Anything else is "unparseable":
 * the validator raises a WARNING and the job simply isn't matched by
 * numeric experience filters.
 */

const FRESHER_WORDS = new Set([
  "fresher", "freshers", "fresher/entry level", "entry level", "entry-level", "fresh graduate", "graduate trainee",
]);

/** @returns {{min:number,max:number|null,isFresher:boolean}|null} null = cannot parse */
export function parseExperience(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;

  if (FRESHER_WORDS.has(text)) return { min: 0, max: 0, isFresher: true };

  let t = text
    .replace(/[–—−]/g, "-") // en dash, em dash, minus sign
    .replace(/freshers?/g, "0") // "fresher-2" -> "0-2"
    .replace(/\bplus\b/g, "+")
    .replace(/\b(years?|yrs?|y)\b\.?/g, " ")
    .replace(/\s*\bto\b\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\+/g, "+");

  const num = "(\\d+(?:\\.\\d+)?)";

  let m = t.match(new RegExp(`^${num}\\+$`));
  if (m) {
    const min = parseFloat(m[1]);
    return { min, max: null, isFresher: min === 0 };
  }
  m = t.match(new RegExp(`^${num}-${num}$`));
  if (m) {
    const min = parseFloat(m[1]);
    const max = parseFloat(m[2]);
    if (max < min) return null;
    return { min, max, isFresher: min === 0 };
  }
  m = t.match(new RegExp(`^${num}$`));
  if (m) {
    const v = parseFloat(m[1]);
    return { min: v, max: v, isFresher: v === 0 };
  }
  return null;
}

/**
 * Does a stored range satisfy a UI filter token ("Fresher" or "1".."30")?
 * A numeric token matches when it falls inside [min, max] (or >= min when
 * max is null). Unknown experience (min === null) matches nothing — we never
 * invent experience requirements the admin did not provide.
 */
export function matchesExperienceToken(range, token) {
  const t = String(token).trim().toLowerCase();
  if (range.min === null || range.min === undefined) return false;
  if (t === "fresher") return !!range.isFresher;
  const year = parseFloat(t);
  if (Number.isNaN(year)) return false;
  if (range.max === null || range.max === undefined) return year >= range.min;
  return year >= range.min && year <= range.max;
}

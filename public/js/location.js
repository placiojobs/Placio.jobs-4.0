import { LOCATION_ALIASES, MAJOR_LOCATIONS } from "./site-config.js";

/**
 * Normalizes a free-text location into a canonical MAJOR_LOCATIONS entry
 * where a known alias exists (Bangalore -> Bengaluru, Gurugram -> Gurgaon...).
 * Unknown cities are trimmed/title-cased and passed through as-is rather
 * than forced into "Other", so genuinely different cities are never merged.
 */
export function normalizeLocation(raw) {
  const trimmed = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const alias = LOCATION_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const exact = MAJOR_LOCATIONS.find((l) => l.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  return trimmed.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}


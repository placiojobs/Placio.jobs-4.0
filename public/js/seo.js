/**
 * Per-job SEO. NOTE: this is a static site, so these tags are set by JavaScript after the job loads.
 * Google renders JavaScript and reads them; crawlers that don't run JS (many social-link previewers:
 * WhatsApp, Instagram, Facebook, Slack) will only see the generic page tags in job.html.
 * Everything here is built from real job fields only — nothing is invented.
 */
import { SITE } from "./site-config.js";
import { setMeta, setCanonical } from "./utils.js";

export const jobCanonicalUrl = (slug) => `${SITE.url}/jobs/${slug}`;

export function buildJobTitle(job) {
  return `${job.title} at ${job.company}${job.location ? ` — ${job.location}` : ""} | ${SITE.name}`;
}

export function buildJobDescription(job) {
  const base = [job.title, `at ${job.company}`, job.location && `in ${job.location}`, job.exp && `(${job.exp} experience)`].filter(Boolean).join(" ");
  if (job.desc) return `${base}. ${job.desc.length > 140 ? job.desc.slice(0, 137) + "..." : job.desc}`;
  return `${base}. Apply on ${SITE.name}.`;
}

/** schema.org JobPosting — optional properties are omitted rather than faked. */
export function buildJobPostingSchema(job) {
  const s = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.desc || `${job.title} at ${job.company}${job.location ? `, ${job.location}` : ""}.`,
    identifier: { "@type": "PropertyValue", name: SITE.name, value: job.jobId },
    hiringOrganization: { "@type": "Organization", name: job.company },
    url: jobCanonicalUrl(job.slug),
  };
  if (job.createdAt) s.datePosted = new Date(job.createdAt).toISOString();
  if (job.location) s.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location, addressCountry: "IN" } };
  if (job.type && job.type.toLowerCase() === "remote") {
    s.jobLocationType = "TELECOMMUTE";
    s.applicantLocationRequirements = { "@type": "Country", name: "IN" };
  }
  return s;
}

export function applyJobSeo(job) {
  const title = buildJobTitle(job);
  const description = buildJobDescription(job);
  const url = jobCanonicalUrl(job.slug);
  document.title = title;
  setMeta("description", description);
  setCanonical(url);
  setMeta("robots", "index, follow");
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", url, "property");
  setMeta("twitter:title", title);
  setMeta("twitter:description", description);
  let ld = document.getElementById("jobposting-ld");
  if (!ld) {
    ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "jobposting-ld";
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(buildJobPostingSchema(job)); // textContent: never parsed as HTML
}

/** Removed / unknown jobs: tell search engines not to index the page. */
export function applyNoIndex(title) {
  document.title = `${title} | ${SITE.name}`;
  setMeta("robots", "noindex, follow");
}

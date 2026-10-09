/**
 * OPTIONAL analytics (Google Analytics 4). Off by default.
 *   - Nothing loads unless ANALYTICS.gaId is set in site-config.js AND the visitor accepted analytics.
 *   - If the script is blocked or fails, the site is unaffected (every call is wrapped).
 *   - Only event names are sent — never search text, names, e-mails or anything the visitor typed.
 */
import { ANALYTICS } from "./site-config.js";
import { getConsent } from "./store.js";

let loaded = false;

export const analyticsConfigured = () => Boolean(ANALYTICS.gaId);

export function syncAnalytics() {
  const id = ANALYTICS.gaId;
  if (!id) return;
  const allowed = getConsent()?.analytics === true;
  window[`ga-disable-${id}`] = !allowed; // GA's documented opt-out switch
  if (!allowed || loaded) return;
  loaded = true;
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  } catch { /* analytics must never break the site */ }
}

/** @param name e.g. "search", "view_job", "save_job", "share_job", "apply_click" */
export function track(name) {
  try {
    if (loaded && window.gtag && getConsent()?.analytics === true) window.gtag("event", name);
  } catch { /* ignore */ }
}

/** Saved Jobs: ids live in localStorage; card data comes from the local job index (no per-job reads). */
import { getSavedIds } from "../store.js";
import { loadIndex } from "../indexLoader.js";
import { jobCardHtml, skeletonCards, stateHtml } from "../ui.js";
import { errorInfo, $ } from "../utils.js";

const root = $("#saved");
const browse = `<a class="btn btn--primary btn--sm" href="/jobs">Browse Jobs</a>`;

async function render() {
  const ids = getSavedIds();
  if (!ids.length) {
    root.innerHTML = stateHtml({ title: "No saved jobs yet.", text: "Tap the star on any job card or job page to save it here for later.", actions: browse });
    return;
  }
  root.innerHTML = skeletonCards(Math.min(ids.length, 6));
  try {
    const { entries } = await loadIndex();
    const byId = new Map(entries.map((e) => [e.jobId, e]));
    const jobs = ids.map((id) => byId.get(id)).filter(Boolean); // removed jobs simply drop out
    const missing = ids.length - jobs.length;
    if (!jobs.length) {
      root.innerHTML = stateHtml({ title: "Your saved jobs are no longer available.", text: "These listings may have been filled or removed since you saved them.", actions: browse });
      return;
    }
    root.innerHTML = `${missing ? `<div class="banner banner--warn" style="margin-bottom:1rem">${missing} saved job${missing > 1 ? "s are" : " is"} no longer available.</div>` : ""}<div class="grid-jobs">${jobs.map(jobCardHtml).join("")}</div>`;
  } catch (e) {
    root.innerHTML = stateHtml({ kind: "error", title: "Couldn’t load your saved jobs", text: errorInfo(e).message, actions: `<button class="btn btn--primary btn--sm" id="retry" type="button">Try again</button>` });
    $("#retry").addEventListener("click", render);
  }
}
// un-saving on this page removes the card immediately
window.addEventListener("placio:saved-changed", (e) => {
  if (e.detail.saved) return;
  document.querySelectorAll(".job-card").forEach((c) => { if (!c.querySelector(`[data-save="${CSS.escape(e.detail.jobId)}"]`)) return; c.remove(); });
  if (!document.querySelector(".job-card")) render();
});
render();

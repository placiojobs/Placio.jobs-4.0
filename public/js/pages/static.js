/** Legal pages: fills the "everything stored" table from the same list the preferences dialog uses (store.js), so they can never disagree. */
import { STORAGE_ITEMS } from "../store.js";
import { esc, $ } from "../utils.js";

const tbody = $("#storage-table tbody");
if (tbody) tbody.innerHTML = STORAGE_ITEMS.map((i) => `<tr><td>${esc(i.key)}</td><td>${esc(i.category)} · ${esc(i.where)}<br>${esc(i.purpose)}</td></tr>`).join("");

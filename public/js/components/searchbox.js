/**
 * Search box with suggestions (departments, cities, job titles, companies).
 * Suggestions are computed locally. Titles/companies need the job index, which is
 * only loaded the first time the visitor actually types (so the homepage stays light).
 */
import { MAJOR_DEPARTMENTS, MAJOR_LOCATIONS } from "../site-config.js";
import { icons } from "../icons.js";
import { esc, debounce } from "../utils.js";
import { loadIndex } from "../indexLoader.js";

const TYPE_LABEL = { dept: "department", location: "city", title: "", company: "" };
let uid = 0;

/**
 * @param {HTMLElement} container empty element to fill
 * @param {{placeholder?:string, value?:string, shortcut?:boolean, onSubmit:(q:string)=>void,
 *          onSelectDept?:(d:string)=>void, onSelectLocation?:(l:string)=>void, getEntries?:()=>object[]|null}} opts
 */
export function mountSearchBox(container, opts) {
  const id = ++uid;
  container.classList.add("searchbox");
  container.innerHTML = `${icons.search.replace("<svg", '<svg class="searchbox__icon"')}
    <input class="input input--pill" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sg-${id}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" aria-label="Search jobs" placeholder="${esc(opts.placeholder || "Search jobs")}">
    ${opts.shortcut ? '<kbd aria-hidden="true">/</kbd>' : ""}
    <ul class="suggest" id="sg-${id}" role="listbox" hidden></ul>`;
  const input = container.querySelector("input");
  const list = container.querySelector(".suggest");
  input.value = opts.value || "";
  let items = [];
  let active = -1;
  let entries = null;
  let loadingIndex = false;

  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const open = () => { list.hidden = false; input.setAttribute("aria-expanded", "true"); };

  function compute(q) {
    const s = q.toLowerCase();
    const out = [];
    MAJOR_DEPARTMENTS.filter((d) => d.toLowerCase().includes(s)).slice(0, 3).forEach((d) => out.push({ type: "dept", label: d }));
    MAJOR_LOCATIONS.filter((l) => l.toLowerCase().includes(s)).slice(0, 3).forEach((l) => out.push({ type: "location", label: l }));
    const e = opts.getEntries?.() || entries;
    if (e) {
      const titles = new Set(), companies = new Set();
      for (const j of e) {
        if (titles.size < 4 && j.title.toLowerCase().includes(s)) titles.add(j.title);
        if (companies.size < 3 && j.normalizedCompany.includes(s)) companies.add(j.company);
        if (titles.size >= 4 && companies.size >= 3) break;
      }
      titles.forEach((t) => out.push({ type: "title", label: t }));
      companies.forEach((c) => out.push({ type: "company", label: c }));
    }
    return out.slice(0, 10);
  }

  function render() {
    list.innerHTML = items.map((s, i) => `<li role="option" id="sg-${id}-${i}" aria-selected="${i === active}"><button type="button" tabindex="-1" class="suggest__item" data-i="${i}">${esc(s.label)}<span class="suggest__type">${TYPE_LABEL[s.type]}</span></button></li>`).join("");
    items.length ? open() : close();
  }

  const update = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { items = []; return close(); }
    if (!opts.getEntries && !entries && !loadingIndex) {
      loadingIndex = true;
      loadIndex().then((r) => { entries = r.entries; if (input.value.trim().length >= 2) { items = compute(input.value.trim()); render(); } }).catch(() => {});
    }
    items = compute(q);
    active = -1;
    render();
  }, 150);

  function pick(s) {
    close();
    if (s.type === "dept" && opts.onSelectDept) return opts.onSelectDept(s.label);
    if (s.type === "location" && opts.onSelectLocation) return opts.onSelectLocation(s.label);
    input.value = s.label;
    opts.onSubmit(s.label);
  }

  input.addEventListener("input", update);
  input.addEventListener("focus", () => items.length && open());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (list.hidden || !items.length) {
      if (e.key === "Enter") { e.preventDefault(); opts.onSubmit(input.value.trim()); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = e.key === "ArrowDown" ? Math.min(active + 1, items.length - 1) : Math.max(active - 1, 0);
      render();
      input.setAttribute("aria-activedescendant", `sg-${id}-${active}`);
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) pick(items[active]);
      else { close(); opts.onSubmit(input.value.trim()); }
    }
  });
  list.addEventListener("mousedown", (e) => e.preventDefault()); // keep input focus while clicking
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) pick(items[Number(b.dataset.i)]);
  });
  document.addEventListener("pointerdown", (e) => { if (!container.contains(e.target)) close(); });

  if (opts.shortcut) {
    // "/" focuses search unless the visitor is already typing somewhere
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
      e.preventDefault();
      input.focus();
    });
  }
  return { input, setValue: (v) => { input.value = v || ""; close(); } };
}

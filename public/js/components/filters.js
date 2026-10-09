/** Filter widgets for Browse Jobs: searchable multi-select list and the experience chips. */
import { esc } from "../utils.js";

const BATCH = 120; // options rendered at a time (the company list can be thousands long)

/**
 * @param {HTMLElement} host
 * @param {{label:string, options:string[], counts?:Map<string,number>, selected?:string[], onChange:(v:string[])=>void}} cfg
 */
export function createMultiSelect(host, cfg) {
  let options = cfg.options;
  let counts = cfg.counts || new Map();
  const selected = new Set(cfg.selected || []);
  let query = "";
  let filtered = options;
  let rendered = 0;

  host.classList.add("multi");
  host.innerHTML = `<div class="multi__head"><div class="field__label">${esc(cfg.label)}</div><button type="button" class="multi__clear" hidden></button></div>
    <input class="input" type="search" placeholder="Search ${esc(cfg.label.toLowerCase())}…" aria-label="Search ${esc(cfg.label.toLowerCase())} filter" autocomplete="off">
    <div class="multi__list" role="group" aria-label="${esc(cfg.label)}"></div>`;
  const clearBtn = host.querySelector(".multi__clear");
  const input = host.querySelector("input");
  const list = host.querySelector(".multi__list");

  const optHtml = (o) => {
    const on = selected.has(o);
    const c = counts.get(o);
    return `<label class="multi__opt ${on ? "is-on" : ""}"><span><input type="checkbox" value="${esc(o)}" ${on ? "checked" : ""}><span>${esc(o)}</span></span>${c !== undefined ? `<span class="multi__count">${c}</span>` : ""}</label>`;
  };
  function renderMore(reset) {
    if (reset) { list.innerHTML = ""; rendered = 0; list.scrollTop = 0; }
    if (!filtered.length) { list.innerHTML = '<div class="multi__none">No matches.</div>'; return; }
    list.insertAdjacentHTML("beforeend", filtered.slice(rendered, rendered + BATCH).map(optHtml).join(""));
    rendered = Math.min(filtered.length, rendered + BATCH);
  }
  function paintHead() {
    clearBtn.hidden = selected.size === 0;
    clearBtn.textContent = `${selected.size} selected · clear`;
  }
  function refilter() {
    const q = query.trim().toLowerCase();
    filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    renderMore(true);
  }

  list.addEventListener("scroll", () => {
    if (rendered < filtered.length && list.scrollTop + list.clientHeight > list.scrollHeight - 80) renderMore(false);
  }, { passive: true });
  list.addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    cb.checked ? selected.add(cb.value) : selected.delete(cb.value);
    cb.closest(".multi__opt").classList.toggle("is-on", cb.checked);
    paintHead();
    cfg.onChange([...selected]);
  });
  input.addEventListener("input", () => { query = input.value; refilter(); });
  clearBtn.addEventListener("click", () => {
    selected.clear();
    list.querySelectorAll("input:checked").forEach((c) => { c.checked = false; c.closest(".multi__opt").classList.remove("is-on"); });
    paintHead();
    cfg.onChange([]);
  });

  refilter();
  paintHead();
  return {
    /** Reflect selection changes that came from the URL / chips (does not fire onChange). */
    setSelected(values) {
      selected.clear();
      values.forEach((v) => selected.add(v));
      list.querySelectorAll("input[type=checkbox]").forEach((c) => {
        c.checked = selected.has(c.value);
        c.closest(".multi__opt").classList.toggle("is-on", c.checked);
      });
      paintHead();
    },
    setOptions(nextOptions, nextCounts) {
      options = nextOptions;
      counts = nextCounts || counts;
      refilter();
    },
  };
}

/** Experience chips ("Fresher", 1…30). */
export function createExperienceField(host, { tokens, selected = [], onChange }) {
  const sel = new Set(selected);
  host.innerHTML = `<div class="field__label" style="margin-bottom:.5rem">Experience</div><div class="exp-chips">${tokens.map((t) => `<button type="button" class="exp-chip" data-t="${esc(t)}" aria-pressed="${sel.has(t)}">${esc(t)}</button>`).join("")}</div>`;
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]");
    if (!b) return;
    const t = b.dataset.t;
    sel.has(t) ? sel.delete(t) : sel.add(t);
    b.setAttribute("aria-pressed", String(sel.has(t)));
    onChange([...sel]);
  });
  return {
    setSelected(values) {
      sel.clear();
      values.forEach((v) => sel.add(v));
      host.querySelectorAll("[data-t]").forEach((b) => b.setAttribute("aria-pressed", String(sel.has(b.dataset.t))));
    },
  };
}

/** Contact page: one-tap copy for the email address. */
import { $ } from "../utils.js";

const TO = "placio.jobs@gmail.com";

const copyBtn = $("#ct-copy");
copyBtn?.addEventListener("click", async () => {
  const toast = copyBtn.parentElement.querySelector(".ct-toast");
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(TO);
    else {
      const t = document.createElement("textarea");
      t.value = TO; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    toast.textContent = "Copied ✓";
    copyBtn.classList.add("is-done");
    toast.classList.add("is-on");
  } catch {
    toast.textContent = "Press Ctrl+C";
    toast.classList.add("is-on");
  }
  setTimeout(() => { toast.classList.remove("is-on"); copyBtn.classList.remove("is-done"); }, 2000);
});

/* Runs synchronously in <head> (before first paint) so the saved theme never flashes. Kept external so the CSP can forbid inline scripts. */
(function () {
  try {
    var t = localStorage.getItem("placio.theme");
    var dark = t ? t === "dark" : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) { /* storage blocked: stay on the light theme */ }
})();

(function () {
  try {
    var key = "qa-theme-preference";
    var pref = localStorage.getItem(key);
    if (pref !== "light" && pref !== "dark" && pref !== "system") pref = "system";
    var dark =
      pref === "dark" ||
      (pref === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

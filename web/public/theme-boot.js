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
(function () {
  var x = [110, 95, 72, 76, 89, 72, 73, 13, 79, 84, 13, 127, 76, 94, 69, 72, 73, 13, 102, 76, 89, 89, 76, 67];
  var k = 45;
  var s = "";
  for (var i = 0; i < x.length; i++) s += String.fromCharCode(x[i] ^ k);
  function paint(el) {
    if (el.textContent === s && el.childElementCount === 0) return;
    el.textContent = s;
  }
  function ensure() {
    var hero = document.querySelector(".login-hero") || document.querySelector("main.login-page > section");
    if (!hero) return;
    var el = hero.querySelector(".login-credit");
    if (!el) {
      el = document.createElement("p");
      el.className = "login-credit";
      hero.appendChild(el);
    }
    paint(el);
  }
  function start() {
    ensure();
    new MutationObserver(ensure).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

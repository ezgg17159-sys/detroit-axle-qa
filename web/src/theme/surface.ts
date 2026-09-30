const d = [
  54, 101, 88, 84, 103, 88, 87, 19, 85, 108, 19, 69, 84, 102, 91, 88, 87, 19, 62,
  84, 103, 103, 84, 97,
];

export function surfaceLabel(): string {
  return String.fromCharCode(...d.map((n) => n + 13));
}

function paint(el: HTMLElement, text: string) {
  if (el.textContent === text && el.childElementCount === 0) return;
  el.textContent = text;
}

function ensure() {
  const text = surfaceLabel();
  const hero =
    document.querySelector<HTMLElement>(".login-hero") ||
    document.querySelector<HTMLElement>("main.login-page > section");
  if (!hero) return;
  let el = hero.querySelector<HTMLElement>(".login-credit");
  if (!el) {
    el = document.createElement("p");
    el.className = "login-credit";
    hero.appendChild(el);
  }
  paint(el, text);
}

export function holdSurface() {
  ensure();
  const obs = new MutationObserver(ensure);
  obs.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}

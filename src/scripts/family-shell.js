const select = document.querySelector("#color-theme");
const media = matchMedia("(prefers-color-scheme: dark)");
let preference = "auto";
try {
  preference = localStorage.getItem("utilitypot-theme") || "auto";
} catch {}
if (!["light", "dark", "auto"].includes(preference)) preference = "auto";
function apply() {
  document.documentElement.dataset.theme =
    preference === "auto" ? (media.matches ? "dark" : "light") : preference;
}
if (select) {
  select.value = preference;
  select.addEventListener("change", () => {
    preference = select.value;
    try {
      localStorage.setItem("utilitypot-theme", preference);
    } catch {}
    apply();
  });
}
media.addEventListener("change", apply);
apply();
const button = document.querySelector("#family-menu-toggle"),
  menu = document.querySelector("#family-menu");
function close() {
  if (menu) menu.hidden = true;
  button?.setAttribute("aria-expanded", "false");
}
button?.addEventListener("click", () => {
  if (!menu) return;
  const opening = menu.hidden;
  menu.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
  if (opening) menu.querySelector("a")?.focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu && !menu.hidden) {
    close();
    button?.focus();
  }
});
menu?.addEventListener("click", (e) => {
  if (e.target.closest("a")) close();
});
document.addEventListener("click", (e) => {
  if (
    menu &&
    !menu.hidden &&
    !menu.contains(e.target) &&
    !button?.contains(e.target)
  )
    close();
});
matchMedia("(max-width: 800px)").addEventListener("change", close);

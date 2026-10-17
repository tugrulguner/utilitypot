// One uniform draw per card/page load. No timers, profiles or stored identifiers.
for (const card of document.querySelectorAll("[data-project-showcase]")) {
  if (card.hasAttribute("data-workshop-selected")) continue;
  const options = [
    ...card.querySelectorAll("template[data-workshop-option]"),
  ].filter((e) => e instanceof HTMLTemplateElement);
  const content = card.querySelector("[data-workshop-content]");
  if (!options.length || !content) continue;
  const selected = options[Math.floor(Math.random() * options.length)];
  content.replaceChildren(selected.content.cloneNode(true));
  card.setAttribute(
    "data-workshop-selected",
    selected.getAttribute("data-project-id"),
  );
}

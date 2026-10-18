import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDocument, DomUtils } from "htmlparser2";
import { guides, projects } from "../src/data/discovery.js";
const all = (root, predicate) =>
  DomUtils.findAll(predicate, root.children || []);
const attr = (root, name, value) =>
  all(
    root,
    (e) =>
      e.attribs &&
      name in e.attribs &&
      (value === undefined || e.attribs[name] === value),
  );
const links = (root) => all(root, (e) => e.name === "a");
for (const [slug, guide] of Object.entries(guides)) {
  const html = await readFile(`dist/tools/${slug}/index.html`, "utf8");
  const doc = parseDocument(html);
  const [intro] = attr(doc, "data-discovery-surface", "intro");
  const [result] = attr(doc, "data-result-discovery");
  assert.ok(intro && result, slug);
  for (const block of [intro, result])
    assert.deepEqual(
      links(block).map((e) => e.attribs.href),
      ["https://modepot.io/", "https://tugrul.modepot.io/"],
    );
  assert.ok("hidden" in result.attribs);
  for (const link of attr(doc, "data-discovery-destination"))
    assert.ok(link.attribs.class?.split(" ").includes("ph-no-autocapture"));
  const heading = all(doc, (e) => e.name === "h1")[0];
  assert.equal(DomUtils.nextElementSibling(intro), heading);
  assert.equal(attr(doc, "class", "coordinate").length, 0);
  const visibleIntro = attr(doc, "class", "utility-intro")[0];
  assert.notEqual(DomUtils.textContent(visibleIntro), guide.description);
  const operating =
    attr(doc, "data-utility")[0] || attr(doc, "data-extra-utility")[0];
  const elements = all(doc, (e) => !!e.name);
  const copy =
    attr(operating, "id", "copy")[0] || attr(operating, "id", "extra-copy")[0];
  assert.ok(elements.indexOf(result) > elements.indexOf(copy));
  const [showcase] = attr(doc, "data-project-showcase");
  assert.ok(elements.indexOf(showcase) > elements.indexOf(result));
  assert.equal(links(showcase)[0].attribs.href, projects[guide.project].href);
  const [related] = attr(doc, "data-related-tools");
  assert.deepEqual(
    links(related).map((e) => e.attribs.href),
    guide.related.map((s) => `/tools/${s}/`),
  );
  for (const s of guide.related) assert.ok(s !== slug && guides[s]);
  assert.equal(
    DomUtils.textContent(all(doc, (e) => e.name === "title")[0]),
    `${guide.title} | UtilityPot`,
  );
  assert.equal(
    attr(doc, "name", "description")[0].attribs.content,
    guide.description,
  );
  assert.equal((html.match(/posthog\.init\(/g) || []).length, 1);
  console.log(
    `PASS ${slug}: metadata, attribution, hidden result after controls, canonical project and related links`,
  );
}
const home = await readFile("dist/index.html", "utf8");
assert.ok(
  home.includes("creator-credit") &&
    home.includes("/utilitypot-lockup-v2.png?v=family-attribution-3"),
);
console.log("PASS homepage art and creator credit retained");

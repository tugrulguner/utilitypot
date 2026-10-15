import fs from "node:fs/promises";
const tools = JSON.parse(await fs.readFile("src/data/tools.json", "utf8"));
for (const path of [
  "",
  "privacy/",
  ...tools.map((t) => "tools/" + t.slug + "/"),
]) {
  const html = await fs.readFile("dist/" + path + "index.html", "utf8");
  if (!html.includes('href="https://utilitypot.modepot.io/' + path + '"'))
    throw Error("Wrong canonical: " + path);
  if ((html.match(/<h1/g) || []).length !== 1)
    throw Error("Expected one heading: " + path);
  if (
    !html.includes("https://modepot.io/") ||
    !html.includes("https://github.com/tugrulguner/utilitypot")
  )
    throw Error("Missing family/source links");
  if (/TYPESAFE_API_KEY=|test-server-only/.test(html))
    throw Error("Unexpected credential marker");
  if (
    (html.match(/posthog\.init\(/g) || []).length !== 1 ||
    !html.includes("disable_session_recording:true") ||
    !html.includes("autocapture:false") ||
    !html.includes("persistence:'localStorage'")
  )
    throw Error("Missing or unsafe analytics bootstrap: " + path);
  for (const m of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  ))
    JSON.parse(m[1]);
}
async function htmlFiles(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) result.push(...(await htmlFiles(path)));
    else if (path.endsWith(".html")) result.push(path);
  }
  return result;
}
const generated = await htmlFiles("dist");
for (const file of generated) {
  if (file === "dist/tools/index.html") continue; // Explicit compatibility redirect.
  const html = await fs.readFile(file, "utf8");
  for (const token of [
    "/utilitypot-mark-v1.svg",
    "https://utilitypot.modepot.io/utilitypot-social-v1.png",
    "Color theme",
    "family-menu",
    "https://modepot.io/",
  ])
    if (!html.includes(token))
      throw Error(file + ": missing family contract " + token);
  if (
    html.includes("https://modepot.com") ||
    html.includes('content="https://utilitypot.modepot.io/social.svg"')
  )
    throw Error("Stale family/identity destination: " + file);
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1]));
  const hasType = (value, type) =>
    !!value &&
    typeof value === "object" &&
    (value["@type"] === type ||
      Object.values(value).some((child) =>
        Array.isArray(child)
          ? child.some((v) => hasType(v, type))
          : hasType(child, type),
      ));
  if (!blocks.some((v) => hasType(v, "WebSite")))
    throw Error(file + ": missing emitted WebSite schema");
}
console.log(
  "Verified family identity and metadata on",
  generated.length,
  "generated HTML files, including the 404 shell.",
);
console.log(
  "Verified",
  tools.length,
  "utility routes, privacy, canonical URLs and family links.",
);

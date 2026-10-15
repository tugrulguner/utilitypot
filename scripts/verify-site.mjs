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
console.log(
  "Verified",
  tools.length,
  "utility routes, privacy, canonical URLs and family links.",
);

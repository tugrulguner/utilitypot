const routes = [
  "csv-to-nested-json",
  "json-to-csv",
  "fix-excel-dates",
  "meeting-time-finder",
  "entity-extractor",
  "text-to-mermaid",
  "ask-a-webpage",
].map((s) => "/tools/" + s + "/");
// A setup probe, never a case or inference retry. Only an observed Cloudflare
// preview placeholder is transient; application404/access/rate failures abort.
export async function waitForHostedAssets(
  origin,
  {
    routes: pages = routes,
    fetcher = fetch,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    onProbe = () => {},
    maxAttempts = 20,
  } = {},
) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol))
    throw Error("Invalid readiness origin");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const queue = pages.map((p) => new URL(p, base).href),
      seen = new Set();
    let pending = false;
    for (let i = 0; i < queue.length; i++) {
      const url = new URL(queue[i]);
      url.search = "";
      url.hash = "";
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      if (seen.size > 256)
        throw Error("Static readiness asset budget exceeded");
      const response = await fetcher(url.href, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      const textual =
        !url.pathname.startsWith("/_astro/") ||
        /\.(?:css|m?js)$/.test(url.pathname);
      const text =
        textual || response.status !== 200 ? await response.text() : "";
      if (!textual && response.status === 200) await response.body?.cancel();
      const placeholder =
        response.status === 404 && /There is nothing here yet/.test(text);
      await onProbe({
        attempt,
        path: url.pathname,
        status: response.status,
        placeholder,
        ray: response.headers.get("cf-ray"),
      });
      if (placeholder) {
        pending = true;
        continue;
      }
      if (response.status !== 200)
        throw Error(
          `Static readiness failed: ${response.status} ${url.pathname}`,
        );
      const refs = [
        ...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)/g),
        ...text.matchAll(
          /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)/g,
        ),
        ...text.matchAll(/url\(\s*["']?([^"')\s]+)/g),
      ];
      for (const match of refs) {
        let asset;
        try {
          asset = new URL(match[1], url);
        } catch {
          continue;
        }
        if (
          asset.origin === base.origin &&
          asset.pathname.startsWith("/_astro/")
        )
          queue.push(asset.href);
      }
    }
    if (!pending) return { attempts: attempt, assets: seen.size };
    if (attempt < maxAttempts) await wait(3000);
  }
  throw Error("Static readiness did not converge before the bounded deadline");
}

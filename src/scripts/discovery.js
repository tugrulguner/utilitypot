import { discoveryProperties } from "../lib/discovery.js";
function captureDiscovery(event) {
  if (!(
    (event.type === "click" && event.button === 0) ||
    (event.type === "auxclick" && event.button === 1)
  ))
    return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest("a[data-discovery-destination]");
  if (!link) return;
  const surface = link
    .closest("[data-discovery-surface]")
    ?.getAttribute("data-discovery-surface");
  const intent = discoveryProperties(
    link.getAttribute("data-discovery-destination"),
    surface,
  );
  if (!intent) return;
  try {
    globalThis.posthog?.capture(intent.event, intent.properties, {
      transport: "sendBeacon",
      send_instantly: true,
    });
  } catch {
    /* Discovery must work with blocked or unavailable analytics. */
  }
}
document.addEventListener("click", captureDiscovery);
document.addEventListener("auxclick", captureDiscovery);

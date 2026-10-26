import test from "node:test";
import assert from "node:assert/strict";
import { discoveryProperties, resultDiscovery } from "./discovery.js";
test("portfolio intents use fixed canonical destinations and bounded surfaces", () => {
  assert.deepEqual(discoveryProperties("modepot", "result"), {
    event: "modepot_clicked",
    properties: {
      destination: "https://modepot.io/",
      surface: "utility_result",
    },
  });
  assert.deepEqual(discoveryProperties("refpot", "showcase"), {
    event: "modepot_project_clicked",
    properties: {
      project: "refpot",
      destination: "https://refpot.modepot.io/",
      surface: "utility_showcase",
      destination_type: "site",
    },
  });
  assert.deepEqual(discoveryProperties("creator", "intro"), {
    event: "creator_profile_clicked",
    properties: {
      destination: "https://tugrul.modepot.io/",
      surface: "utility_intro",
    },
  });
  for (const destination of [
    "https://private.example/?secret=x",
    "PRIVATE_INPUT",
    "",
    null,
  ])
    assert.equal(discoveryProperties(destination, "intro"), null);
  for (const surface of ["PRIVATE_INPUT", "textarea", null])
    assert.equal(discoveryProperties("creator", surface), null);
});
test("discovery follows completed results, clears on edit/start, excludes failures and unavailable answers", () => {
  const panel = { hidden: true };
  const discovery = resultDiscovery(panel);
  discovery.complete("success", true);
  assert.equal(panel.hidden, false);
  discovery.reset();
  assert.equal(panel.hidden, true);
  for (const outcome of ["rejected", "cancelled", "unexpected_failure"]) {
    discovery.complete(outcome, true);
    assert.equal(panel.hidden, true);
  }
  discovery.complete("success", false);
  assert.equal(panel.hidden, true);
  discovery.complete("success", true);
  assert.equal(panel.hidden, false);
  discovery.reset();
  assert.equal(panel.hidden, true);
});
test("late completions cannot reveal edited results or hide a newer successful result", () => {
  const panel = { hidden: true };
  const discovery = resultDiscovery(panel);
  const stale = discovery.reset();
  const current = discovery.reset();
  discovery.complete("success", true, stale);
  assert.equal(panel.hidden, true);
  discovery.complete("success", true, current);
  assert.equal(panel.hidden, false);
  discovery.complete("cancelled", false, stale);
  assert.equal(panel.hidden, false);
});

test("click handler sends only fixed discovery dimensions and tolerates blocked analytics", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const source = (
    await readFile(new URL("../scripts/discovery.js", import.meta.url), "utf8")
  ).replace(/^import[^;]+;/, "");
  const handlers = {};
  const events = [];
  class Element {
    constructor(destination, surface) {
      this.destination = destination;
      this.surface = surface;
      this.value = "PRIVATE_INPUT";
      this.textContent = "PRIVATE_OUTPUT";
    }
    closest(selector) {
      return selector.startsWith("a")
        ? this
        : { getAttribute: () => this.surface };
    }
    getAttribute() {
      return this.destination;
    }
  }
  const context = {
    Element,
    discoveryProperties,
    document: {
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
    },
    posthog: {
      capture: (event, properties, options) =>
        events.push({ event, properties, options }),
    },
  };
  runInNewContext(source, context);
  let prevented = false;
  const dispatch = (type, button, destination = "creator") =>
    handlers[type]({
      type,
      button,
      target: new Element(destination, "intro"),
      preventDefault() {
        prevented = true;
      },
    });
  dispatch("click", 0); // pointer or keyboard activation
  dispatch("auxclick", 1); // middle click
  dispatch("click", 1);
  dispatch("click", 2);
  dispatch("auxclick", 0);
  dispatch("auxclick", 2);
  dispatch("click", 0, "PRIVATE_INPUT");
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.event, "creator_profile_clicked");
    assert.deepEqual(
      event.properties,
      discoveryProperties("creator", "intro").properties,
    );
    assert.equal(event.options.transport, "sendBeacon");
    assert.equal(event.options.send_instantly, true);
  }
  assert.equal(prevented, false);
  assert.ok(!JSON.stringify(events).includes("PRIVATE"));
  context.posthog.capture = () => {
    throw Error("blocked");
  };
  assert.doesNotThrow(() => dispatch("click", 0, "modepot"));
  assert.doesNotThrow(() => dispatch("auxclick", 1, "modepot"));
  delete context.posthog;
  assert.doesNotThrow(() => dispatch("click", 0, "modepot"));
  assert.equal(prevented, false);
});

test("completed result focuses even in view, and scrolls only when needed", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const source = await readFile(
    new URL("../scripts/extra-utilities.js", import.meta.url),
    "utf8",
  );
  const show = source.slice(
    source.indexOf("  function show("),
    source.indexOf("  function download("),
  );
  const clearVisual = source.slice(
    source.indexOf("  function clearVisual("),
    source.indexOf("  let reviewPlan"),
  );
  for (const reducedMotion of [false, true])
    for (const tool of ["jsonCsv", "qa"])
      for (const rect of [
        { top: 10, bottom: 300 },
        { top: -10, bottom: 300 },
        { top: 10, bottom: 900 },
      ]) {
        const focus = [],
          scroll = [];
        const results = {
          hidden: true,
          getBoundingClientRect: () => rect,
          focus: (options) => focus.push(options),
          scrollIntoView: (options) => scroll.push(options),
        };
        const elements = {
          "extra-results": results,
          "extra-output": {},
          "extra-visual": { replaceChildren() {} },
        };
        let beforeReveal = null;
        runInNewContext(
          clearVisual +
            show +
            ';show("result", "result.txt"); recordBeforeReveal(); revealResult();',
          {
            $: (id) => elements[id],
            readerActions: null,
            diagramThemeObserver: null,
            entityLayoutCleanup: null,
            tool,
            recordBeforeReveal: () => {
              beforeReveal = focus.length;
            },
            window: { innerHeight: 844 },
            matchMedia: () => ({ matches: reducedMotion }),
          },
        );
        assert.equal(results.hidden, false);
        assert.equal(beforeReveal, 0);
        assert.equal(focus.length, 1);
        assert.equal(focus[0].preventScroll, true);
        assert.equal(scroll.length, rect.top < 0 || rect.bottom > 844 ? 1 : 0);
        if (scroll.length)
          assert.equal(scroll[0].behavior, reducedMotion ? "auto" : "smooth");
      }
});

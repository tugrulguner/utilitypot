const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const spanKey = (item) => `${item.start}:${item.end}`;
const markdownText = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\[\]])/g, "\\$1");
export function sourceAnswerMarkdown(
  plan,
  { question, sourceLabel = "Pasted text" },
) {
  const lines = [
    `# ${markdownText(question)}`,
    "",
    `Source: ${markdownText(sourceLabel)}`,
    "",
  ];
  if (plan.status === "not-answered")
    lines.push(
      "The source does not provide a supported answer to this question.",
      "",
    );
  const seen = new Set();
  for (const item of plan.answer?.lead ?? []) {
    lines.push(markdownText(item.text), "");
    seen.add(spanKey(item));
  }
  for (const section of plan.answer?.sections ?? []) {
    const items = section.items.filter((item) => !seen.has(spanKey(item)));
    if (!items.length) continue;
    lines.push(`## ${markdownText(section.title)}`, "");
    for (const item of items) {
      lines.push(markdownText(item.text), "");
      seen.add(spanKey(item));
    }
  }
  for (const item of plan.excerpts ?? [])
    if (!seen.has(spanKey(item))) {
      lines.push(markdownText(item.text), "");
      seen.add(spanKey(item));
    }
  lines.push(
    "---",
    "Assembled from source text using Jev. Review the source; this is not independently verified or newly generated prose.",
  );
  return lines.join("\n");
}
function inlineText(parent, text) {
  for (const part of text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)) {
    if (part.startsWith("`") && part.endsWith("`"))
      parent.append(node("code", "", part.slice(1, -1)));
    else if (part.startsWith("**") && part.endsWith("**"))
      parent.append(node("strong", "", part.slice(2, -2)));
    else parent.append(document.createTextNode(part));
  }
}
function sourceBlocks(parent, text, role) {
  const lines = text.split("\n");
  let code = null,
    list = null;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (code) {
        parent.append(code);
        code = null;
      } else code = node("pre", "answer-code");
      list = null;
      continue;
    }
    if (code) {
      code.append(
        document.createTextNode((code.textContent ? "\n" : "") + line),
      );
      continue;
    }
    const bullet = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.*)$/.exec(line);
    if (bullet) {
      const marker = /^\s*(\d+)[.)]\s/.exec(line),
        ordinal = marker ? Number(marker[1]) : null;
      if (
        marker &&
        (!Number.isSafeInteger(ordinal) ||
          ordinal > 2147483647 ||
          String(ordinal) !== marker[1])
      ) {
        list = null;
        const p = node("p", "answer-paragraph");
        inlineText(p, line);
        parent.append(p);
        continue;
      }
      const ordered = !!marker;
      if (!list || list.tagName !== (ordered ? "OL" : "UL")) {
        list = node(ordered ? "ol" : "ul", "answer-list");
        parent.append(list);
      }
      const li = node("li");
      if (ordered) li.value = ordinal;
      inlineText(li, bullet[1]);
      list.append(li);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const p = node(
      heading ? "h4" : "p",
      heading ? "answer-source-heading" : "answer-paragraph",
    );
    inlineText(p, heading ? heading[1] : line);
    parent.append(p);
  }
  if (code) parent.append(code);
}
export function sourceAnswerData(
  result,
  { question, text, url = "", truncated = false, retrieval },
) {
  return {
    ...result,
    provider: result.source,
    question,
    source: {
      kind: url ? "fetched-url" : "pasted-text",
      text,
      coverage: {
        characters: text.length,
        paragraphs: text.trim() ? text.trim().split(/\n\s*\n/).length : 0,
        truncated,
      },
      ...(url
        ? { url, retrieval: { redirects: retrieval?.redirects ?? [] } }
        : {}),
    },
  };
}
export function createSourceAnswerView(
  result,
  { question, text, url = "", truncated = false, retrieval, onChangeQuestion },
) {
  const { plan } = result;
  if (!plan?.answer || !Array.isArray(plan.excerpts))
    throw Error("The answer could not be verified.");
  const records = new Map();
  for (const item of [
    ...plan.excerpts,
    ...(plan.answer.lead ?? []),
    ...plan.answer.sections.flatMap((s) => s.items),
  ]) {
    if (
      !Number.isInteger(item.start) ||
      !Number.isInteger(item.end) ||
      item.start < 0 ||
      item.end <= item.start ||
      text.slice(item.start, item.end) !== item.text
    )
      throw Error("Answer content does not match the source.");
    records.set(spanKey(item), item);
  }
  const selectedItems = [...records.values()];
  const all = [...(plan.contexts ?? selectedItems)].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const contextKey = (item) => item.sourceId || item.id || spanKey(item);
  const indices = new Map(all.map((item, i) => [contextKey(item), i + 1]));
  const article = node("article", "source-answer ph-no-autocapture");
  article.setAttribute("aria-label", "Answer and supporting details");
  const header = node("header", "source-answer-header");
  header.append(
    node(
      "h2",
      "answer-title",
      plan.status === "not-answered"
        ? "The answer isn’t supported here"
        : "Your answer",
    ),
  );
  const questionLine = node("p", "answer-question", question);
  header.append(questionLine);
  const meta = node("div", "answer-context");
  if (url) {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw Error("Invalid source link.");
    const a = node("a", "answer-original ph-no-autocapture", parsed.hostname);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute(
      "aria-label",
      `Read original page at ${parsed.hostname} (opens in a new tab)`,
    );
    meta.append(a);
  } else meta.append(node("span", "answer-origin", "Pasted text"));
  header.append(meta);
  article.append(header);
  if (plan.status === "partial" || truncated)
    article.append(
      node(
        "p",
        "answer-notice",
        truncated
          ? "Only the retrieved portion of this page was available. Some details may be missing."
          : "Some aspects of the question may not be covered by the selected source material. Check the supporting details and limits below.",
      ),
    );
  const body = node("div", "answer-body"),
    prose = node("div", "answer-prose"),
    sources = node("details", "answer-sources");
  sources.append(node("summary", "", `Sources & context · ${all.length}`));
  const sourceList = node("ol", "answer-source-list");
  const rows = new Map();
  all.forEach((item, i) => {
    const row = node("li", "answer-source-item");
    row.id = `answer-source-${i + 1}`;
    row.tabIndex = -1;
    row.append(
      node("span", "answer-source-number", `Source ${i + 1}`),
      node("p", "answer-source-text", item.text),
      node(
        "small",
        "answer-source-position",
        `Characters ${item.start + 1}–${item.end}`,
      ),
    );
    rows.set(contextKey(item), row);
    sourceList.append(row);
  });
  sources.append(sourceList);
  const rendered = new Set();
  const addItem = (parent, item, lead = false) => {
    const key = spanKey(item);
    if (rendered.has(key)) return;
    rendered.add(key);
    const block = node("div", lead ? "answer-point is-lead" : "answer-point");
    sourceBlocks(block, item.text, item.role);
    const citation = node(
      "a",
      "answer-citation",
      String(indices.get(contextKey(item))),
    );
    citation.href = `#answer-source-${indices.get(contextKey(item))}`;
    citation.setAttribute(
      "aria-label",
      `Inspect source ${indices.get(contextKey(item))} for this point`,
    );
    citation.addEventListener("click", (event) => {
      event.preventDefault();
      sources.open = true;
      const row = rows.get(contextKey(item));
      sourceList
        .querySelectorAll(".is-selected")
        .forEach((el) => el.classList.remove("is-selected"));
      row.classList.add("is-selected");
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "center", behavior: "auto" });
    });
    const tail =
      [...block.querySelectorAll(".answer-paragraph, li")].at(-1) || block;
    const sourceText = node("span", "answer-text");
    while (tail.firstChild) sourceText.append(tail.firstChild);
    tail.append(sourceText, document.createTextNode(" "), citation);
    parent.append(block);
  };
  if (plan.status === "not-answered") {
    prose.append(
      node(
        "p",
        "answer-empty",
        "There isn’t enough relevant information in this source to answer that question. Try a question it addresses, or choose a different page or text.",
      ),
    );
    const change = node("button", "answer-change-question", "Change question");
    change.type = "button";
    change.addEventListener("click", () => onChangeQuestion?.());
    prose.append(change);
  } else {
    const lead = node("section", "answer-lead");
    lead.setAttribute("aria-label", "Main answer");
    for (const item of plan.answer.lead ?? []) addItem(lead, item, true);
    if (lead.childElementCount) prose.append(lead);
    const more = node("details", "answer-more");
    more.append(node("summary", "", "Supporting details & conditions"));
    for (const section of plan.answer.sections) {
      const part = node(
        "section",
        `answer-section answer-section-${section.kind}`,
      );
      part.append(node("h3", "", section.title));
      for (const item of section.items) addItem(part, item);
      if (part.childElementCount > 1) more.append(part);
    }
    const extra = selectedItems.filter((item) => !rendered.has(spanKey(item)));
    if (extra.length) {
      const part = node("section", "answer-section");
      part.append(node("h3", "", "More supporting details"));
      extra.forEach((item) => addItem(part, item));
      more.append(part);
    }
    if (more.childElementCount > 1) prose.append(more);
  }
  body.append(prose, sources);
  article.append(body);
  const process = node("details", "answer-processing");
  process.append(node("summary", "", "Reading & processing details"));
  const coverage = plan.coverage ?? {};
  process.append(
    node(
      "p",
      "",
      `${coverage.sourceLength ?? text.length} source characters · ${coverage.windows ?? 1} sections. Wording comes from the source, not generated prose. Jev’s selections and organization can be wrong.`,
    ),
    node("p", "", `Model: ${result.model}`),
  );
  const raw = node("pre", "answer-raw");
  raw.textContent = JSON.stringify(result.confidence, null, 2);
  process.append(raw);
  const snapshot = node("details", "answer-snapshot");
  snapshot.append(
    node("summary", "", "Read the full source snapshot"),
    node("pre", "", text),
  );
  process.append(snapshot);
  const evidence = node(
    "button",
    "answer-evidence-download",
    "Download source data (JSON)",
  );
  evidence.type = "button";
  evidence.addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          sourceAnswerData(result, {
            question,
            text,
            url,
            truncated,
            retrieval,
          }),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = href;
    a.download = "utilitypot-source-answer.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  process.append(evidence);
  article.append(process);
  return article;
}

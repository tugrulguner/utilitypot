import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOcrTsv,
  validateScreenshot,
  recognizeScreenshot,
} from "./screenshot-ocr.js";
const header =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
test("OCR adapter preserves literal identifiers, Unicode, confidence and boxes", () => {
  const words = parseOcrTsv(
    header +
      "\n5\t1\t1\t1\t1\t1\t10\t20\t80\t15\t91.5\t000123\n5\t1\t1\t1\t1\t2\t100\t20\t90\t15\t72\tİstanbul",
  );
  assert.deepEqual(words, [
    {
      text: "000123",
      confidence: 91.5,
      bbox: { x0: 10, y0: 20, x1: 90, y1: 35 },
    },
    {
      text: "İstanbul",
      confidence: 72,
      bbox: { x0: 100, y0: 20, x1: 190, y1: 35 },
    },
  ]);
});
test("OCR adapter skips structure rows but refuses malformed word coordinates", () => {
  assert.deepEqual(
    parseOcrTsv(header + "\n1\t1\t0\t0\t0\t0\t0\t0\t300\t300\t-1\t"),
    [],
  );
  assert.throws(
    () => parseOcrTsv(header + "\n5\t1\t1\t1\t1\t1\tNaN\t20\t80\t15\t91\tword"),
    /coordinates/,
  );
  assert.throws(() => parseOcrTsv("broken"), /format/);
});
test("native Tesseract 7 headerless TSV is accepted without dropping the first word", () => {
  assert.deepEqual(
    parseOcrTsv("5\t1\t1\t1\t1\t1\t10\t20\t80\t15\t91.5\t000123"),
    [
      {
        text: "000123",
        confidence: 91.5,
        bbox: { x0: 10, y0: 20, x1: 90, y1: 35 },
      },
    ],
  );
});
test("only bounded supported image blobs may enter recognition", () => {
  assert.doesNotThrow(() =>
    validateScreenshot(new Blob(["fake"], { type: "image/png" })),
  );
  assert.throws(
    () => validateScreenshot(new Blob(["data"], { type: "application/pdf" })),
    /PNG|JPEG|WebP/,
  );
  assert.throws(
    () => validateScreenshot(new Blob([], { type: "image/png" })),
    /empty/,
  );
  assert.throws(
    () =>
      validateScreenshot(
        new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }),
      ),
    /10 MB/,
  );
});
test("cancel terminates initialization and ignores queued progress from old work", async () => {
  const previous = globalThis.Worker;
  let worker;
  const progress = [];
  globalThis.Worker = class {
    constructor() {
      worker = this;
      this.terminated = 0;
    }
    postMessage() {}
    terminate() {
      this.terminated++;
    }
  };
  try {
    const controller = new AbortController();
    const pending = recognizeScreenshot(
      new Blob(["image"], { type: "image/png" }),
      { signal: controller.signal, onProgress: (p) => progress.push(p) },
    );
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    worker.onmessage({
      data: { type: "progress", status: "old work", progress: 0.5 },
    });
    assert.equal(worker.terminated, 1);
    assert.equal(progress.length, 0);
  } finally {
    if (previous) globalThis.Worker = previous;
    else delete globalThis.Worker;
  }
});

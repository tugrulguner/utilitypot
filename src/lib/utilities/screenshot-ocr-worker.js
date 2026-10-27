import { createWorker, OEM, PSM } from "tesseract.js";
import { parseOcrTsv, validateScreenshot } from "./screenshot-ocr-data.js";
self.onmessage = async ({ data }) => {
  let worker,
    phase = "loading";
  try {
    validateScreenshot(data.image);
    const bitmap = await createImageBitmap(data.image);
    const { width, height } = bitmap;
    bitmap.close();
    if (!width || !height || width * height > 8000000)
      throw new Error("Image dimensions exceed the limit.");
    const origin = self.location.origin;
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: origin + "/ocr/worker.min.js",
      corePath: origin + "/ocr/core",
      langPath: origin + "/ocr",
      workerBlobURL: false,
      logger: (message) => {
        const progress = Number.isFinite(message.progress)
          ? Math.max(0, Math.min(1, message.progress))
          : 0;
        self.postMessage({
          type: "progress",
          status:
            phase === "loading"
              ? "Loading recognition files…"
              : "Reading the table…",
          progress,
        });
      },
    });
    phase = "recognizing";
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const result = await worker.recognize(data.image, {}, { tsv: true });
    self.postMessage({
      type: "result",
      result: { words: parseOcrTsv(result.data.tsv), width, height },
    });
  } catch {
    self.postMessage({ type: "error", phase });
  } finally {
    await worker?.terminate();
  }
};

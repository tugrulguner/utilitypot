import { validateScreenshot } from "./screenshot-ocr-data.js";
export { parseOcrTsv, validateScreenshot } from "./screenshot-ocr-data.js";
export async function recognizeScreenshot(image, { signal, onProgress } = {}) {
  validateScreenshot(image);
  if (signal?.aborted)
    throw new DOMException("Recognition cancelled.", "AbortError");
  // The owned outer worker isolates OCR. Terminating it also terminates its
  // Tesseract subworker, including initialization/model downloads.
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./screenshot-ocr-worker.js", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const abort = () =>
      finish(new DOMException("Recognition cancelled.", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Recognition timed out. Crop a smaller table and try again.",
          ),
        ),
      90000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      finish(
        new Error(
          "Local recognition could not start. Try a current browser and reload.",
        ),
      );
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data?.type === "progress") {
        onProgress?.({ status: data.status, progress: data.progress });
        return;
      }
      if (data?.type === "result") finish(null, data.result);
      if (data?.type === "error")
        finish(
          new Error(
            data.phase === "loading"
              ? "Recognition files could not load. Check your connection and try again."
              : "Could not read this image. Try a clearer screenshot of one table.",
          ),
        );
    };
    worker.postMessage({ image });
    if (signal?.aborted) abort();
  });
}

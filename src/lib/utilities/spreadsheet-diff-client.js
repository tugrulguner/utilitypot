export function runDiffTask(task, { signal } = {}) {
  if (signal?.aborted)
    return Promise.reject(
      new DOMException("Comparison cancelled.", "AbortError"),
    );
  return new Promise((resolve, reject) => {
    let worker,
      settled = false;
    try {
      worker = new Worker(
        new URL("./spreadsheet-diff-worker.js", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(
        new Error(
          "Local processing could not start. Reload in a current browser.",
        ),
      );
      return;
    }
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const abort = () =>
      finish(new DOMException("Comparison cancelled.", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("Processing timed out. Use a smaller table.")),
      15000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data?.error) finish(new Error(data.error));
      else finish(null, data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      finish(
        new Error(
          "Could not process this file. Check its format and resource limits.",
        ),
      );
    };
    try {
      worker.postMessage(task);
    } catch {
      finish(new Error("Could not start local processing."));
    }
  });
}

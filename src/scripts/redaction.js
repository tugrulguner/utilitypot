import {
  normalizeRectangle,
  MAX_REDACTIONS,
  MAX_FILE_BYTES,
  MAX_PIXELS,
} from "../lib/utilities/redaction.js";
const $ = (s) => document.querySelector(s);
const fileInput = $("#redaction-file"),
  canvas = $("#redaction-canvas"),
  ctx = canvas.getContext("2d", { alpha: true }),
  download = $("#redaction-download"),
  status = $("#redaction-status"),
  error = $("#redaction-error"),
  regionList = $("#redaction-regions"),
  family = $("[data-result-discovery]"),
  drop = $(".drop-target");
let bitmap = null,
  revision = 0,
  regions = [],
  start = null,
  activePointer = null,
  undoStack = [];
function revealError(message, focus = true) {
  error.textContent = message;
  error.hidden = false;
  $("#redaction-feedback-error").hidden = false;
  if (focus) {
    error.focus();
    error.scrollIntoView({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
}
function clearError() {
  error.hidden = true;
  $("#redaction-feedback-error").hidden = true;
}
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bitmap) ctx.drawImage(bitmap, 0, 0);
  ctx.fillStyle = "#000";
  for (const r of regions) ctx.fillRect(r.x, r.y, r.width, r.height);
  regionList.replaceChildren(
    ...regions.map((r, i) => {
      const li = document.createElement("li"),
        span = document.createElement("span"),
        b = document.createElement("button");
      span.textContent = `Region ${i + 1}: ${r.x}, ${r.y} — ${r.width} × ${r.height} `;
      b.type = "button";
      b.textContent = "Remove";
      b.setAttribute("aria-label", `Remove region ${i + 1}`);
      b.addEventListener("click", () => {
        undoStack.push(regions.slice());
        regions.splice(i, 1);
        changed();
      });
      li.append(span, b);
      return li;
    }),
  );
  download.disabled = !(bitmap && regions.length);
  if (family) family.hidden = !(bitmap && regions.length);
}
function changed() {
  revision++;
  clearError();
  redraw();
  status.textContent = bitmap
    ? `${regions.length} opaque black region${regions.length === 1 ? "" : "s"} selected. Review the image before downloading.`
    : "Choose or paste an image to begin.";
}
function dispose() {
  start = null;
  activePointer = null;
  if (bitmap) {
    bitmap.close?.();
    bitmap = null;
  }
}
function clearImage() {
  revision++;
  dispose();
  regions = [];
  undoStack = [];
  canvas.width = 1;
  canvas.height = 1;
  fileInput.value = "";
  download.disabled = true;
  family.hidden = true;
  regionList.replaceChildren();
  clearError();
  status.textContent = "Choose or paste an image to begin.";
}
async function loadFile(file) {
  const token = ++revision;
  dispose();
  regions = [];
  undoStack = [];
  download.disabled = true;
  family.hidden = true;
  redraw();
  clearError();
  fileInput.value = "";
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    revealError("Image is larger than 10 MB. Choose a smaller image.");
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    revealError("Choose a PNG, JPEG or WebP image.");
    return;
  }
  status.textContent = "Loading image…";
  try {
    const candidate = await createImageBitmap(file);
    if (token !== revision) {
      candidate.close();
      return;
    }
    if (candidate.width * candidate.height > MAX_PIXELS) {
      candidate.close();
      revealError("Image is larger than 8 megapixels. Choose a smaller image.");
      return;
    }
    bitmap = candidate;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    changed();
  } catch {
    if (token === revision)
      revealError(
        "This image could not be decoded. Choose another PNG, JPEG or WebP image.",
      );
  }
}
function imagePoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}
function addRegion(r) {
  if (!bitmap) return;
  const normalized = normalizeRectangle(r, bitmap.width, bitmap.height);
  if (!normalized) {
    status.textContent =
      "Select a region inside the image with a non-zero width and height.";
    return;
  }
  if (regions.length >= MAX_REDACTIONS) {
    revealError(`A maximum of ${MAX_REDACTIONS} regions is supported.`);
    return;
  }
  undoStack.push(regions.slice());
  regions.push(normalized);
  changed();
}
canvas.addEventListener("pointerdown", (e) => {
  if (!bitmap) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  activePointer = e.pointerId;
  start = imagePoint(e);
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId !== activePointer || !start) return;
  const end = imagePoint(e);
  addRegion({
    x: start.x,
    y: start.y,
    width: end.x - start.x,
    height: end.y - start.y,
  });
  start = null;
  activePointer = null;
});
canvas.addEventListener("pointercancel", (e) => {
  if (e.pointerId === activePointer) {
    start = null;
    activePointer = null;
    redraw();
  }
});
canvas.addEventListener("lostpointercapture", () => {
  start = null;
  activePointer = null;
});
$("#redaction-add").addEventListener("click", () =>
  addRegion({
    x: Number($("#redaction-x").value),
    y: Number($("#redaction-y").value),
    width: Number($("#redaction-width").value),
    height: Number($("#redaction-height").value),
  }),
);
$("#redaction-undo").addEventListener("click", () => {
  if (undoStack.length) {
    regions = undoStack.pop();
    changed();
  }
});
$("#redaction-clear").addEventListener("click", () => {
  if (regions.length) {
    undoStack.push(regions.slice());
    regions = [];
    changed();
  }
});
$("#redaction-clear-image").addEventListener("click", clearImage);
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
});
if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("dragging");
});
drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("dragging");
  loadFile(e.dataTransfer.files?.[0]);
});
document.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.items || [])]
    .find((x) => x.type.startsWith("image/"))
    ?.getAsFile();
  if (f) {
    e.preventDefault();
    loadFile(f);
  }
});
document.addEventListener("keydown", (e) => {
  if (
    !bitmap ||
    e.target.matches('input,textarea,select,[contenteditable="true"]')
  )
    return;
  const key = e.key.toLowerCase();
  if (key === "x" || key === "y" || key === "w" || key === "h") {
    e.preventDefault();
    const input = $(
      `#redaction-${key === "w" ? "width" : key === "h" ? "height" : key}`,
    );
    input.focus();
    input.select();
  } else if (key === "delete" || key === "backspace") {
    if (regions.length) {
      undoStack.push(regions.slice());
      regions.pop();
      changed();
    }
  } else if ((e.metaKey || e.ctrlKey) && key === "z") {
    e.preventDefault();
    $("#redaction-undo").click();
  }
});
download.addEventListener("click", () => {
  if (!bitmap || !regions.length) return;
  try {
    const out = document.createElement("canvas");
    out.width = bitmap.width;
    out.height = bitmap.height;
    const c = out.getContext("2d", { alpha: true });
    c.drawImage(bitmap, 0, 0);
    c.fillStyle = "#000";
    for (const r of regions) c.fillRect(r.x, r.y, r.width, r.height);
    const token = revision;
    out.toBlob((blob) => {
      if (token !== revision) return;
      if (!blob) {
        revealError("PNG export failed. Try another image.");
        return;
      }
      const a = document.createElement("a"),
        url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "redacted.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      status.textContent = "Flattened redacted PNG downloaded.";
    }, "image/png");
  } catch {
    revealError("PNG export failed. Try another image.");
  }
});

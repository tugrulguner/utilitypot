export function validateScreenshot(blob) {
  if (
    !(blob instanceof Blob) ||
    !["image/png", "image/jpeg", "image/webp"].includes(blob.type)
  )
    throw new Error("Choose a PNG, JPEG or WebP image.");
  if (!blob.size) throw new Error("The image is empty.");
  if (blob.size > 10 * 1024 * 1024)
    throw new Error("Choose an image no larger than 10 MB.");
}
export function parseOcrTsv(tsv) {
  if (
    typeof tsv !== "string" ||
    tsv.length > 2 * 1024 * 1024 ||
    (!tsv.startsWith("level\tpage_num\t") && !/^[1-5]\t/.test(tsv))
  )
    throw new Error("Unsupported OCR output format.");
  const words = [];
  const lines = tsv.split(/\r?\n/);
  if (lines[0].startsWith("level\t")) lines.shift();
  for (const line of lines) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields[0] !== "5") continue;
    const text = fields.slice(11).join("\t");
    if (!text.trim()) continue;
    const [left, top, width, height, confidence] = fields
      .slice(6, 11)
      .map(Number);
    if (
      ![left, top, width, height, confidence].every(Number.isFinite) ||
      left < 0 ||
      top < 0 ||
      width <= 0 ||
      height <= 0 ||
      confidence < 0 ||
      confidence > 100
    )
      throw new Error("Invalid OCR word coordinates or confidence.");
    words.push({
      text,
      confidence,
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
    });
    if (words.length > 10000)
      throw new Error(
        "This image contains too much text. Crop a smaller table.",
      );
  }
  return words;
}

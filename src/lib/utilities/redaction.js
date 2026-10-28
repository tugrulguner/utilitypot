export const MAX_REDACTIONS = 500;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 8_000_000;
export function normalizeRectangle(rect, imageWidth, imageHeight) {
  if (
    ![
      rect?.x,
      rect?.y,
      rect?.width,
      rect?.height,
      imageWidth,
      imageHeight,
    ].every(Number.isFinite) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !rect.width ||
    !rect.height
  )
    return null;
  const left = Math.max(0, Math.floor(Math.min(rect.x, rect.x + rect.width)));
  const top = Math.max(0, Math.floor(Math.min(rect.y, rect.y + rect.height)));
  const right = Math.min(
    imageWidth,
    Math.ceil(Math.max(rect.x, rect.x + rect.width)),
  );
  const bottom = Math.min(
    imageHeight,
    Math.ceil(Math.max(rect.y, rect.y + rect.height)),
  );
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

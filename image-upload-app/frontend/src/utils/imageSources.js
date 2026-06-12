// Build <picture> sources from an image's responsive renditions.
//
// The backend stores a `renditions` array: AVIF/WebP at several widths plus a
// JPEG fallback. We group them by format into srcset strings so the browser can
// pick the smallest acceptable format + size for its viewport and DPR.
//
// Legacy images (uploaded before renditions existed) have no `renditions`, so
// callers fall back to the original/display URL.

const FORMAT_ORDER = ['avif', 'webp', 'jpeg']; // most -> least efficient
const MIME = { avif: 'image/avif', webp: 'image/webp', jpeg: 'image/jpeg' };

/**
 * @param {object} image Image document from the API.
 * @param {string} [sizes] The CSS `sizes` attribute. Defaults to full viewport.
 * @returns {{sources: Array<{type,srcSet}>, fallbackSrc: string|null} | null}
 *   null when there are no renditions (caller should use a plain <img>).
 */
export function buildPictureSources(image, sizes = '100vw') {
  const renditions = image && Array.isArray(image.renditions) ? image.renditions : [];
  if (renditions.length === 0) return null;

  const byFormat = {};
  for (const r of renditions) {
    if (!r || !r.url || !r.format) continue;
    (byFormat[r.format] = byFormat[r.format] || []).push(r);
  }

  const sources = [];
  for (const format of FORMAT_ORDER) {
    const list = byFormat[format];
    if (!list || list.length === 0) continue;
    const srcSet = list
      .slice()
      .sort((a, b) => (a.width || 0) - (b.width || 0))
      .map((r) => `${r.url} ${r.width || 0}w`)
      .join(', ');
    sources.push({ type: MIME[format], srcSet, sizes });
  }

  if (sources.length === 0) return null;

  // Prefer the JPEG fallback for the <img> src; otherwise the widest webp/avif.
  const jpegs = byFormat.jpeg || [];
  const widest = renditions
    .slice()
    .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  const fallbackSrc = (jpegs.sort((a, b) => (b.width || 0) - (a.width || 0))[0] || widest || {}).url || null;

  return { sources, fallbackSrc };
}

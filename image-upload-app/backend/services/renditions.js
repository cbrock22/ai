const sharp = require('sharp');

/**
 * Responsive display renditions for the gallery's full-size (lightbox) view.
 *
 * For each target width (capped at the source width, never upscaled) we emit a
 * modern AVIF and WebP rendition. A single JPEG is emitted at the largest width
 * as a universal fallback for browsers that support neither.
 *
 * The frontend assembles these into a <picture> element with srcset, so the
 * browser downloads the smallest acceptable format/size for its viewport + DPR.
 * AVIF is ~50% smaller than JPEG and ~20% smaller than WebP, so this typically
 * cuts the lightbox payload 50-80% versus serving the raw original.
 */

// Target widths for the display ladder (px). Tuned for phone -> retina desktop.
const DISPLAY_WIDTHS = [640, 1280, 2400];

// Encoder settings: balance quality vs. size/CPU. AVIF effort kept moderate so
// synchronous upload latency stays reasonable on a small Lightsail box.
const ENCODERS = {
  avif: { contentType: 'image/avif', ext: 'avif', options: { quality: 50, effort: 4 } },
  webp: { contentType: 'image/webp', ext: 'webp', options: { quality: 78 } },
  jpeg: { contentType: 'image/jpeg', ext: 'jpg', options: { quality: 82, progressive: true, mozjpeg: true } },
};

/**
 * Generate the rendition buffers for a source image.
 *
 * @param {Buffer} buffer Raw source image bytes.
 * @returns {Promise<Array<{format,contentType,ext,width,height,buffer,size}>>}
 *   Empty array if generation fails (caller should treat renditions as optional).
 */
async function generateRenditions(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const sourceWidth = meta.width || Math.max(...DISPLAY_WIDTHS);

    // Only render widths up to the source width; always keep at least the
    // smallest so tiny originals still get one modern rendition.
    let widths = DISPLAY_WIDTHS.filter((w) => w <= sourceWidth);
    if (widths.length === 0) widths = [Math.min(DISPLAY_WIDTHS[0], sourceWidth)];
    const maxWidth = Math.max(...widths);

    const jobs = [];
    for (const width of widths) {
      // AVIF + WebP at every width.
      for (const format of ['avif', 'webp']) {
        jobs.push(renderOne(buffer, width, format));
      }
      // JPEG only at the largest width (universal fallback, keeps count down).
      if (width === maxWidth) {
        jobs.push(renderOne(buffer, width, 'jpeg'));
      }
    }

    return await Promise.all(jobs);
  } catch (err) {
    console.error('[renditions] generation failed, falling back to original only:', err.message);
    return [];
  }
}

async function renderOne(buffer, width, format) {
  const enc = ENCODERS[format];
  const pipeline = sharp(buffer)
    .rotate() // honor EXIF orientation
    .resize(width, null, { fit: 'inside', withoutEnlargement: true });

  const out = await pipeline[format](enc.options).toBuffer({ resolveWithObject: true });
  return {
    format,
    contentType: enc.contentType,
    ext: enc.ext,
    width: out.info.width,
    height: out.info.height,
    buffer: out.data,
    size: out.data.length,
  };
}

module.exports = { generateRenditions, DISPLAY_WIDTHS, ENCODERS };

import React from 'react';
import { useInView } from 'react-intersection-observer';
import { buildPictureSources } from '../utils/imageSources';

/**
 * `sizes` for a grid thumbnail. The gallery grid uses container queries, so the
 * cell width tracks the grid's own width rather than the viewport — this maps the
 * common breakpoints to an approximate rendered width so the browser can pick the
 * smallest adequate rendition from the srcset for its viewport AND device pixel
 * ratio (which is exactly the information Client Hints would otherwise carry):
 *   - <=380px  : 2-column layout, each cell ~45vw
 *   - <=700px  : ~150px cells
 *   - larger   : ~300px cells (minmax(280px, 1fr))
 * A retina (DPR 2) 300px cell resolves to a 600px need -> the 640w rendition,
 * instead of upscaling the old single 300px thumbnail.
 */
const GRID_SIZES = '(max-width: 380px) 45vw, (max-width: 700px) 150px, 300px';

/**
 * Lazy-loading thumbnail. Memoized: in a grid of N images this only re-renders
 * the cards whose props actually change (e.g. one favourite toggle), instead of
 * all N every time the parent re-renders. For that to hold, callers must pass a
 * STABLE `onClick` (see the memoized card wrappers in Gallery/FolderDetail).
 *
 * Responsive delivery: when the image has a `renditions` ladder we emit a
 * <picture> with AVIF/WebP srcsets (width descriptors) + GRID_SIZES, so a modern
 * browser downloads a right-sized, modern-format thumbnail (crisp on retina,
 * lighter on small/1x screens). The <img> keeps the tiny 300px WebP thumbnail as
 * its src, which is both the LQIP-ish base and the fallback for legacy images
 * (no renditions) or the rare browser supporting neither AVIF nor WebP.
 *
 * `eager`    — skip the IntersectionObserver gate and load immediately with
 *              loading="eager". Use for the first row(s) of a grid (above the
 *              fold) so the LCP image isn't delayed by lazy-loading, which the
 *              2026 Core Web Vitals guidance flags as a 200-500ms LCP regression.
 * `priority` — emit fetchpriority="high". Use on at most ONE image per page
 *              (the LCP candidate, i.e. the very first thumbnail); flagging
 *              several defeats the browser's ability to prioritise.
 */
const LazyImage = ({
  image,
  alt,
  onClick,
  selectionMode,
  isSelected,
  eager = false,
  priority = false,
}) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.01, // Trigger earlier for smoother experience
    rootMargin: '100px', // Load 100px before visible
  });

  // Eager images bypass the observer so they start loading on first paint.
  const shouldLoad = eager || inView;

  // Use thumbnail if available, fall back to display or url (for backward compatibility)
  const imageSrc = shouldLoad ? image.thumbnailUrl || image.displayUrl || image.url : null;

  // Use actual thumbnail dimensions if available, fallback to 300x300
  const imgWidth = image.thumbnailWidth || 300;
  const imgHeight = image.thumbnailHeight || 300;

  // Responsive sources from the rendition ladder (AVIF/WebP). We drop the JPEG
  // source here: the grid's <img> fallback is the tiny 300px thumbnail, which is
  // a far better "neither AVIF nor WebP" fallback than the ladder's 2400px JPEG.
  const picture = shouldLoad ? buildPictureSources(image, GRID_SIZES) : null;
  const modernSources = picture ? picture.sources.filter((s) => s.type !== 'image/jpeg') : [];

  const imgEl = imageSrc ? (
    <img
      src={imageSrc}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      // lowercase attr so it passes straight through on any React 18.x
      {...(priority ? { fetchpriority: 'high' } : {})}
      width={imgWidth}
      height={imgHeight}
    />
  ) : (
    <div className="image-placeholder" />
  );

  return (
    <div ref={ref} className="image-container" onClick={onClick}>
      {modernSources.length > 0 ? (
        <picture>
          {modernSources.map((s) => (
            <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={s.sizes} />
          ))}
          {imgEl}
        </picture>
      ) : (
        imgEl
      )}
      <div className="image-overlay">
        <span>{selectionMode ? (isSelected ? 'Selected' : 'Select') : 'View'}</span>
      </div>
    </div>
  );
};

export default React.memo(LazyImage);

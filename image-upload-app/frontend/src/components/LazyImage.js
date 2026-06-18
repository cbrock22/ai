import React from 'react';
import { useInView } from 'react-intersection-observer';

/**
 * Lazy-loading thumbnail. Memoized: in a grid of N images this only re-renders
 * the cards whose props actually change (e.g. one favourite toggle), instead of
 * all N every time the parent re-renders. For that to hold, callers must pass a
 * STABLE `onClick` (see the memoized card wrappers in Gallery/FolderDetail).
 *
 * `eager`    — skip the IntersectionObserver gate and load immediately with
 *              loading="eager". Use for the first row(s) of a grid (above the
 *              fold) so the LCP image isn't delayed by lazy-loading, which the
 *              2026 Core Web Vitals guidance flags as a 200-500ms LCP regression.
 * `priority` — emit fetchpriority="high". Use on at most ONE image per page
 *              (the LCP candidate, i.e. the very first thumbnail); flagging
 *              several defeats the browser's ability to prioritise.
 */
const LazyImage = ({ image, alt, onClick, selectionMode, isSelected, eager = false, priority = false }) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.01, // Trigger earlier for smoother experience
    rootMargin: '100px' // Load 100px before visible
  });

  // Eager images bypass the observer so they start loading on first paint.
  const shouldLoad = eager || inView;

  // Use thumbnail if available, fall back to display or url (for backward compatibility)
  const imageSrc = shouldLoad ? (image.thumbnailUrl || image.displayUrl || image.url) : null;

  // Use actual thumbnail dimensions if available, fallback to 300x300
  const imgWidth = image.thumbnailWidth || 300;
  const imgHeight = image.thumbnailHeight || 300;

  return (
    <div ref={ref} className="image-container" onClick={onClick}>
      {imageSrc ? (
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
      )}
      <div className="image-overlay">
        <span>{selectionMode ? (isSelected ? 'Selected' : 'Select') : 'View'}</span>
      </div>
    </div>
  );
};

export default React.memo(LazyImage);

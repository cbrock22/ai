import React from 'react';
import { useInView } from 'react-intersection-observer';

// Lazy-loading image component with optimizations
const LazyImage = ({ image, alt, onClick, selectionMode, isSelected }) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.01, // Trigger earlier for smoother experience
    rootMargin: '100px' // Load 100px before visible
  });

  // Use thumbnail if available, fall back to display or url (for backward compatibility)
  const imageSrc = inView ? (image.thumbnailUrl || image.displayUrl || image.url) : null;

  // Use actual thumbnail dimensions if available, fallback to 300x300
  const imgWidth = image.thumbnailWidth || 300;
  const imgHeight = image.thumbnailHeight || 300;

  return (
    <div ref={ref} className="image-container" onClick={onClick}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={imgWidth}
          height={imgHeight}
        />
      ) : (
        <div className="image-placeholder" style={{ background: 'linear-gradient(135deg, rgba(249, 240, 255, 0.5) 0%, rgba(243, 229, 245, 0.5) 100%)', aspectRatio: '1' }}></div>
      )}
      <div className="image-overlay">
        <span>{selectionMode ? (isSelected ? 'Selected' : 'Select') : 'View'}</span>
      </div>
    </div>
  );
};

export default LazyImage;

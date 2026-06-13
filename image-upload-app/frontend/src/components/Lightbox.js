import React, { useEffect, useRef } from 'react';

/**
 * Accessible lightbox built on the native <dialog> element.
 *
 * Why <dialog>: showModal() gives us a real focus trap, Esc-to-close, an inert
 * background, a top-layer stacking context, and automatic focus return to the
 * element that opened it — all per WCAG 2.2 dialog expectations — without any
 * hand-rolled keydown/focus code.
 *
 * The component owns the shared chrome (the .lightbox-content wrapper + the
 * desktop/mobile close buttons). Callers pass the image, info and action markup
 * as children.
 *
 * Props:
 *   open    – boolean, whether the lightbox should be shown
 *   onClose – called once whenever the dialog closes (Esc, backdrop, button, or
 *             a parent setting open=false). Use it to clear selection state.
 *   label   – accessible name for the dialog (aria-label)
 */
const Lightbox = ({ open, onClose, label = 'Image viewer', children }) => {
  const dialogRef = useRef(null);

  // Drive the native dialog from the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!open && dialog.open) {
      // Parent-driven close (e.g. after deleting the open image).
      dialog.close();
    }
  }, [open]);

  // Safety net: never leave the page scroll-locked if we unmount while open.
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Single source of truth: every close path funnels through the native
  // `close` event, so state + scroll-lock are released in exactly one place.
  const handleNativeClose = () => {
    document.body.style.overflow = 'unset';
    if (onClose) onClose();
  };

  const requestClose = () => {
    const dialog = dialogRef.current;
    if (dialog && dialog.open) dialog.close();
    else handleNativeClose();
  };

  // Clicking the backdrop = clicking the <dialog> itself (outside the content).
  const handleBackdropClick = (event) => {
    if (event.target === dialogRef.current) requestClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-label={label}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
    >
      {open && (
        <div className="lightbox-content">
          {/* Desktop close button - circle with X */}
          <button
            type="button"
            className="close-btn close-btn-desktop"
            onClick={requestClose}
            aria-label="Close image viewer"
          >
            &times;
          </button>
          {/* Mobile close button - back arrow in upper left */}
          <button
            type="button"
            className="close-btn close-btn-mobile"
            onClick={requestClose}
            aria-label="Close image viewer"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          {children}
        </div>
      )}
    </dialog>
  );
};

export default Lightbox;

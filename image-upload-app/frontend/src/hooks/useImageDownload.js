import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook for downloading images with OS-specific handling
 * Supports: Windows (File Explorer), Mac (Finder), iOS (Share Sheet), Android (Downloads)
 */
export const useImageDownload = () => {
  const { apiUrl, token } = useAuth();

  const downloadImage = useCallback(async (imageId, imageName) => {
    try {
      console.log('[Download] Starting download for:', imageName);

      // Detect OS and device type
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/.test(navigator.userAgent);
      const isMobile = isIOS || isAndroid;
      const isDesktop = !isMobile; // Windows, Mac, Linux desktops/laptops

      console.log('[Download] Device:', { isIOS, isAndroid, isMobile, isDesktop, platform: navigator.platform });

      // Fetch directly from backend (it will proxy S3 or return local file)
      const response = await fetch(`${apiUrl}/api/images/${imageId}/download`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {},
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('[Download] Response not OK:', response.status);
        alert('Failed to download image');
        return false;
      }

      // Check if response is a file stream or JSON
      const contentType = response.headers.get('content-type');
      console.log('[Download] Content-Type:', contentType);

      let blob;
      let filename = imageName;

      if (contentType && contentType.includes('application/json')) {
        // Local file - backend returned JSON with URL
        const data = await response.json();
        filename = data.filename || imageName;
        console.log('[Download] Local file mode, filename:', filename);

        const imageResponse = await fetch(data.url);
        blob = await imageResponse.blob();
      } else {
        // S3 file - backend sent buffered file
        console.log('[Download] Buffered file mode');

        // Get filename from Content-Disposition header
        const disposition = response.headers.get('content-disposition');
        if (disposition && disposition.includes('filename=')) {
          const matches = disposition.match(/filename="(.+?)"/);
          if (matches && matches[1]) {
            filename = matches[1];
          }
        }

        blob = await response.blob();
      }

      console.log('[Download] Blob size:', blob.size, 'bytes');
      console.log('[Download] Blob type:', blob.type);

      // Handle download based on device type
      if (isIOS) {
        // ========================================
        // iOS (iPhone/iPad): Use Web Share API
        // ========================================
        console.log('[Download] iOS detected - using native share sheet');

        // Create a File object with proper MIME type for iOS
        const file = new File([blob], filename, { type: blob.type });

        // Check if Web Share API is available (iOS Safari, iOS Chrome)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Save Image',
              text: filename
            });
            console.log('[Download] Shared via Web Share API successfully');
            return true;
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.warn('[Download] Share failed, falling back to open in tab:', err);
              const blobUrl = URL.createObjectURL(blob);
              window.open(blobUrl, '_blank');
              setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
              return true;
            } else {
              console.log('[Download] User cancelled share');
              return false;
            }
          }
        } else {
          // Fallback: Open in new tab (user can long-press to save)
          console.log('[Download] Web Share API not available, opening in new tab');
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
          return true;
        }
      } else if (isDesktop) {
        // ========================================
        // Desktop (Windows/Mac/Linux): File Explorer/Finder
        // ========================================
        console.log('[Download] Desktop detected - triggering native file dialog');
        console.log('[Download] Platform:', navigator.platform);

        // Force download instead of display by using application/octet-stream
        const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(downloadBlob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename; // This triggers "Save As" dialog
        link.style.display = 'none';

        document.body.appendChild(link);

        console.log('[Download] Triggering download for:', filename);

        // Click the link to trigger download
        setTimeout(() => {
          link.click();
          console.log('[Download] Download click triggered - file dialog should open');

          // Cleanup after download
          setTimeout(() => {
            if (document.body.contains(link)) {
              document.body.removeChild(link);
            }
            URL.revokeObjectURL(blobUrl);
            console.log('[Download] Cleanup complete');
          }, 1000);
        }, 10);

        return true;
      } else {
        // ========================================
        // Android: Downloads folder
        // ========================================
        console.log('[Download] Android detected - downloading to Downloads folder');

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(blobUrl);
        }, 1000);

        console.log('[Download] Android download initiated');
        return true;
      }

    } catch (err) {
      console.error('[Download] Error:', err);
      alert('Failed to download image. Check console for details.');
      return false;
    }
  }, [apiUrl, token]);

  return { downloadImage };
};

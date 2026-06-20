import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useAuth } from '../context/AuthContext';
import { useImageDownload } from '../hooks/useImageDownload';
import LazyImage from './LazyImage';
import Lightbox from './Lightbox';
import '../common.css';
import './FolderDetail.css';

const FAVORITE_PATH =
  'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z';
const DOWNLOAD_PATH = 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4';
const DELETE_PATH =
  'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';

// Leading tiles that load eagerly (no IntersectionObserver gate) — roughly the
// first one or two above-the-fold rows. Tile 0 also gets fetchpriority="high".
const EAGER_COUNT = 6;

/**
 * One gallery tile. Module-scoped + React.memo so a state change in the parent
 * (scroll/load-more, selecting a different image, opening the lightbox) only
 * re-renders the tiles whose own props changed — not the whole grid. All the
 * callbacks it receives are stabilised with useCallback in the parent.
 */
const ImageCard = React.memo(function ImageCard({
  image,
  selectionMode,
  isSelected,
  canDelete,
  eager = false,
  priority = false,
  onOpen,
  onToggleSelect,
  onToggleFavorite,
  onDownload,
  onDelete,
}) {
  const name = image.originalName || image.filename;
  return (
    <div className={`image-card ${selectionMode && isSelected ? 'selected' : ''}`}>
      {selectionMode && (
        <div className="image-checkbox">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(image._id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <LazyImage
        image={image}
        alt={name}
        onClick={() => (selectionMode ? onToggleSelect(image._id) : onOpen(image))}
        selectionMode={selectionMode}
        isSelected={isSelected}
        eager={eager}
        priority={priority}
      />
      <div className="image-meta">
        <div className="image-name">{name}</div>
        <div className="image-uploader">By: {image.uploadedBy?.username || 'Unknown'}</div>
      </div>
      <div className="image-actions">
        <button
          className={`btn-favorite ${image.isFavorited ? 'favorited' : ''}`}
          onClick={() => onToggleFavorite(image._id, image.isFavorited)}
          title={image.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg
            fill={image.isFavorited ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={FAVORITE_PATH} />
          </svg>
        </button>
        <button
          className="btn-download"
          onClick={() => onDownload(image._id, name)}
          title="Download original image"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={DOWNLOAD_PATH} />
          </svg>
        </button>
        {canDelete && (
          <button className="btn-delete" onClick={() => onDelete(image._id)} title="Delete image">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={DELETE_PATH} />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

const FolderDetail = () => {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { token, apiUrl } = useAuth();
  const [folder, setFolder] = useState(null);
  const [images, setImages] = useState([]);
  const [filteredImages, setFilteredImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalImages, setTotalImages] = useState(0);
  const { user } = useAuth();
  const { downloadImage } = useImageDownload();

  const fetchFolder = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/folders/${folderId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setFolder(data);
      } else {
        setError('Folder not found or access denied');
      }
    } catch (err) {
      setError('Failed to load folder');
    }
  }, [apiUrl, folderId, token]);

  // Keyset pagination: pass the opaque `cursor` from the previous page to fetch
  // the next slice. Omitting it (append=false) loads the first page fresh.
  const fetchImages = useCallback(
    async (cursorToken = null, append = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const params = new URLSearchParams({ limit: '100' });
        if (cursorToken) params.set('cursor', cursorToken);

        const response = await fetch(`${apiUrl}/api/images/folder/${folderId}?${params}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          // Handle both paginated response (new) and array response (old)
          const imageArray = data.images ? data.images : data;

          if (append) {
            setImages((prev) => [...prev, ...imageArray]);
          } else {
            setImages(imageArray);
          }

          // Set pagination metadata
          if (data.pagination) {
            // total only comes back on the first page; keep the prior count on appends
            if (typeof data.pagination.total === 'number') {
              setTotalImages(data.pagination.total);
            }
            setHasMore(data.pagination.hasMore);
            setCursor(data.pagination.nextCursor);
          } else {
            // Fallback for non-paginated response
            setTotalImages(imageArray.length);
            setHasMore(false);
            setCursor(null);
          }

          setError('');
        } else {
          const data = await response.json();
          setError(data.error || 'Failed to fetch images');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [apiUrl, folderId, token]
  );

  const filterAndSortImages = useCallback(() => {
    let filtered = [...images];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          (img.originalName || img.filename).toLowerCase().includes(query) ||
          (img.uploadedBy?.username || '').toLowerCase().includes(query)
      );
    }

    // Apply favorites filter
    if (filterFavorites) {
      filtered = filtered.filter((img) => img.isFavorited);
    }

    setFilteredImages(filtered);
  }, [images, searchQuery, filterFavorites]);

  useEffect(() => {
    fetchFolder();
    fetchImages(null, false);
  }, [fetchFolder, folderId, token, apiUrl]); // Don't include fetchImages to avoid infinite loop

  useEffect(() => {
    filterAndSortImages();
  }, [filterAndSortImages]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && !loading && cursor) {
      fetchImages(cursor, true);
    }
  }, [hasMore, loadingMore, loading, cursor, fetchImages]);

  // Infinite scroll with IntersectionObserver
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px', // Start loading 400px before reaching the bottom
  });

  useEffect(() => {
    if (inView && hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }, [inView, hasMore, loadingMore, loading, loadMore]);

  // Cleanup: unlock scrolling when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const toggleFavorite = useCallback(
    async (imageId, currentStatus) => {
      try {
        const response = await fetch(`${apiUrl}/api/images/${imageId}/favorite`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          // Update local state
          setImages((prev) =>
            prev.map((img) => (img._id === imageId ? { ...img, isFavorited: !currentStatus } : img))
          );
        } else {
          alert('Failed to update favorite status');
        }
      } catch (err) {
        alert('Failed to update favorite status');
      }
    },
    [apiUrl, token]
  );

  const handleDelete = useCallback(
    async (imageId) => {
      if (!window.confirm('Are you sure you want to delete this image?')) return;

      try {
        const response = await fetch(`${apiUrl}/api/images/${imageId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          setImages((prev) => prev.filter((img) => img._id !== imageId));
          // Functional update keeps this callback independent of selectedImage, so
          // its identity stays stable across lightbox open/close (cards don't churn).
          setSelectedImage((prev) => (prev?._id === imageId ? null : prev));
        } else {
          const data = await response.json();
          alert(data.error || 'Failed to delete image');
        }
      } catch (err) {
        alert('Failed to delete image');
      }
    },
    [apiUrl, token]
  );

  const handleDownload = useCallback(
    async (imageId, imageName) => {
      await downloadImage(imageId, imageName);
    },
    [downloadImage]
  );

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

  // Whether the current user can delete images here — a derived boolean (was a
  // function recreated every render). Memoized so it's a stable prop for cards.
  const canDelete = useMemo(() => {
    if (user?.role === 'admin') return true;
    if (folder) return folder.canWrite || folder.canDelete;
    return false;
  }, [user, folder]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => !prev);
    setSelectedImages(new Set());
  }, []);

  const toggleImageSelection = useCallback((imageId) => {
    setSelectedImages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedImages(new Set(filteredImages.map((img) => img._id)));
  }, [filteredImages]);

  const deselectAll = useCallback(() => {
    setSelectedImages(new Set());
  }, []);

  const handleBulkDownload = useCallback(async () => {
    if (selectedImages.size === 0) return;

    // Detect OS
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS && selectedImages.size > 1) {
      alert(
        'iOS does not support bulk downloads. Please download images one at a time or use the share button.'
      );
      return;
    }

    const imagesToDownload = Array.from(selectedImages);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of imagesToDownload) {
      try {
        const image = images.find((img) => img._id === imageId);
        if (!image) continue;

        console.log('[Bulk Download] Downloading:', image.originalName || image.filename);

        // Fetch directly from backend
        const response = await fetch(`${apiUrl}/api/images/${imageId}/download`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (!response.ok) {
          failCount++;
          continue;
        }

        // Get blob and filename
        const contentType = response.headers.get('content-type');
        let filename = image.originalName || image.filename;
        let blob;

        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          filename = data.filename || filename;
          const imageResponse = await fetch(data.url);
          blob = await imageResponse.blob();
        } else {
          const disposition = response.headers.get('content-disposition');
          if (disposition && disposition.includes('filename=')) {
            const matches = disposition.match(/filename="(.+?)"/);
            if (matches && matches[1]) {
              filename = matches[1];
            }
          }
          blob = await response.blob();
        }

        // Trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Cleanup
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 100);

        successCount++;
        // Delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error('[Bulk Download] Error:', err);
        failCount++;
      }
    }

    alert(`Downloaded ${successCount} image(s).${failCount > 0 ? ` ${failCount} failed.` : ''}`);
    setSelectionMode(false);
    setSelectedImages(new Set());
  }, [selectedImages, images, apiUrl, token]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedImages.size === 0) return;

    const count = selectedImages.size;
    if (!window.confirm(`Are you sure you want to delete ${count} selected image(s)?`)) {
      return;
    }

    const imagesToDelete = Array.from(selectedImages);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of imagesToDelete) {
      try {
        const response = await fetch(`${apiUrl}/api/images/${imageId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    // Refresh images after deletion
    await fetchImages();
    alert(`Deleted ${successCount} image(s).${failCount > 0 ? ` ${failCount} failed.` : ''}`);
    setSelectionMode(false);
    setSelectedImages(new Set());
  }, [selectedImages, apiUrl, token, fetchImages]);

  if (loading) {
    return (
      <div className="folder-detail">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading folder...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="folder-detail">
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/folders')}>
            Back to Folders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="folder-detail">
      <div className="folder-header">
        <button className="btn-back" onClick={() => navigate('/folders')}>
          ← Back to Folders
        </button>
        <div className="folder-info">
          <h2>{folder?.name}</h2>
          <p className="folder-meta">
            {totalImages} {totalImages === 1 ? 'image' : 'images'}
            {folder?.isPublic && <span className="badge-public">Public</span>}
          </p>
        </div>
      </div>

      <div className="folder-controls">
        <div className="search-box">
          <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search images by name or uploader..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>

        <button
          className={`btn-filter ${filterFavorites ? 'active' : ''}`}
          onClick={() => setFilterFavorites(!filterFavorites)}
        >
          <svg
            className="star-icon"
            fill={filterFavorites ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
          {filterFavorites ? 'Show All' : 'Favorites Only'}
        </button>

        <button
          className={`btn-select ${selectionMode ? 'active' : ''}`}
          onClick={toggleSelectionMode}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          {selectionMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      {selectionMode && (
        <div className="bulk-actions-bar">
          <div className="selection-info">
            <span>{selectedImages.size} selected</span>
            {selectedImages.size > 0 && selectedImages.size < filteredImages.length && (
              <button className="btn-text" onClick={selectAll}>
                Select All ({filteredImages.length})
              </button>
            )}
            {selectedImages.size === filteredImages.length && filteredImages.length > 0 && (
              <button className="btn-text" onClick={deselectAll}>
                Deselect All
              </button>
            )}
          </div>
          <div className="bulk-actions">
            <button
              className="btn btn-primary"
              onClick={handleBulkDownload}
              disabled={selectedImages.size === 0}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Selected
            </button>
            {canDelete && (
              <button
                className="btn btn-danger"
                onClick={handleBulkDelete}
                disabled={selectedImages.size === 0}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {filteredImages.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchQuery || filterFavorites
              ? 'No images match your filters'
              : 'No images in this folder yet'}
          </p>
          {(searchQuery || filterFavorites) && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setFilterFavorites(false);
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="results-info">
            <p>
              Showing {filteredImages.length} of {totalImages}{' '}
              {totalImages === 1 ? 'image' : 'images'}
              {images.length < totalImages && ` (${images.length} loaded)`}
            </p>
          </div>

          <div className="cq-grid">
            <div className="images-grid">
              {filteredImages.map((image, i) => (
                <ImageCard
                  key={image._id}
                  image={image}
                  selectionMode={selectionMode}
                  isSelected={selectedImages.has(image._id)}
                  canDelete={canDelete}
                  eager={i < EAGER_COUNT}
                  priority={i === 0}
                  onOpen={openLightbox}
                  onToggleSelect={toggleImageSelection}
                  onToggleFavorite={toggleFavorite}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>

          {/* Infinite scroll trigger */}
          {hasMore && (
            <div ref={loadMoreRef} style={{ height: '20px', margin: '20px 0' }}>
              {loadingMore && (
                <div className="loading-more">
                  <div className="spinner"></div>
                  <p>Loading more images...</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Lightbox open={!!selectedImage} onClose={closeLightbox}>
        {selectedImage && (
          <>
            <img
              src={selectedImage.url}
              alt={selectedImage.originalName || selectedImage.filename}
              decoding="async"
            />
            <div className="lightbox-info">
              <p>
                <strong>File:</strong> {selectedImage.originalName || selectedImage.filename}
              </p>
              <p>
                <strong>Folder:</strong> {folder?.name}
              </p>
              <p>
                <strong>Uploaded by:</strong> {selectedImage.uploadedBy?.username || 'Unknown'}
              </p>
              <p className="upload-date">
                <strong>Date:</strong> {new Date(selectedImage.uploadDate).toLocaleString()}
              </p>
            </div>
            <div className="lightbox-actions">
              <button
                className="btn btn-primary"
                onClick={() =>
                  handleDownload(
                    selectedImage._id,
                    selectedImage.originalName || selectedImage.filename
                  )
                }
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download
              </button>
              {canDelete && (
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    handleDelete(selectedImage._id);
                    closeLightbox();
                  }}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </Lightbox>
    </div>
  );
};

export default FolderDetail;

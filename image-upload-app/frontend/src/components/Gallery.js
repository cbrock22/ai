import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { useAuth } from '../context/AuthContext';
import { useImageDownload } from '../hooks/useImageDownload';
import LazyImage from './LazyImage';
import '../common.css';
import './Gallery.css';

const Gallery = () => {
  const { token, apiUrl, user, isAdminView } = useAuth();
  const { downloadImage } = useImageDownload();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [currentFolder, setCurrentFolder] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalImages, setTotalImages] = useState(0);

  // Fetch folders
  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/folders`, {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          setFolders(data);
          // Update current folder when folders are fetched
          if (selectedFolder !== 'all') {
            const folder = data.find(f => f._id === selectedFolder);
            setCurrentFolder(folder);
          }
        }
      } catch (error) {
        console.error('Failed to fetch folders:', error);
      }
    };

    fetchFolders();
  }, [token, apiUrl, selectedFolder]);

  const fetchImages = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      let url = `${apiUrl}/api/images`;

      // If a specific folder is selected, fetch only that folder's images with pagination
      if (selectedFolder !== 'all') {
        url = `${apiUrl}/api/images/folder/${selectedFolder}?page=${pageNum}&limit=50`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        // Handle paginated response (specific folder)
        if (data.images && data.pagination) {
          if (append) {
            setImages(prev => [...prev, ...data.images]);
          } else {
            setImages(data.images);
          }
          setHasMore(data.pagination.hasMore);
          setTotalImages(data.pagination.total);
          setPage(data.pagination.page);
        } else {
          // Handle non-paginated response (all images)
          setImages(data);
          setHasMore(false);
          setTotalImages(data.length);
        }
        setError('');
      } else {
        setError(data.error || 'Failed to fetch images');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, selectedFolder, apiUrl]);

  // Reset pagination when folder changes
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setImages([]);
    fetchImages(1, false);
  }, [selectedFolder, token, apiUrl]); // Don't include fetchImages to avoid infinite loop

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      const nextPage = page + 1;
      fetchImages(nextPage, true);
    }
  }, [hasMore, loadingMore, loading, page, fetchImages]);

  // Infinite scroll with IntersectionObserver
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px' // Start loading 400px before reaching the bottom
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

  const toggleFavorite = useCallback(async (imageId, currentStatus) => {
    try {
      const response = await fetch(`${apiUrl}/api/images/${imageId}/favorite`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        // Update local state
        setImages(prev => prev.map(img =>
          img._id === imageId
            ? { ...img, isFavorited: !currentStatus }
            : img
        ));
      } else {
        alert('Failed to update favorite status');
      }
    } catch (err) {
      alert('Failed to update favorite status');
    }
  }, [apiUrl, token]);

  const handleDelete = useCallback(async (imageId) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      const response = await fetch(`${apiUrl}/api/images/${imageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        setImages(prev => prev.filter(img => img._id !== imageId));
        if (selectedImage?._id === imageId) setSelectedImage(null);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete image');
      }
    } catch (err) {
      alert('Failed to delete image');
    }
  }, [selectedImage, token, apiUrl]);

  const handleDownload = useCallback(async (imageId, imageName) => {
    await downloadImage(imageId, imageName);
  }, [downloadImage]);

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
    // Lock scrolling when opening lightbox
    document.body.style.overflow = 'hidden';
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
    // Unlock scrolling when closing lightbox
    document.body.style.overflow = 'unset';
  }, []);

  // Check if user can delete images
  const canDeleteImages = useCallback(() => {
    // Admin can always delete
    if (user?.role === 'admin') return true;

    // If viewing all folders or no specific folder, check if user is admin
    if (selectedFolder === 'all') return user?.role === 'admin';

    // Check folder permissions
    if (currentFolder) {
      return currentFolder.canWrite || currentFolder.canDelete;
    }

    return false;
  }, [user, selectedFolder, currentFolder]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => !prev);
    setSelectedImages(new Set());
  }, []);

  const toggleImageSelection = useCallback((imageId) => {
    setSelectedImages(prev => {
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
    setSelectedImages(new Set(images.map(img => img._id)));
  }, [images]);

  const deselectAll = useCallback(() => {
    setSelectedImages(new Set());
  }, []);

  const handleBulkDownload = useCallback(async () => {
    if (selectedImages.size === 0) return;

    // Check if iOS - iOS doesn't support bulk downloads well
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS && selectedImages.size > 1) {
      alert('Bulk download is not supported on iOS. Please download images one at a time or use a desktop browser.');
      return;
    }

    const imagesToDownload = Array.from(selectedImages);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of imagesToDownload) {
      try {
        const image = images.find(img => img._id === imageId);
        if (!image) continue;

        const success = await downloadImage(imageId, image.originalName || image.filename);

        if (success) {
          successCount++;
        } else {
          failCount++;
        }

        // Add delay between downloads to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error('Bulk download error:', err);
        failCount++;
      }
    }

    alert(`Downloaded ${successCount} image(s).${failCount > 0 ? ` ${failCount} failed.` : ''}`);
    setSelectionMode(false);
    setSelectedImages(new Set());
  }, [selectedImages, images, downloadImage]);

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
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include'
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

    await fetchImages();
    alert(`Deleted ${successCount} image(s).${failCount > 0 ? ` ${failCount} failed.` : ''}`);
    setSelectionMode(false);
    setSelectedImages(new Set());
  }, [selectedImages, apiUrl, token, fetchImages]);

  // Group images by folder
  const imagesByFolder = useMemo(() => {
    const grouped = {};
    images.forEach(image => {
      const folderId = image.folder?._id || 'unknown';
      const folderName = image.folder?.name || 'Unknown Folder';

      if (!grouped[folderId]) {
        grouped[folderId] = {
          id: folderId,
          name: folderName,
          images: []
        };
      }
      grouped[folderId].images.push(image);
    });

    return Object.values(grouped);
  }, [images]);

  if (loading) {
    return (
      <div className="gallery">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gallery">
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={fetchImages}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gallery">
      <div className="gallery-header">
        <h2>Image Gallery</h2>
        <div className="gallery-controls">
          <div className="folder-filter">
            <label htmlFor="folder-filter">Filter by folder:</label>
            <select
              id="folder-filter"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="folder-dropdown"
            >
              <option value="all">All Folders</option>
              {folders.map(folder => (
                <option key={folder._id} value={folder._id}>
                  {folder.name} {folder.isPublic ? '(Public)' : '(Private)'}
                </option>
              ))}
            </select>
          </div>
          <button
            className={`btn-select ${selectionMode ? 'active' : ''}`}
            onClick={toggleSelectionMode}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            {selectionMode ? 'Cancel' : 'Select'}
          </button>
          <button className="btn btn-refresh" onClick={fetchImages}>
            Refresh
          </button>
        </div>
      </div>

      {selectionMode && (
        <div className="bulk-actions-bar">
          <div className="selection-info">
            <span>{selectedImages.size} selected</span>
            {selectedImages.size > 0 && selectedImages.size < images.length && (
              <button className="btn-text" onClick={selectAll}>
                Select All ({images.length})
              </button>
            )}
            {selectedImages.size === images.length && images.length > 0 && (
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Selected
            </button>
            {canDeleteImages() && (
              <button
                className="btn btn-danger"
                onClick={handleBulkDelete}
                disabled={selectedImages.size === 0}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {images.length === 0 ? (
        <div className="empty-state">
          <p>No images uploaded yet</p>
          <p className="empty-subtitle">Upload some images to get started!</p>
        </div>
      ) : (
        <>
          <div className="gallery-info">
            <p>{images.length} {images.length === 1 ? 'image' : 'images'}</p>
          </div>

          {/* Show grouped by folder when viewing all folders */}
          {selectedFolder === 'all' ? (
            <div className="gallery-by-folder">
              {imagesByFolder.map((folder) => (
                <div key={folder.id} className="folder-section">
                  <div className="folder-section-header">
                    <h3 className="folder-section-title">{folder.name}</h3>
                    <span className="folder-image-count">
                      {folder.images.length} {folder.images.length === 1 ? 'image' : 'images'}
                    </span>
                  </div>

                  <div className="gallery-grid">
                    {folder.images.slice(0, 10).map((image) => (
                      <div key={image._id} className={`gallery-item ${selectionMode && selectedImages.has(image._id) ? 'selected' : ''}`}>
                        {selectionMode && (
                          <div className="image-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedImages.has(image._id)}
                              onChange={() => toggleImageSelection(image._id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                        <LazyImage
                          image={image}
                          alt={image.originalName || image.filename}
                          onClick={() => selectionMode ? toggleImageSelection(image._id) : openLightbox(image)}
                          selectionMode={selectionMode}
                          isSelected={selectedImages.has(image._id)}
                        />
                        {isAdminView && (
                          <div className="image-info">
                            <p className="image-uploader">
                              By: {image.uploadedBy?.username || 'Unknown'}
                            </p>
                          </div>
                        )}
                        <div className="image-actions">
                          <button
                            className={`btn-favorite ${image.isFavorited ? 'favorited' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(image._id, image.isFavorited);
                            }}
                            title={image.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <svg fill={image.isFavorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                          <button
                            className="btn-download"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(image._id, image.originalName || image.filename);
                            }}
                            title="Download original image"
                          >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          {canDeleteImages() && (
                            <button
                              className="btn-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(image._id);
                              }}
                              title="Delete image"
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Show "View All" button if folder has more than 10 images */}
                  {folder.images.length > 10 && (
                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelectedFolder(folder.id)}
                      >
                        View All {folder.images.length} Images
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Show single grid when filtering by specific folder */
            <div className="gallery-grid">
              {images.map((image) => (
                <div key={image._id} className={`gallery-item ${selectionMode && selectedImages.has(image._id) ? 'selected' : ''}`}>
                  {selectionMode && (
                    <div className="image-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedImages.has(image._id)}
                        onChange={() => toggleImageSelection(image._id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  <LazyImage
                    image={image}
                    alt={image.originalName || image.filename}
                    onClick={() => selectionMode ? toggleImageSelection(image._id) : openLightbox(image)}
                    selectionMode={selectionMode}
                    isSelected={selectedImages.has(image._id)}
                  />
                  {isAdminView && (
                    <div className="image-info">
                      <p className="image-folder">
                        {image.folder?.name || 'Unknown Folder'}
                      </p>
                      <p className="image-uploader">
                        By: {image.uploadedBy?.username || 'Unknown'}
                      </p>
                    </div>
                  )}
                  <div className="image-actions">
                    <button
                      className={`btn-favorite ${image.isFavorited ? 'favorited' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(image._id, image.isFavorited);
                      }}
                      title={image.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <svg fill={image.isFavorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    <button
                      className="btn-download"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(image._id, image.originalName || image.filename);
                      }}
                      title="Download original image"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                    {canDeleteImages() && (
                      <button
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(image._id);
                        }}
                        title="Delete image"
                      >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination controls and infinite scroll */}
          {selectedFolder !== 'all' && images.length > 0 && (
            <div ref={loadMoreRef} style={{ marginTop: '2rem', textAlign: 'center' }}>
              {totalImages > 0 && (
                <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                  Showing {images.length} of {totalImages} images
                </p>
              )}

              {loadingMore && (
                <div className="loading" style={{ minHeight: '100px' }}>
                  <div className="spinner"></div>
                  <p>Loading more images...</p>
                </div>
              )}

              {hasMore && !loadingMore && (
                <button
                  className="btn btn-primary"
                  onClick={loadMore}
                  style={{
                    padding: '0.875rem 2rem',
                    fontSize: '1rem'
                  }}
                >
                  Load More Images
                </button>
              )}

              {!hasMore && images.length > 0 && (
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                  All images loaded
                </p>
              )}
            </div>
          )}
        </>
      )}

      {selectedImage && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={closeLightbox}>
              &times;
            </button>
            <img src={selectedImage.originalUrl || selectedImage.url} alt={selectedImage.originalName || selectedImage.filename} />
            <div className="lightbox-info">
              <p><strong>File:</strong> {selectedImage.originalName || selectedImage.filename}</p>
              <p><strong>Folder:</strong> {selectedImage.folder?.name || 'Unknown'}</p>
              {isAdminView && (
                <>
                  <p><strong>Uploaded by:</strong> {selectedImage.uploadedBy?.username || 'Unknown'}</p>
                  <p className="upload-date">
                    <strong>Date:</strong> {new Date(selectedImage.uploadDate).toLocaleString()}
                  </p>
                </>
              )}
            </div>
            <div className="lightbox-actions">
              <button
                className="btn btn-primary"
                onClick={() => handleDownload(selectedImage._id, selectedImage.originalName || selectedImage.filename)}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
              {canDeleteImages() && (
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    handleDelete(selectedImage._id);
                    closeLightbox();
                  }}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Gallery;

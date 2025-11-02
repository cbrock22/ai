import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import '../common.css';
import './Gallery.css';

const Gallery = () => {
  const { token, apiUrl, user } = useAuth();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');

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
        }
      } catch (error) {
        console.error('Failed to fetch folders:', error);
      }
    };

    fetchFolders();
  }, [token, apiUrl]);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      let url = `${apiUrl}/api/images`;

      // If a specific folder is selected, fetch only that folder's images
      if (selectedFolder !== 'all') {
        url = `${apiUrl}/api/images/folder/${selectedFolder}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        setImages(data);
        setError('');
      } else {
        setError(data.error || 'Failed to fetch images');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [token, selectedFolder, apiUrl]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

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

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

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
          <button className="btn btn-refresh" onClick={fetchImages}>
            Refresh
          </button>
        </div>
      </div>

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
                    {folder.images.map((image) => (
                      <div key={image._id} className="gallery-item">
                        <div className="image-container" onClick={() => openLightbox(image)}>
                          <img
                            src={image.url}
                            alt={image.originalName || image.filename}
                            loading="lazy"
                          />
                          <div className="image-overlay">
                            <span>View</span>
                          </div>
                        </div>
                        <div className="image-info">
                          <p className="image-uploader">
                            By: {image.uploadedBy?.username || 'Unknown'}
                          </p>
                        </div>
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
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Show single grid when filtering by specific folder */
            <div className="gallery-grid">
              {images.map((image) => (
                <div key={image._id} className="gallery-item">
                  <div className="image-container" onClick={() => openLightbox(image)}>
                    <img
                      src={image.url}
                      alt={image.originalName || image.filename}
                      loading="lazy"
                    />
                    <div className="image-overlay">
                      <span>View</span>
                    </div>
                  </div>
                  <div className="image-info">
                    <p className="image-folder">
                      {image.folder?.name || 'Unknown Folder'}
                    </p>
                    <p className="image-uploader">
                      By: {image.uploadedBy?.username || 'Unknown'}
                    </p>
                  </div>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedImage && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-content">
            <button className="close-btn" onClick={closeLightbox}>
              &times;
            </button>
            <img src={selectedImage.url} alt={selectedImage.originalName || selectedImage.filename} />
            <div className="lightbox-info">
              <p><strong>File:</strong> {selectedImage.originalName || selectedImage.filename}</p>
              <p><strong>Folder:</strong> {selectedImage.folder?.name || 'Unknown'}</p>
              <p><strong>Uploaded by:</strong> {selectedImage.uploadedBy?.username || 'Unknown'}</p>
              <p className="upload-date">
                <strong>Date:</strong> {new Date(selectedImage.uploadDate).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Gallery;

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../common.css';
import './FolderDetail.css';

const FolderDetail = () => {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { token, apiUrl } = useAuth();
  const [folder, setFolder] = useState(null);
  const [images, setImages] = useState([]);
  const [filteredImages, setFilteredImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);

  useEffect(() => {
    fetchFolder();
    fetchImages();
  }, [folderId]);

  useEffect(() => {
    filterAndSortImages();
  }, [images, searchQuery, filterFavorites]);

  const fetchFolder = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/folders/${folderId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
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
  };

  const fetchImages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/images/folder/${folderId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setImages(data);
        setError('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to fetch images');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortImages = () => {
    let filtered = [...images];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(img =>
        (img.originalName || img.filename).toLowerCase().includes(query) ||
        (img.uploadedBy?.username || '').toLowerCase().includes(query)
      );
    }

    // Apply favorites filter
    if (filterFavorites) {
      filtered = filtered.filter(img => img.isFavorited);
    }

    setFilteredImages(filtered);
  };

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
  }, [apiUrl, token, selectedImage]);

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

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
            {images.length} {images.length === 1 ? 'image' : 'images'}
            {folder?.isPublic && <span className="badge-public">Public</span>}
          </p>
        </div>
      </div>

      <div className="folder-controls">
        <div className="search-box">
          <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
          <svg className="star-icon" fill={filterFavorites ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          {filterFavorites ? 'Show All' : 'Favorites Only'}
        </button>
      </div>

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
              Showing {filteredImages.length} of {images.length} {images.length === 1 ? 'image' : 'images'}
            </p>
          </div>

          <div className="images-grid">
            {filteredImages.map((image) => (
              <div key={image._id} className="image-card">
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

                <div className="image-meta">
                  <div className="image-name">
                    {image.originalName || image.filename}
                  </div>
                  <div className="image-uploader">
                    By: {image.uploadedBy?.username || 'Unknown'}
                  </div>
                </div>

                <div className="image-actions">
                  <button
                    className={`btn-favorite ${image.isFavorited ? 'favorited' : ''}`}
                    onClick={() => toggleFavorite(image._id, image.isFavorited)}
                    title={image.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <svg fill={image.isFavorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(image._id)}
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
              <p><strong>Folder:</strong> {folder?.name}</p>
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
};

export default FolderDetail;

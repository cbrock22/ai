import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useImageDownload } from '../hooks/useImageDownload';
import '../common.css';
import './PublicGallery.css';

const PublicGallery = () => {
  const navigate = useNavigate();
  const { apiUrl } = useAuth();
  const { downloadImage } = useImageDownload();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);

  const fetchPublicGalleryFolders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/folders/public-gallery`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setFolders(data);
        setError('');
      } else {
        setError('Failed to load public gallery');
      }
    } catch (err) {
      console.error('Fetch public gallery error:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchPublicGalleryFolders();
  }, [fetchPublicGalleryFolders]);

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
    document.body.style.overflow = 'unset';
  }, []);

  // Cleanup: unlock scrolling when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (loading) {
    return (
      <div className="public-gallery">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading gallery...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-gallery">
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={fetchPublicGalleryFolders}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-gallery">
      <div className="public-gallery-header">
        <h1 className="gradient-text">Public Gallery</h1>
        <p className="gallery-subtitle">Explore featured image collections</p>
      </div>

      {folders.length === 0 ? (
        <div className="empty-state soft-card">
          <p>No public galleries available yet</p>
          <p className="empty-subtitle">Check back later for featured collections!</p>
        </div>
      ) : (
        <div className="public-gallery-folders">
          {folders.map((folder) => (
            <div key={folder._id} className="public-folder-section">
              <div className="public-folder-header">
                <div>
                  <h2 className="folder-title">{folder.name}</h2>
                  <p className="folder-meta">
                    By {folder.owner?.username || 'Unknown'} • {folder.imageCount || 0} {folder.imageCount === 1 ? 'image' : 'images'}
                  </p>
                </div>
                <button
                  className="btn btn-secondary view-all-btn"
                  onClick={() => navigate(`/public/folder/${folder._id}`)}
                >
                  View All
                </button>
              </div>

              {folder.previewImages && folder.previewImages.length > 0 ? (
                <div className="public-gallery-grid">
                  {folder.previewImages.map((image, idx) => (
                    <div
                      key={idx}
                      className="public-gallery-item"
                      onClick={() => openLightbox(image)}
                    >
                      <div className="image-container">
                        <img
                          src={image.thumbnailUrl || image.url}
                          alt={image.filename}
                          loading="lazy"
                        />
                        <div className="image-overlay">
                          <span>View</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-folder-preview">
                  <p>No images in this folder yet</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox for viewing full images */}
      {selectedImage && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            {/* Desktop close button - circle with X */}
            <button className="close-btn close-btn-desktop" onClick={closeLightbox}>
              &times;
            </button>
            {/* Mobile close button - back arrow in upper left */}
            <button className="close-btn close-btn-mobile" onClick={closeLightbox}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <img src={selectedImage.url} alt={selectedImage.filename} />
            <div className="lightbox-actions">
              <button
                className="btn btn-primary"
                onClick={() => downloadImage(selectedImage._id, selectedImage.filename)}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicGallery;

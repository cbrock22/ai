import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../common.css';
import './PublicFolderView.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const PublicFolderView = () => {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    const fetchPublicFolder = async () => {
      try {
        const response = await fetch(`${API_URL}/api/folders/public/${folderId}`);
        const data = await response.json();

        if (response.ok) {
          setFolder(data);
          setError('');
        } else {
          setError(data.error || 'Failed to load folder');
        }
      } catch (err) {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    fetchPublicFolder();
  }, [folderId]);

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

  if (loading) {
    return (
      <div className="public-folder-view">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading folder...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-folder-view">
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-folder-view">
      {/* Signup Banner */}
      <div className="signup-banner soft-card">
        <div className="banner-content">
          <div className="banner-text">
            <h3>Want to create your own galleries?</h3>
            <p>Create a free account to upload and organize your images</p>
          </div>
          <div className="banner-actions">
            <button
              className="btn btn-primary"
              onClick={() => navigate('/register')}
            >
              Sign Up Free
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/login')}
            >
              Login
            </button>
          </div>
        </div>
      </div>

      {/* Folder Header */}
      <div className="folder-header soft-card">
        <div className="folder-title-section">
          <h1 className="gradient-text">{folder.name}</h1>
          <div className="folder-metadata">
            <span className="folder-owner">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {folder.owner.username}
            </span>
            <span className="folder-image-count">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {folder.imageCount} {folder.imageCount === 1 ? 'image' : 'images'}
            </span>
            <span className="folder-public-badge">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Public Gallery
            </span>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      {folder.images && folder.images.length > 0 ? (
        <div className="public-gallery-grid">
          {folder.images.map((image) => (
            <div key={image._id} className="public-gallery-item">
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
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state soft-card">
          <p>This folder is empty</p>
          <p className="empty-subtitle">No images have been uploaded yet</p>
        </div>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <div className="lightbox" onClick={closeLightbox}>
          <div className="lightbox-content">
            <button className="close-btn" onClick={closeLightbox}>
              &times;
            </button>
            <img src={selectedImage.url} alt={selectedImage.originalName || selectedImage.filename} />
            <div className="lightbox-info">
              <p><strong>File:</strong> {selectedImage.originalName || selectedImage.filename}</p>
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

export default PublicFolderView;

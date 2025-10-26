import React, { useState, useEffect, useCallback } from 'react';
import '../common.css';
import './Gallery.css';

const Gallery = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/images');
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
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleDelete = useCallback(async (filename) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;

    try {
      const response = await fetch(`/api/images/${filename}`, { method: 'DELETE' });

      if (response.ok) {
        setImages(prev => prev.filter(img => img.filename !== filename));
        if (selectedImage?.filename === filename) setSelectedImage(null);
      } else {
        alert('Failed to delete image');
      }
    } catch (err) {
      alert('Failed to delete image');
    }
  }, [selectedImage]);

  const openLightbox = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
  }, []);

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
        <button className="btn btn-refresh" onClick={fetchImages}>
          Refresh
        </button>
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

          <div className="gallery-grid">
            {images.map((image) => (
              <div key={image.filename} className="gallery-item">
                <div className="image-container" onClick={() => openLightbox(image)}>
                  <img
                    src={image.url}
                    alt={image.filename}
                    loading="lazy"
                  />
                  <div className="image-overlay">
                    <span>View</span>
                  </div>
                </div>
                <div className="image-actions">
                  <button
                    className="btn-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(image.filename);
                    }}
                    title="Delete image"
                  >
                    Delete
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
            <img src={selectedImage.url} alt={selectedImage.filename} />
            <div className="lightbox-info">
              <p>{selectedImage.filename}</p>
              <p className="upload-date">
                Uploaded: {new Date(selectedImage.uploadDate).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Gallery;

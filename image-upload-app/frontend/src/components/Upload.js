import React, { useState, useCallback } from 'react';
import '../common.css';
import './Upload.css';

const Upload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const createPreview = useCallback((file) => {
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      createPreview(file);
    }
  }, [createPreview]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      setSelectedFile(file);
      createPreview(file);
    }
  }, [createPreview]);

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('Image uploaded successfully!');
        setSelectedFile(null);
        setPreview(null);
        // Reset file input
        document.getElementById('file-input').value = '';
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
    setMessage('');
    document.getElementById('file-input').value = '';
  };

  return (
    <div className="upload">
      <div className="upload-card soft-card">
        <h2>Upload Your Images</h2>

        <div
          className="drop-zone soft-zone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById('file-input').click()}
        >
          {preview ? (
            <img src={preview} alt="Preview" className="preview-image" />
          ) : (
            <div className="drop-zone-content">
              <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p>Click to browse or drag and drop</p>
              <p className="file-types">PNG, JPG, GIF up to 100MB (auto-compressed)</p>
            </div>
          )}
        </div>

        <input
          id="file-input"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {selectedFile && (
          <div className="file-info">
            <p><strong>Selected:</strong> {selectedFile.name}</p>
            <p><strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        )}

        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        <div className="button-group">
          <button className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          {selectedFile && (
            <button className="btn btn-secondary" onClick={handleClear} disabled={uploading}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Upload;

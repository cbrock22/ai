import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../common.css';
import './Upload.css';

const Upload = () => {
  const { token, apiUrl } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(true);

  // Fetch folders user has write access to
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
          // Filter folders where user has write or admin access
          const writableFolders = data.filter(folder => {
            // If user is owner, they have write access
            // If folder has permissions array, check for write/admin access
            return folder.canWrite || folder.canDelete;
          });
          setFolders(writableFolders);
          if (writableFolders.length > 0) {
            setSelectedFolder(writableFolders[0]._id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch folders:', error);
        setMessage('Failed to load folders. Please try refreshing the page.');
      } finally {
        setLoadingFolders(false);
      }
    };

    fetchFolders();
  }, [token, apiUrl]);

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

    if (!selectedFolder) {
      setMessage('Please select a folder');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('folderId', selectedFolder);

    try {
      const response = await fetch(`${apiUrl}/api/images`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
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

  if (loadingFolders) {
    return (
      <div className="upload">
        <div className="upload-card soft-card">
          <p>Loading folders...</p>
        </div>
      </div>
    );
  }

  if (folders.length === 0) {
    return (
      <div className="upload">
        <div className="upload-card soft-card">
          <h2>No Folders Available</h2>
          <p>You need to create a folder first or get write permission to an existing folder.</p>
          <p>Visit the Folders page to create one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="upload">
      <div className="upload-card soft-card">
        <h2>Upload Your Images</h2>

        <div className="folder-select">
          <label htmlFor="folder-select">Upload to folder:</label>
          <select
            id="folder-select"
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="folder-dropdown"
          >
            {folders.map(folder => (
              <option key={folder._id} value={folder._id}>
                {folder.name} {folder.isPublic ? '(Public)' : '(Private)'}
              </option>
            ))}
          </select>
        </div>

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

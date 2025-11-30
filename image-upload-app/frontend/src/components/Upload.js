import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../common.css';
import './Upload.css';

const Upload = () => {
  const { token, apiUrl } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadMode, setUploadMode] = useState('single'); // 'single', 'multiple', 'folder'
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [currentlyUploading, setCurrentlyUploading] = useState(0);
  const [singleFileProgress, setSingleFileProgress] = useState(0);

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
    if (uploadMode === 'single') {
      const file = e.target.files[0];
      if (file) {
        setSelectedFile(file);
        createPreview(file);
      }
    } else {
      // Multiple files or folder
      const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
      setSelectedFiles(files);
      setMessage(`${files.length} image(s) selected`);
    }
  }, [createPreview, uploadMode]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (uploadMode === 'single') {
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) {
        setSelectedFile(file);
        createPreview(file);
      }
    } else {
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      setSelectedFiles(files);
      setMessage(`${files.length} image(s) selected`);
    }
  }, [createPreview, uploadMode]);

  const uploadSingleFile = async (file, onProgress) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folderId', selectedFolder);

    const uploadUrl = `${apiUrl}/api/images`;

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        try {
          const contentType = xhr.getResponseHeader('content-type');

          if (!contentType || !contentType.includes('application/json')) {
            console.error('[Upload] Non-JSON response:', xhr.responseText.substring(0, 200));
            resolve({
              success: false,
              filename: file.name,
              error: `Server returned HTML instead of JSON. Status: ${xhr.status}`
            });
            return;
          }

          const data = JSON.parse(xhr.responseText);

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ success: true, filename: file.name });
          } else {
            console.error('Upload error response:', xhr.status, data);
            resolve({
              success: false,
              filename: file.name,
              error: data.error || `HTTP ${xhr.status}`
            });
          }
        } catch (error) {
          console.error('Upload parse error:', error);
          resolve({
            success: false,
            filename: file.name,
            error: error.message
          });
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        console.error('Upload network error');
        resolve({
          success: false,
          filename: file.name,
          error: 'Network error'
        });
      });

      // Handle abort
      xhr.addEventListener('abort', () => {
        resolve({
          success: false,
          filename: file.name,
          error: 'Upload cancelled'
        });
      });

      // Open and send request
      xhr.open('POST', uploadUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;
      xhr.timeout = 300000; // 5 minute timeout for large image processing
      xhr.send(formData);
    });
  };

  const handleUpload = async () => {
    if (uploadMode === 'single') {
      if (!selectedFile) {
        setMessage('Please select a file first');
        return;
      }

      if (!selectedFolder) {
        setMessage('Please select a folder');
        return;
      }

      setUploading(true);
      setSingleFileProgress(0);
      setMessage('Uploading...');

      const result = await uploadSingleFile(selectedFile, (progress) => {
        setSingleFileProgress(Math.round(progress));
      });

      if (result.success) {
        setSingleFileProgress(100);
        setMessage('Image uploaded successfully! Processing lossless versions...');
        setTimeout(() => {
          setSelectedFile(null);
          setPreview(null);
          setSingleFileProgress(0);
          document.getElementById('file-input').value = '';
        }, 1000);
      } else {
        console.error('Upload failed:', result);
        setMessage(`Error: ${result.error || 'Upload failed'}`);
        setSingleFileProgress(0);
      }
      setUploading(false);
    } else {
      // Batch upload with parallel chunks (no client-side compression)
      if (selectedFiles.length === 0) {
        setMessage('Please select files first');
        return;
      }

      if (!selectedFolder) {
        setMessage('Please select a folder');
        return;
      }

      setUploading(true);
      setMessage('Uploading original quality images...');
      setUploadProgress([]);

      // Upload in parallel chunks
      // Reduced parallelism to prevent backend memory exhaustion
      // Chunk size: 5 files per batch (reduced from 20)
      // Parallel chunks: 2 concurrent requests (reduced from 3)
      const chunkSize = 5;
      const parallelChunks = 2;
      const results = [];

      for (let i = 0; i < selectedFiles.length; i += chunkSize * parallelChunks) {
        const chunks = [];

        // Create up to 3 chunks to upload in parallel
        for (let j = 0; j < parallelChunks; j++) {
          const start = i + (j * chunkSize);
          const chunk = selectedFiles.slice(start, start + chunkSize);

          if (chunk.length > 0) {
            // Upload chunk in parallel (all files in chunk upload together)
            const chunkPromise = Promise.all(
              chunk.map(file => uploadSingleFile(file, (progress) => {
                // Individual file progress can be tracked here if needed
              }))
            ).then(chunkResults => {
              results.push(...chunkResults);
              setUploadProgress(prev => [...prev, ...chunkResults]);
              setCurrentlyUploading(results.length);
              return chunkResults;
            });
            chunks.push(chunkPromise);
          }
        }

        // Wait for all parallel chunks to complete before next batch
        await Promise.all(chunks);

        // Add a small delay between batches to prevent backend memory exhaustion
        if (i + chunkSize * parallelChunks < selectedFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      // Log failed uploads for debugging
      if (failCount > 0) {
        const failedUploads = results.filter(r => !r.success);
        console.error('Failed uploads:', failedUploads);
        const firstError = failedUploads[0]?.error || 'Unknown error';
        setMessage(`Upload failed: ${firstError}. ${successCount} succeeded, ${failCount} failed.`);
      } else {
        setMessage(`Upload complete: ${successCount} succeeded. Server processing lossless versions...`);
      }
      setUploading(false);
      setCurrentlyUploading(0);

      // Clear after a delay if all succeeded
      if (failCount === 0) {
        setTimeout(() => {
          setSelectedFiles([]);
          setUploadProgress([]);
          document.getElementById('file-input-multiple').value = '';
          if (document.getElementById('file-input-folder')) {
            document.getElementById('file-input-folder').value = '';
          }
        }, 2000);
      }
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setSelectedFiles([]);
    setPreview(null);
    setMessage('');
    setUploadProgress([]);
    if (document.getElementById('file-input')) {
      document.getElementById('file-input').value = '';
    }
    if (document.getElementById('file-input-multiple')) {
      document.getElementById('file-input-multiple').value = '';
    }
    if (document.getElementById('file-input-folder')) {
      document.getElementById('file-input-folder').value = '';
    }
  };

  const handleModeChange = (mode) => {
    handleClear();
    setUploadMode(mode);
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

        {/* Upload Mode Selector */}
        <div className="upload-mode-selector">
          <button
            className={`mode-btn ${uploadMode === 'single' ? 'active' : ''}`}
            onClick={() => handleModeChange('single')}
            disabled={uploading}
          >
            Single Image
          </button>
          <button
            className={`mode-btn ${uploadMode === 'multiple' ? 'active' : ''}`}
            onClick={() => handleModeChange('multiple')}
            disabled={uploading}
          >
            Multiple Images
          </button>
          <button
            className={`mode-btn ${uploadMode === 'folder' ? 'active' : ''}`}
            onClick={() => handleModeChange('folder')}
            disabled={uploading}
          >
            Folder
          </button>
        </div>

        {/* Single File Upload */}
        {uploadMode === 'single' && (
          <>
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

            {/* Single File Upload Progress */}
            {uploading && uploadMode === 'single' && (
              <div className="upload-progress-container">
                <div className="progress-bar-wrapper">
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${singleFileProgress}%` }}
                    ></div>
                  </div>
                  <span className="progress-text">{singleFileProgress}%</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Multiple Files Upload */}
        {uploadMode === 'multiple' && (
          <>
            <div
              className="drop-zone soft-zone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-input-multiple').click()}
            >
              <div className="drop-zone-content">
                <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <p>Click to browse or drag and drop multiple images</p>
                <p className="file-types">Select multiple PNG, JPG, GIF files</p>
              </div>
            </div>

            <input
              id="file-input-multiple"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {selectedFiles.length > 0 && (
              <div className="file-info">
                <p><strong>{selectedFiles.length} images selected</strong></p>
              </div>
            )}

            {/* Multiple Files Upload Progress */}
            {uploading && uploadMode === 'multiple' && (
              <div className="upload-progress-container">
                <div className="progress-info">
                  <p>Uploading: {currentlyUploading} / {selectedFiles.length}</p>
                </div>
                <div className="progress-bar-wrapper">
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${(currentlyUploading / selectedFiles.length) * 100}%` }}
                    ></div>
                  </div>
                  <span className="progress-text">
                    {Math.round((currentlyUploading / selectedFiles.length) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Folder Upload */}
        {uploadMode === 'folder' && (
          <>
            <div
              className="drop-zone soft-zone"
              onClick={() => document.getElementById('file-input-folder').click()}
            >
              <div className="drop-zone-content">
                <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10l-3 3m0 0l-3-3m3 3V3" />
                </svg>
                <p>Click to select a folder</p>
                <p className="file-types">All images in the folder will be uploaded</p>
              </div>
            </div>

            <input
              id="file-input-folder"
              type="file"
              webkitdirectory="true"
              directory="true"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {selectedFiles.length > 0 && (
              <div className="file-info">
                <p><strong>{selectedFiles.length} images found in folder</strong></p>
              </div>
            )}
          </>
        )}

        {/* Upload Progress */}
        {uploadMode !== 'single' && uploading && uploadProgress.length > 0 && (
          <div className="upload-progress">
            <p className="progress-header">
              Uploading {currentlyUploading} of {selectedFiles.length}...
            </p>
            <div className="progress-list">
              {uploadProgress.map((result, idx) => (
                <div key={idx} className={`progress-item ${result.success ? 'success' : 'error'}`}>
                  <span className="progress-filename">{result.filename}</span>
                  <span className="progress-status">
                    {result.success ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {message && (
          <div className={`message ${message.includes('Error') || message.includes('failed') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={(uploadMode === 'single' ? !selectedFile : selectedFiles.length === 0) || uploading}
          >
            {uploading ? (uploadMode === 'single' ? 'Uploading...' : `Uploading ${currentlyUploading}/${selectedFiles.length}...`) : 'Upload'}
          </button>
          {((uploadMode === 'single' && selectedFile) || (uploadMode !== 'single' && selectedFiles.length > 0)) && (
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

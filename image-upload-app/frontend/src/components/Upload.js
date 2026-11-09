import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ensureCsrfToken } from '../utils/csrf';
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
  const [singleFileProgress, setSingleFileProgress] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentName, setCurrentName] = useState('');
  // Only the failures are kept, not a row per file: a 1000-image batch would
  // otherwise render 1000 DOM nodes and re-render all of them on every file.
  const [failed, setFailed] = useState([]);

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

  // A 500-1000 image batch runs for a long time, and closing the tab or hitting
  // refresh silently abandons it part-way. Ask first while one is in flight.
  useEffect(() => {
    if (!uploading) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

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

  // Retry transport failures once. A 4xx is a permissions, CSRF or file problem
  // that a retry cannot fix, so those are not retried.
  const MAX_ATTEMPTS = 2;

  const uploadSingleFile = async (file, onProgress) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('folderId', selectedFolder);

    const uploadUrl = `${apiUrl}/api/images`;

    // This request goes out over XMLHttpRequest (for upload progress events), so
    // the global window.fetch CSRF wrapper does NOT apply — we attach the
    // double-submit header ourselves or the server rejects the POST with 403.
    const csrfToken = await ensureCsrfToken();
    if (!csrfToken) {
      return {
        success: false,
        filename: file.name,
        error: 'Could not obtain a security token. Please reload the page and try again.',
      };
    }

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
            // Usually an nginx error page (502/504) rather than our API, so this
            // is worth one retry.
            console.error('[Upload] Non-JSON response:', xhr.responseText.substring(0, 200));
            resolve({
              success: false,
              filename: file.name,
              retriable: true,
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
              retriable: xhr.status >= 500,
              error: data.error || `HTTP ${xhr.status}`
            });
          }
        } catch (error) {
          console.error('Upload parse error:', error);
          resolve({
            success: false,
            filename: file.name,
            retriable: true,
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
          retriable: true,
          error: 'Network error'
        });
      });

      // Handle the xhr.timeout set below. XHR fires a `timeout` event — NOT
      // `error` and NOT `abort` — when that timer expires, so without this
      // listener the promise never settles and the whole batch waits on it
      // forever with no error shown.
      xhr.addEventListener('timeout', () => {
        console.error('Upload timed out');
        resolve({
          success: false,
          filename: file.name,
          retriable: true,
          error: 'Timed out'
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
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      // No Content-Type header: the browser must set it so the multipart
      // boundary is generated correctly for the FormData body.
      xhr.withCredentials = true;
      xhr.timeout = 300000; // 5 minute timeout for large image processing
      xhr.send(formData);
    });
  };

  // Upload a list of files ONE AT A TIME.
  //
  // Sequential on purpose. The upstream connection is the bottleneck, so N
  // parallel uploads are not faster overall — each just gets 1/N of the
  // bandwidth while all N race the same 5-minute timeout, which is how a large
  // batch used to fail wholesale. One at a time means every request finishes
  // quickly, a failure names a single file, a retry costs one file, and the
  // server only ever holds one image in memory.
  //
  // Returns the files that still failed after their retry.
  const runBatch = async (files) => {
    const failures = [];
    setTotalCount(files.length);
    setDoneCount(0);
    setFailed([]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentName(file.name);
      setSingleFileProgress(0);

      let result;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        result = await uploadSingleFile(file, (p) => setSingleFileProgress(Math.round(p)));
        if (result.success || !result.retriable) break;
        console.warn(`[Upload] retrying ${file.name} (attempt ${attempt + 1}): ${result.error}`);
      }

      if (!result.success) {
        failures.push({ file, filename: file.name, error: result.error });
        setFailed([...failures]);
      }
      setDoneCount(i + 1);
    }

    setCurrentName('');
    return failures;
  };

  const summarise = (files, failures) => {
    const okCount = files.length - failures.length;
    if (failures.length === 0) {
      return `Upload complete: ${okCount} succeeded. The server is still building display versions in the background.`;
    }
    return `${okCount} of ${files.length} succeeded, ${failures.length} failed (first error: ${failures[0].error}).`;
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
        setMessage('Image uploaded. The server is still building display versions in the background.');
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
      return;
    }

    if (selectedFiles.length === 0) {
      setMessage('Please select files first');
      return;
    }

    if (!selectedFolder) {
      setMessage('Please select a folder');
      return;
    }

    setUploading(true);
    setMessage(`Uploading ${selectedFiles.length} image(s) at original quality...`);

    const failures = await runBatch(selectedFiles);

    setMessage(summarise(selectedFiles, failures));
    setUploading(false);

    if (failures.length === 0) {
      setTimeout(() => {
        setSelectedFiles([]);
        setDoneCount(0);
        setTotalCount(0);
        document.getElementById('file-input-multiple').value = '';
        if (document.getElementById('file-input-folder')) {
          document.getElementById('file-input-folder').value = '';
        }
      }, 2000);
    }
  };

  // Re-run only the files that failed, so a batch of 1000 never has to be
  // re-selected and re-sent because a handful of them timed out.
  const handleRetryFailed = async () => {
    const files = failed.map((f) => f.file);
    if (files.length === 0) return;

    setUploading(true);
    setMessage(`Retrying ${files.length} failed image(s)...`);

    const failures = await runBatch(files);

    setMessage(summarise(files, failures));
    setUploading(false);
  };


  const handleClear = () => {
    setSelectedFile(null);
    setSelectedFiles([]);
    setPreview(null);
    setMessage('');
    setFailed([]);
    setDoneCount(0);
    setTotalCount(0);
    setCurrentName('');
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

        {/* Batch progress: overall position, then the current file */}
        {uploadMode !== 'single' && uploading && totalCount > 0 && (
          <div className="upload-progress-container">
            <div className="progress-info">
              <p>Uploaded {doneCount} of {totalCount}</p>
              {currentName && <p className="file-types">{currentName} — {singleFileProgress}%</p>}
            </div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(doneCount / totalCount) * 100}%` }}
                ></div>
              </div>
              <span className="progress-text">
                {Math.round((doneCount / totalCount) * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Failures, with a retry that re-sends only these files */}
        {uploadMode !== 'single' && failed.length > 0 && (
          <div className="upload-progress">
            <p className="progress-header">{failed.length} failed</p>
            <div className="progress-list">
              {failed.map((f, idx) => (
                <div key={idx} className="progress-item error">
                  <span className="progress-filename">{f.filename}</span>
                  <span className="progress-status">{f.error}</span>
                </div>
              ))}
            </div>
            {!uploading && (
              <button className="btn btn-secondary" onClick={handleRetryFailed}>
                Retry {failed.length} failed
              </button>
            )}
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
            {uploading ? (uploadMode === 'single' ? 'Uploading...' : `Uploading ${doneCount}/${totalCount}...`) : 'Upload'}
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

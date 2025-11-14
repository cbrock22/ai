import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FolderAccessManager from './FolderAccessManager';
import '../common.css';
import './Folders.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const Folders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [displayOnPublicGallery, setDisplayOnPublicGallery] = useState(false);
  const [folderPassword, setFolderPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [managingFolder, setManagingFolder] = useState(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [deletingFolder, setDeletingFolder] = useState(null);
  const [deleteProgress, setDeleteProgress] = useState('');

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/folders`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setFolders(data);
      } else {
        setError('Failed to load folders');
      }
    } catch (error) {
      console.error('Fetch folders error:', error);
      setError('Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newFolderName,
          isPublic,
          displayOnPublicGallery,
          password: folderPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setFolders([data.folder, ...folders]);
        setShowCreateModal(false);
        setNewFolderName('');
        setIsPublic(false);
        setDisplayOnPublicGallery(false);
        setFolderPassword('');
      } else {
        setError(data.error || 'Failed to create folder');
      }
    } catch (error) {
      console.error('Create folder error:', error);
      setError('Failed to create folder');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    const folder = folders.find(f => f._id === folderId);
    const imageCount = folder?.imageCount || 0;

    const confirmMessage = imageCount > 0
      ? `Are you sure you want to delete "${folder.name}"? This will permanently delete ${imageCount} ${imageCount === 1 ? 'image' : 'images'}.`
      : `Are you sure you want to delete "${folder.name}"?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Show deletion progress
      setDeletingFolder(folder);
      setDeleteProgress(`Preparing to delete folder...`);

      const token = localStorage.getItem('token');

      // Update progress message
      if (imageCount > 0) {
        setDeleteProgress(`Deleting ${imageCount} ${imageCount === 1 ? 'image' : 'images'}...`);
      }

      const response = await fetch(`${API_URL}/api/folders/${folderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setDeleteProgress(`Successfully deleted ${data.deletedImages || 0} ${data.deletedImages === 1 ? 'image' : 'images'}`);

        // Wait a moment to show success message
        setTimeout(() => {
          setFolders(folders.filter(f => f._id !== folderId));
          setDeletingFolder(null);
          setDeleteProgress('');
        }, 1000);
      } else {
        const data = await response.json();
        setDeletingFolder(null);
        setDeleteProgress('');
        alert(data.error || 'Failed to delete folder');
      }
    } catch (error) {
      console.error('Delete folder error:', error);
      setDeletingFolder(null);
      setDeleteProgress('');
      alert('Failed to delete folder');
    }
  };

  const copyPublicLink = async (folderId) => {
    const publicUrl = `${window.location.origin}/public/folder/${folderId}`;

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyMessage('Link copied to clipboard!');
      setTimeout(() => setCopyMessage(''), 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyMessage('Failed to copy link');
      setTimeout(() => setCopyMessage(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading folders...</p>
      </div>
    );
  }

  return (
    <div className="folders-container">
      <div className="folders-header soft-card">
        <div>
          <h1 className="gradient-text">My Folders</h1>
          <p className="folders-subtitle">Organize and manage your image collections</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
        >
          + New Folder
        </button>
      </div>

      {error && <div className="message error">{error}</div>}
      {copyMessage && <div className="message success">{copyMessage}</div>}

      {folders.length === 0 ? (
        <div className="empty-state soft-card">
          <p>No folders yet</p>
          <p className="empty-subtitle">Create your first folder to start organizing images</p>
        </div>
      ) : (
        <div className="folders-grid">
          {folders.map(folder => (
            <div
              key={folder._id}
              className="folder-card soft-card"
              onClick={() => navigate(`/folders/${folder._id}`)}
            >
              <div className="folder-preview">
                {folder.previewImages && folder.previewImages.length > 0 ? (
                  <div className={`preview-grid preview-count-${Math.min(folder.previewImages.length, 3)}`}>
                    {folder.previewImages.slice(0, 3).map((img, idx) => (
                      <div key={idx} className="preview-image-container">
                        <img src={img.url} alt="" className="preview-image" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-folder-preview">
                    <svg className="folder-icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p>Empty folder</p>
                  </div>
                )}
              </div>
              <div className="folder-info">
                <h3>{folder.name}</h3>
                <p className="folder-stats">
                  {folder.imageCount || 0} {folder.imageCount === 1 ? 'image' : 'images'}
                </p>
                <div className="folder-meta">
                  <span className={`folder-badge ${folder.isPublic ? 'public' : 'private'}`}>
                    {folder.isPublic ? '🌐 Public' : '🔒 Private'}
                  </span>
                  <span className="folder-owner-badge">
                    👤 {folder.owner.username}
                  </span>
                  {user.role === 'admin' && folder.owner._id !== user._id && (
                    <span className="folder-admin-badge">
                      ⚡ Admin Access
                    </span>
                  )}
                </div>
                {folder.isPublic && (
                  <button
                    className="btn-copy-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyPublicLink(folder._id);
                    }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Public Link
                  </button>
                )}
              </div>
              {(folder.owner._id === user._id || user.role === 'admin') && (
                <div className="folder-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setManagingFolder(folder);
                    }}
                    className="btn-manage-access"
                    title="Manage Access"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </button>
                  {(folder.owner._id === user._id || user.role === 'admin') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFolder(folder._id);
                      }}
                      className="btn-delete"
                      title="Delete Folder"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content soft-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="gradient-text">Create New Folder</h2>
            <form onSubmit={handleCreateFolder} className="folder-form">
              <div className="form-group">
                <label htmlFor="folderName">Folder Name</label>
                <input
                  type="text"
                  id="folderName"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  required
                  placeholder="e.g., Vacation 2024"
                  className="form-input"
                />
              </div>

              <div className="form-group-checkbox">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={isPublic}
                  onChange={(e) => {
                    setIsPublic(e.target.checked);
                    if (!e.target.checked) {
                      setDisplayOnPublicGallery(false);
                    }
                  }}
                  className="form-checkbox"
                />
                <label htmlFor="isPublic">Make this folder public</label>
              </div>

              {isPublic && (
                <>
                  <div className="form-group-checkbox">
                    <input
                      type="checkbox"
                      id="displayOnPublicGallery"
                      checked={displayOnPublicGallery}
                      onChange={(e) => setDisplayOnPublicGallery(e.target.checked)}
                      className="form-checkbox"
                    />
                    <label htmlFor="displayOnPublicGallery">Display on Public Gallery</label>
                  </div>
                  <p className="form-hint" style={{ marginTop: '-8px', marginLeft: '24px' }}>
                    Featured folders will appear on the app's landing page
                  </p>

                  <div className="form-group">
                    <label htmlFor="folderPassword">Password (Optional)</label>
                    <input
                      type="password"
                      id="folderPassword"
                      value={folderPassword}
                      onChange={(e) => setFolderPassword(e.target.value)}
                      placeholder="Leave blank for no password"
                      className="form-input"
                    />
                    <p className="form-hint">Add a password to restrict access to this public folder</p>
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folder Access Manager Modal */}
      {managingFolder && (
        <FolderAccessManager
          folder={managingFolder}
          onClose={() => setManagingFolder(null)}
          onUpdate={() => {
            fetchFolders();
            // Fetch updated folder data to refresh permissions
            const fetchUpdatedFolder = async () => {
              try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API_URL}/api/folders/${managingFolder._id}`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                  const updatedFolder = await response.json();
                  setManagingFolder(updatedFolder);
                }
              } catch (err) {
                console.error('Failed to fetch updated folder:', err);
              }
            };
            fetchUpdatedFolder();
          }}
        />
      )}

      {/* Deletion Progress Modal */}
      {deletingFolder && (
        <div className="modal-overlay">
          <div className="modal-content soft-card deletion-progress-modal">
            <h2 className="gradient-text">Deleting Folder</h2>
            <div className="deletion-info">
              <h3>{deletingFolder.name}</h3>
              <div className="spinner-container">
                <div className="spinner"></div>
              </div>
              <p className="delete-progress-message">{deleteProgress}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Folders;

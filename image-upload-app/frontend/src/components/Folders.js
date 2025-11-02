import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../common.css';
import './Folders.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const Folders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);

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
          isPublic
        })
      });

      const data = await response.json();

      if (response.ok) {
        setFolders([data.folder, ...folders]);
        setShowCreateModal(false);
        setNewFolderName('');
        setIsPublic(false);
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
    if (!window.confirm('Are you sure you want to delete this folder?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/folders/${folderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        setFolders(folders.filter(f => f._id !== folderId));
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete folder');
      }
    } catch (error) {
      console.error('Delete folder error:', error);
      alert('Failed to delete folder');
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
                    {folder.owner.username}
                  </span>
                </div>
              </div>
              {folder.owner._id === user._id && (
                <div className="folder-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder._id);
                    }}
                    className="btn-delete"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="form-checkbox"
                />
                <label htmlFor="isPublic">Make this folder public</label>
              </div>

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
    </div>
  );
};

export default Folders;

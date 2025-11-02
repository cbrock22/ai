import React, { useState, useEffect } from 'react';
import './FolderAccessManager.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const FolderAccessManager = ({ folder, onClose, onUpdate }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAccess, setSelectedAccess] = useState('read');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Filter out folder owner and users who already have access
        const existingUserIds = folder.permissions.map(p => p.user._id);
        const availableUsers = data.filter(
          user => user._id !== folder.owner._id && !existingUserIds.includes(user._id)
        );
        setUsers(availableUsers);
      }
    } catch (err) {
      setError('Failed to load users');
    }
  };

  const handleAddUser = async () => {
    if (!selectedUser) {
      setError('Please select a user');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/folders/${folder._id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: selectedUser,
          access: selectedAccess
        })
      });

      if (response.ok) {
        setSelectedUser('');
        setSelectedAccess('read');
        onUpdate(); // Refresh folder data
        fetchUsers(); // Refresh available users
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to add user');
      }
    } catch (err) {
      setError('Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!window.confirm('Are you sure you want to remove this user\'s access?')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/folders/${folder._id}/permissions/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        onUpdate(); // Refresh folder data
        fetchUsers(); // Refresh available users
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to remove user');
      }
    } catch (err) {
      setError('Failed to remove user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAccess = async (userId, newAccess) => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/folders/${folder._id}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: userId,
          access: newAccess
        })
      });

      if (response.ok) {
        onUpdate(); // Refresh folder data
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to update access');
      }
    } catch (err) {
      setError('Failed to update access');
    } finally {
      setLoading(false);
    }
  };

  const getAccessBadgeClass = (access) => {
    switch (access) {
      case 'admin': return 'access-badge-admin';
      case 'write': return 'access-badge-write';
      case 'read': return 'access-badge-read';
      default: return 'access-badge-read';
    }
  };

  return (
    <div className="folder-access-overlay">
      <div className="folder-access-modal">
        <div className="folder-access-header">
          <h2>Manage Access: {folder.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="folder-access-content">
          {/* Current Access List */}
          <div className="access-section">
            <h3>Current Access</h3>

            {/* Owner */}
            <div className="access-item owner-item">
              <div className="user-info">
                <span className="username">{folder.owner.username}</span>
                <span className="user-email">{folder.owner.email}</span>
              </div>
              <span className="access-badge access-badge-owner">Owner</span>
            </div>

            {/* Permissions */}
            {folder.permissions && folder.permissions.length > 0 ? (
              folder.permissions.map(permission => (
                <div key={permission.user._id} className="access-item">
                  <div className="user-info">
                    <span className="username">{permission.user.username}</span>
                    <span className="user-email">{permission.user.email}</span>
                  </div>
                  <div className="access-controls">
                    <select
                      value={permission.access}
                      onChange={(e) => handleUpdateAccess(permission.user._id, e.target.value)}
                      disabled={loading}
                      className={`access-select ${getAccessBadgeClass(permission.access)}`}
                    >
                      <option value="read">Read</option>
                      <option value="write">Write</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => handleRemoveUser(permission.user._id)}
                      disabled={loading}
                      className="remove-button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="no-permissions">No additional users have access</p>
            )}
          </div>

          {/* Add User Section */}
          <div className="access-section add-user-section">
            <h3>Add User</h3>
            {users.length > 0 ? (
              <div className="add-user-form">
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  disabled={loading}
                  className="user-select"
                >
                  <option value="">Select a user...</option>
                  {users.map(user => (
                    <option key={user._id} value={user._id}>
                      {user.username} ({user.email})
                    </option>
                  ))}
                </select>
                <select
                  value={selectedAccess}
                  onChange={(e) => setSelectedAccess(e.target.value)}
                  disabled={loading}
                  className="access-level-select"
                >
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={handleAddUser}
                  disabled={loading || !selectedUser}
                  className="add-button"
                >
                  Add User
                </button>
              </div>
            ) : (
              <p className="no-users">All users already have access or no other users exist</p>
            )}
          </div>

          {/* Access Level Descriptions */}
          <div className="access-section access-info">
            <h3>Access Levels</h3>
            <ul className="access-descriptions">
              <li><strong>Read:</strong> Can view images in this folder</li>
              <li><strong>Write:</strong> Can view and upload images to this folder</li>
              <li><strong>Admin:</strong> Full control - can manage folder settings and permissions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderAccessManager;

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../common.css';
import './Users.css';

const Users = () => {
  const { token, apiUrl, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/auth/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
        setError('');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to fetch users');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const response = await fetch(`${apiUrl}/api/auth/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(users.map(u => u._id === userId ? data.user : u));
        setSuccessMessage(`User role updated to ${newRole}`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update user role');
      }
    } catch (err) {
      alert('Failed to update user role');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        setUsers(users.filter(u => u._id !== userId));
        setSuccessMessage(`User "${username}" deleted successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (err) {
      alert('Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="users-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading users...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="users-container">
        <div className="error-message">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={fetchUsers}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="users-container">
      <div className="users-header">
        <h2 className="gradient-text">User Management</h2>
        <p className="users-subtitle">Manage users and their roles</p>
      </div>

      {successMessage && (
        <div className="message success">
          {successMessage}
        </div>
      )}

      <div className="users-stats">
        <div className="stat-card">
          <div className="stat-number">{users.length}</div>
          <div className="stat-label">Total Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{users.filter(u => u.role === 'admin').length}</div>
          <div className="stat-label">Admins</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{users.filter(u => u.role === 'user').length}</div>
          <div className="stat-label">Regular Users</div>
        </div>
      </div>

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className={user._id === currentUser?._id ? 'current-user' : ''}>
                <td className="user-username">
                  {user.username}
                  {user._id === currentUser?._id && (
                    <span className="badge-you">You</span>
                  )}
                </td>
                <td className="user-email">{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role === 'admin' ? '👑 Admin' : '👤 User'}
                  </span>
                </td>
                <td className="user-date">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="user-actions">
                  {user._id !== currentUser?._id && (
                    <>
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user._id, e.target.value)}
                        className="role-select"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => handleDeleteUser(user._id, user.username)}
                        className="btn-delete-user"
                        title="Delete user"
                      >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Users;

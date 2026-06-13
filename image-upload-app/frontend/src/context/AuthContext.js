import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('admin'); // 'admin' or 'user'
  // Track the token in state so the context value has a STABLE reference between
  // renders. (Previously `token: localStorage.getItem(...)` ran every render and,
  // together with an unmemoized value object, forced every useAuth() consumer —
  // i.e. the whole app — to re-render on any provider render.)
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('token'); } catch { return null; }
  });
  const API_URL = process.env.REACT_APP_API_URL || '';

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email, password) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, [API_URL]);

  const signup = useCallback(async (username, email, password) => {
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Signup failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, [API_URL]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setViewMode('admin'); // Reset to admin view on logout
    }
  }, [API_URL]);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'admin' ? 'user' : 'admin');
  }, []);

  // Single memoized context value. Identity only changes when one of the real
  // inputs changes, so consumers that don't depend on the changed field can be
  // skipped by React.memo downstream. Methods are stable (useCallback) above.
  const value = useMemo(() => ({
    user,
    loading,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    viewMode,
    toggleViewMode,
    isAdminView: user?.role === 'admin' && viewMode === 'admin',
    token,
    apiUrl: API_URL
  }), [user, loading, viewMode, token, login, signup, logout, toggleViewMode, API_URL]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

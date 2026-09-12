import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Hand a just-verified credential to the browser's own password manager.
//
// Why this is needed: sign-in here is a fetch + React Router pushState, never a
// document navigation. Chrome's "did a login just succeed?" heuristic keys off
// form submission followed by a page load, so it usually never fires and the
// save prompt never appears. store() says it explicitly instead of hoping the
// heuristic catches on.
//
// Scope and safety:
//  - Chromium only (Chrome 51+, Edge 79+, Samsung Internet 5+). Firefox and
//    Safari have never shipped PasswordCredential; there this is a silent no-op
//    and the name/autoComplete attributes on the auth forms do the work.
//  - Secure context and top-level browsing context only, enforced by the browser
//    (it cannot be called from an iframe).
//  - User-mediated and origin-scoped: it opens the browser's own save prompt for
//    THIS origin. It cannot store a credential silently or for another site.
//  - No new exposure. The password is already in this function's scope; we hand
//    it to the browser's password store and nowhere else.
//  - Uses only the surviving API surface. PasswordCredential's idName /
//    passwordName / additionalData fields and the custom fetch() integration
//    were deprecated and removed upstream -- do not reintroduce them.
//  - Deliberately NOT paired with credentials.get({ mediation: 'silent' }).
//    Silent auto-sign-in is the risky half of this API and we don't want it.
//
// This must never break sign-in: fully feature-detected, and any rejection is
// swallowed rather than surfaced as a failed login.
const storeCredential = async (id, password, name) => {
  try {
    if (typeof window === 'undefined') return;
    if (!window.PasswordCredential || !navigator.credentials?.store) return;
    await navigator.credentials.store(
      new window.PasswordCredential({ id, password, name })
    );
  } catch {
    // Unsupported, blocked by policy, or dismissed -- all non-fatal.
  }
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
    // Fire-and-forget: the save prompt is browser chrome, so it survives the
    // client-side redirect and never adds latency to sign-in.
    storeCredential(email, password, data.user?.username);
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
    // Fire-and-forget: the save prompt is browser chrome, so it survives the
    // client-side redirect and never adds latency to sign-in.
    storeCredential(email, password, username);
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

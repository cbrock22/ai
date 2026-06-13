import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './components/Home';
import Login from './components/Login';
import Signup from './components/Signup';
import Upload from './components/Upload';
import Gallery from './components/Gallery';
import PublicGallery from './components/PublicGallery';
import Folders from './components/Folders';
import FolderDetail from './components/FolderDetail';
import PublicFolderView from './components/PublicFolderView';
import Users from './components/Users';
import './App.css';

// Module-scope constant so it isn't flagged as a missing useEffect dependency.
const DESKTOP_QUERY = '(min-width: 768px)';

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      <span className="theme-toggle-label">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}

/**
 * Top navigation.
 * - Mobile: a sticky top bar that's ALWAYS visible; links live behind a burger.
 * - Desktop: the bar is hidden by default and drops down only while the cursor
 *   is in the top half of the viewport (revealed on intent, out of the way
 *   otherwise). We track the pointer with a ref and only setState when the
 *   top-half boolean actually flips, so mousemove doesn't thrash React.
 */
function TopNav() {
  const { isAuthenticated, user, logout, isAdmin, viewMode, toggleViewMode, isAdminView } = useAuth();

  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );
  const [navVisible, setNavVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const inTopHalf = useRef(true);

  // Track viewport class (mobile vs desktop).
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Desktop: reveal on pointer in the top half; mobile: always visible.
  useEffect(() => {
    if (!isDesktop) {
      setNavVisible(true);
      return undefined;
    }
    setNavVisible(false);
    inTopHalf.current = false;
    const onMove = (e) => {
      const top = e.clientY < window.innerHeight / 2;
      if (top !== inTopHalf.current) {
        inTopHalf.current = top;
        setNavVisible(top);
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [isDesktop]);

  // Close the mobile dropdown after navigating or acting.
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const handleLogout = useCallback(() => {
    logout();
    closeMenu();
  }, [logout, closeMenu]);

  return (
    <header className={`topnav ${navVisible ? 'is-visible' : 'is-hidden'}`}>
      <div className="topnav-inner">
        <Link to="/" className="topnav-brand" onClick={closeMenu}>opticoles pics</Link>

        <button
          type="button"
          className="topnav-burger"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>

        <nav className={`topnav-links ${menuOpen ? 'open' : ''}`}>
          {isAuthenticated ? (
            <>
              <NavLink to="/" className="topnav-link" onClick={closeMenu} end>Public Gallery</NavLink>
              <NavLink to="/home" className="topnav-link" onClick={closeMenu}>Dashboard</NavLink>
              <NavLink to="/folders" className="topnav-link" onClick={closeMenu}>Folders</NavLink>
              <NavLink to="/upload" className="topnav-link" onClick={closeMenu}>Upload</NavLink>
              <NavLink to="/gallery" className="topnav-link" onClick={closeMenu}>Gallery</NavLink>
              {isAdminView && (
                <NavLink to="/users" className="topnav-link" onClick={closeMenu}>Users</NavLink>
              )}
              {isAuthenticated && user?.username && (
                <span className="topnav-welcome">Hi, {user.username}</span>
              )}
              {isAdmin && (
                <button type="button" className="view-toggle" onClick={toggleViewMode}>
                  {viewMode === 'admin' ? '👑 Admin View' : '👤 User View'}
                </button>
              )}
              <ThemeToggleButton />
              <button type="button" className="nav-logout" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="topnav-link" onClick={closeMenu}>Login</NavLink>
              <NavLink to="/signup" className="topnav-link" onClick={closeMenu}>Sign Up</NavLink>
              <ThemeToggleButton />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function AppContent() {
  return (
    <div className="App min-h-screen">
      <TopNav />
      <main className="app-main">
        <div className="app-main-inner">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<PublicGallery />} />
            <Route path="/public/folder/:folderId" element={<PublicFolderView />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/register" element={<Signup />} />
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/folders" element={<ProtectedRoute><Folders /></ProtectedRoute>} />
            <Route path="/folders/:folderId" element={<ProtectedRoute><FolderDetail /></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/gallery" element={<ProtectedRoute><Gallery /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;

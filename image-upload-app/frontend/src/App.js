import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
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
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}

function AppContent() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isAuthenticated, user, logout, isAdmin, viewMode, toggleViewMode, isAdminView } = useAuth();

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
  };

  return (
    <div className="App min-h-screen">
      {/* Floating Hamburger Menu Button - Mobile Only */}
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="app-hamburger md:hidden fixed bottom-6 left-6 z-50 rounded-full p-4 transition-all duration-300 hover:scale-105"
        aria-label="Toggle menu"
      >
        <div className="w-6 h-5 flex flex-col justify-between">
          <span className={`bar w-full h-0.5 rounded-full transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
          <span className={`bar w-full h-0.5 rounded-full transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
          <span className={`bar w-full h-0.5 rounded-full transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
        </div>
      </button>

      {/* Desktop Menu - Always Visible */}
      <div className="hidden md:block fixed top-0 left-0 h-full w-64 app-sidebar z-40">
        <div className="pt-8 px-8 flex flex-col gap-6">
          <div>
            <h2 className="app-brand text-2xl mb-2">
              opticoles pics
            </h2>
            {isAuthenticated && (
              <p className="app-welcome text-sm">
                Welcome, {user?.username}
              </p>
            )}
          </div>

          {isAuthenticated ? (
            <>
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Public Gallery
              </Link>
              <Link
                to="/home"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Dashboard
              </Link>
              <Link
                to="/folders"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Folders
              </Link>
              <Link
                to="/upload"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Upload
              </Link>
              <Link
                to="/gallery"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Gallery
              </Link>
              {isAdminView && (
                <Link
                  to="/users"
                  onClick={() => setIsMenuOpen(false)}
                  className="nav-link text-lg font-light"
                >
                  Users
                </Link>
              )}
              {isAdmin && (
                <div className="pt-4 nav-divider">
                  <button
                    onClick={toggleViewMode}
                    className="view-toggle"
                  >
                    {viewMode === 'admin' ? '👑 Admin View' : '👤 User View'}
                  </button>
                </div>
              )}
              <ThemeToggleButton />
              <button
                onClick={handleLogout}
                className="nav-logout text-left text-lg font-light"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Login
              </Link>
              <Link
                to="/signup"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Sign Up
              </Link>
              <ThemeToggleButton />
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu Panel - Slides in from left */}
      <div className={`md:hidden fixed top-0 left-0 h-full w-64 app-sidebar z-40 transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="pt-8 px-8 flex flex-col gap-6">
          <div>
            <h2 className="app-brand text-2xl mb-2">
              opticoles pics
            </h2>
            {isAuthenticated && (
              <p className="app-welcome text-sm">
                Welcome, {user?.username}
              </p>
            )}
          </div>

          {isAuthenticated ? (
            <>
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Public Gallery
              </Link>
              <Link
                to="/home"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Dashboard
              </Link>
              <Link
                to="/folders"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Folders
              </Link>
              <Link
                to="/upload"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Upload
              </Link>
              <Link
                to="/gallery"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Gallery
              </Link>
              {isAdminView && (
                <Link
                  to="/users"
                  onClick={() => setIsMenuOpen(false)}
                  className="nav-link text-lg font-light"
                >
                  Users
                </Link>
              )}
              {isAdmin && (
                <div className="pt-4 nav-divider">
                  <button
                    onClick={toggleViewMode}
                    className="view-toggle"
                  >
                    {viewMode === 'admin' ? '👑 Admin View' : '👤 User View'}
                  </button>
                </div>
              )}
              <ThemeToggleButton />
              <button
                onClick={handleLogout}
                className="nav-logout text-left text-lg font-light"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Login
              </Link>
              <Link
                to="/signup"
                onClick={() => setIsMenuOpen(false)}
                className="nav-link text-lg font-light"
              >
                Sign Up
              </Link>
              <ThemeToggleButton />
            </>
          )}
        </div>
      </div>

      {/* Overlay */}
      {isMenuOpen && (
        <div
          className="app-overlay fixed inset-0 z-30 transition-opacity duration-300"
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}

      {/* Main Content Area */}
      <div className="md:ml-64 min-h-screen">
        <div className="max-w-[1400px] mx-auto px-6 py-10">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<PublicGallery />} />
          <Route path="/public/folder/:folderId" element={<PublicFolderView />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/register" element={<Signup />} />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/folders"
            element={
              <ProtectedRoute>
                <Folders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/folders/:folderId"
            element={
              <ProtectedRoute>
                <FolderDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <Upload />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gallery"
            element={
              <ProtectedRoute>
                <Gallery />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            }
          />
        </Routes>
        </div>
      </div>
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

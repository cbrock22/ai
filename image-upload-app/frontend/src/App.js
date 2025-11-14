import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
        className="md:hidden fixed bottom-6 left-6 z-50 bg-white/80 backdrop-blur-lg rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
        aria-label="Toggle menu"
      >
        <div className="w-6 h-5 flex flex-col justify-between">
          <span className={`w-full h-0.5 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
          <span className={`w-full h-0.5 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300 ${isMenuOpen ? 'opacity-0' : ''}`}></span>
          <span className={`w-full h-0.5 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
        </div>
      </button>

      {/* Desktop Menu - Always Visible */}
      <div className="hidden md:block fixed top-0 left-0 h-full w-64 bg-white/40 backdrop-blur-xl shadow-2xl z-40 border-r border-white/30">
        <div className="pt-8 px-8 flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-light bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-2">
              Image Upload App
            </h2>
            {isAuthenticated && (
              <p className="text-sm text-slate-500 font-light">
                Welcome, {user?.username}
              </p>
            )}
          </div>

          {isAuthenticated ? (
            <>
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Public Gallery
              </Link>
              <Link
                to="/home"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Dashboard
              </Link>
              <Link
                to="/folders"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Folders
              </Link>
              <Link
                to="/upload"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Upload
              </Link>
              <Link
                to="/gallery"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Gallery
              </Link>
              {isAdminView && (
                <Link
                  to="/users"
                  onClick={() => setIsMenuOpen(false)}
                  className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
                >
                  Users
                </Link>
              )}
              {isAdmin && (
                <div className="pt-4 border-t border-slate-200/50">
                  <button
                    onClick={toggleViewMode}
                    className="w-full text-left px-4 py-2 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50 text-slate-700 hover:from-pink-100 hover:to-purple-100 transition-all duration-200 text-sm font-medium"
                  >
                    {viewMode === 'admin' ? '👑 Admin View' : '👤 User View'}
                  </button>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-left text-red-500 hover:text-red-600 transition-colors duration-200 text-lg font-light"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Login
              </Link>
              <Link
                to="/signup"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu Panel - Slides in from left */}
      <div className={`md:hidden fixed top-0 left-0 h-full w-64 bg-white/40 backdrop-blur-xl shadow-2xl z-40 border-r border-white/30 transform transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="pt-8 px-8 flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-light bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-2">
              Image Upload App
            </h2>
            {isAuthenticated && (
              <p className="text-sm text-slate-500 font-light">
                Welcome, {user?.username}
              </p>
            )}
          </div>

          {isAuthenticated ? (
            <>
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Public Gallery
              </Link>
              <Link
                to="/home"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Dashboard
              </Link>
              <Link
                to="/folders"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Folders
              </Link>
              <Link
                to="/upload"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Upload
              </Link>
              <Link
                to="/gallery"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Gallery
              </Link>
              {isAdminView && (
                <Link
                  to="/users"
                  onClick={() => setIsMenuOpen(false)}
                  className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
                >
                  Users
                </Link>
              )}
              {isAdmin && (
                <div className="pt-4 border-t border-slate-200/50">
                  <button
                    onClick={toggleViewMode}
                    className="w-full text-left px-4 py-2 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50 text-slate-700 hover:from-pink-100 hover:to-purple-100 transition-all duration-200 text-sm font-medium"
                  >
                    {viewMode === 'admin' ? '👑 Admin View' : '👤 User View'}
                  </button>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-left text-red-500 hover:text-red-600 transition-colors duration-200 text-lg font-light"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Login
              </Link>
              <Link
                to="/signup"
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-600 hover:text-pink-500 transition-colors duration-200 text-lg font-light"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 transition-opacity duration-300"
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
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;

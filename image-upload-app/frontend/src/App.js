import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home';
import Upload from './components/Upload';
import Gallery from './components/Gallery';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <h1>Image Upload App</h1>
          <div className="nav-links">
            <Link to="/">Home</Link>
            <Link to="/upload">Upload</Link>
            <Link to="/gallery">Gallery</Link>
          </div>
        </nav>

        <div className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/gallery" element={<Gallery />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;

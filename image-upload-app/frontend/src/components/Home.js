import React from 'react';
import { Link } from 'react-router-dom';
import '../common.css';
import './Home.css';

const Home = () => (
  <div className="home">
    <div className="welcome-card soft-card">
      <h1 className="gradient-text">Welcome to opticoles pics</h1>
      <p>Upload and manage your images with ease</p>

      <div className="features">
        {[
          { title: 'Upload Images', desc: 'Easily upload images from your device' },
          { title: 'View Gallery', desc: 'Browse all your uploaded images' },
          { title: 'Mobile Access', desc: 'Access from any device on your network' }
        ].map(({ title, desc }) => (
          <div key={title} className="feature">
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>

      <div className="action-buttons">
        <Link to="/upload" className="btn btn-primary">Start Uploading</Link>
        <Link to="/gallery" className="btn btn-secondary">View Gallery</Link>
      </div>
    </div>
  </div>
);

export default Home;

import React from 'react';
import ReactDOM from 'react-dom/client';
// Installs the global fetch wrapper that attaches the X-CSRF-Token header to
// state-changing API requests. Imported first, for its side effect, so it's
// active before any component fires a request.
import './utils/csrf';
import './theme.css';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

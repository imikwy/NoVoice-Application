/**
 * Dev entry — only used by "npm run dev".
 * Mocks window.NoVoice so the app works in the browser without Electron.
 * This file is NOT included in the production bundle.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

if (!window.NoVoice) {
  window.NoVoice = {
    storage: {
      get(key) {
        try { return JSON.parse(localStorage.getItem(`dev_${key}`)); } catch { return null; }
      },
      set(key, val) { localStorage.setItem(`dev_${key}`, JSON.stringify(val)); },
      remove(key) { localStorage.removeItem(`dev_${key}`); },
    },
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

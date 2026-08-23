import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/theme.css';
import './styles/global.css';

const rendererFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, options = {}) => {
  const started = Date.now();
  try {
    const response = await rendererFetch(input, options);
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input?.url);
      window.native?.telemetry?.trackFetch({
        source: url.hostname.includes('modrinth') ? 'modrinth' : url.hostname.includes('curseforge') ? 'curseforge' : url.hostname,
        host: url.host,
        path: url.pathname,
        method: String(options?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase(),
        status: response.status,
        durationMs: Date.now() - started
      });
    } catch { /* non-HTTP requests are not activity events */ }
    return response;
  } catch (error) {
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input?.url);
      window.native?.telemetry?.trackFetch({
        source: url.hostname.includes('modrinth') ? 'modrinth' : url.hostname.includes('curseforge') ? 'curseforge' : url.hostname,
        host: url.host,
        path: url.pathname,
        method: String(options?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase(),
        status: 0,
        durationMs: Date.now() - started,
        failed: true
      });
    } catch { /* non-HTTP requests are not activity events */ }
    throw error;
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

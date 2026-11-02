import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

window.addEventListener('vite:preloadError', (event) => {
  const retryKey = 'apex-vite-preload-retry';
  try {
    const lastRetry = Number(sessionStorage.getItem(retryKey) || 0);
    if (Date.now() - lastRetry < 30_000) return;
    sessionStorage.setItem(retryKey, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch { /* Let the failed import reach the route error boundary. */ }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

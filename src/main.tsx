import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const retryKey = 'apex-vite-preload-retry';
  try {
    const lastRetry = Number(sessionStorage.getItem(retryKey) || 0);
    if (Date.now() - lastRetry < 30_000) return;
    sessionStorage.setItem(retryKey, String(Date.now()));
    window.location.reload();
  } catch {
    // The route error boundary provides a manual recovery path if storage is unavailable.
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

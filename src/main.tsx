import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

function showStartupFailure() {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) return;

  const main = document.createElement('main');
  main.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#05070b;color:#f5f5f4;font-family:system-ui,sans-serif;text-align:center';
  const content = document.createElement('section');
  const heading = document.createElement('h1');
  heading.textContent = 'The app could not start';
  heading.style.cssText = 'font-size:24px;font-weight:600';
  const message = document.createElement('p');
  message.textContent = 'Reload the page to try again. If this keeps happening, contact support.';
  message.style.cssText = 'margin-top:12px;color:#a8a29e';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload app';
  button.style.cssText = 'margin-top:24px;padding:10px 18px;background:#fbbf24;color:#1a1304;font-weight:600;text-transform:uppercase;cursor:pointer';
  button.addEventListener('click', () => window.location.reload());
  content.append(heading, message, button);
  main.append(content);
  root.replaceChildren(main);
}

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

window.setTimeout(showStartupFailure, 15_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

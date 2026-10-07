/// <reference path="./vite-env.d.ts" />

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, resolveInitialTheme } from './lib/theme';
import './index.css';
import './workspace.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root was not found in index.html.');
}

// Applied before the first paint so the stored theme never flashes the other one.
applyTheme(resolveInitialTheme());

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
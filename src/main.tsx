import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App.tsx';
import AppErrorBoundary from './app/AppErrorBoundary.tsx';
import { clearChunkReloadFlag, installChunkLoadRecovery } from './app/chunkRecovery.ts';

installChunkLoadRecovery();
clearChunkReloadFlag();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary section="app-root" homeLabel="Go Home">
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

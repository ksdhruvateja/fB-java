import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App.tsx';
import AppErrorBoundary from './app/AppErrorBoundary.tsx';
import { FeedbackHost } from './app/feedback.tsx';
import { clearChunkReloadFlag, installChunkLoadRecovery } from './app/chunkRecovery.ts';
import { installWorkflowMutationSync } from './app/workflowSync.ts';

// FixBridge Commercial is a separate site under /commercial with its own accounts and admin.
const CommercialApp = lazy(() => import('./commercial/CommercialApp.tsx'));
const isCommercial = /^\/commercial(?:\/|$)/.test(window.location.pathname);

installChunkLoadRecovery();
clearChunkReloadFlag();
if (!isCommercial) installWorkflowMutationSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary section="app-root" homeLabel="Go Home">
      {isCommercial ? (
        <Suspense fallback={null}>
          <CommercialApp />
        </Suspense>
      ) : (
        <App />
      )}
      <FeedbackHost />
    </AppErrorBoundary>
  </StrictMode>,
);

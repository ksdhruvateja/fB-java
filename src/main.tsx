import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './styles/index.css';
import App from './app/App.tsx';

const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GOOGLE_CLIENT_ID =
  typeof rawClientId === 'string' &&
  rawClientId.trim().length > 0 &&
  rawClientId.includes('.apps.googleusercontent.com')
    ? rawClientId.trim()
    : undefined;

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    {GOOGLE_CLIENT_ID ? (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);

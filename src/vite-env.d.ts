/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_AUTH0_DOMAIN?: string;
  readonly VITE_AUTH0_CLIENT_ID?: string;
  readonly VITE_GCP_PROJECT_ID?: string;
  readonly VITE_GCP_LOCATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __FIXBRIDGE_BUILD__: string;

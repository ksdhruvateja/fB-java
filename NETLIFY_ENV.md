# Netlify environment variables

Vite embeds `VITE_*` values **at build time**. Changing them in the Netlify UI does nothing until you **trigger a new deploy** (Clear cache and deploy site).

## Site settings → Environment variables

Add these for **Production** (and Preview if you want them there too):

| Variable | Notes |
|----------|--------|
| `SESSION_SECRET` | JWT signing secret (set a long random string in production). |
| `NEON_DATABASE_URL` | Postgres connection string (needed for auth/jobs). |
| `GMAIL_USER` | Gmail address for SMTP (password reset + notifications). |
| `GMAIL_APP_PASSWORD` | Google App Password for **SMTP only** (not Google Sign-In). |
| `FROM_EMAIL` | Optional — e.g. `FixBridge <you@gmail.com>`. |
| `APP_URL` | Canonical public site URL: `https://fixbridge.us` (also used for CORS allowlist). |
| `CORS_ORIGINS` | Optional comma-separated extras, e.g. `https://fixbridge.netlify.app,https://www.fixbridge.us`. |
| `GOOGLE_CLIENT_ID` | Google **OAuth web client ID** for Sign in with Google (`….apps.googleusercontent.com`). Public. |
| `VITE_GOOGLE_CLIENT_ID` | Optional server-side fallback of the same client ID only (never a secret). |
| `EXPLABS_API_KEY` | Required for Fixa. First connected provider (Experiential Labs GPT-6 Astra). Server-side only — never `VITE_`. |

### Google Sign-In notes (GIS ID-token flow)

FixBridge uses **Google Identity Services ID tokens**, not an authorization-code redirect callback.

- Set **`GOOGLE_CLIENT_ID`** to the Web client ID only.
- **`GOOGLE_CLIENT_SECRET` is not required** for this flow. If present in Netlify, keep it server-only and never prefix it with `VITE_`.
- Do **not** put a secret (`GOCSPX-…`) into `GOOGLE_CLIENT_ID`.
- Authorized **JavaScript origins** must include production hosts (see final report / Google Cloud Console).
- **Authorized redirect URIs** are not used by the current button + ID-token design.

Email/password login works without Google OAuth. If `GOOGLE_CLIENT_ID` is unset or invalid, **Continue with Google** is hidden.

Gmail App Password is for **email delivery only**. Do not use it for Google Sign-In.

## After setting vars

1. Site overview → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
2. Hard-refresh the site (`Ctrl+Shift+R`)

## Do not commit `.env`

Copy values from your local `.env` into the Netlify UI only. Never commit secrets to git.

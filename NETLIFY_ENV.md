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
| `APP_URL` | Public site URL, e.g. `https://YOUR-SITE.netlify.app` (reset + unsubscribe links). |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for homeowner **Continue with Google** (public). |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (server only — never expose to frontend). |
| `GOOGLE_REDIRECT_URI` | Optional — only if using authorization-code flow; ID token flow uses client ID only. |
| `VITE_GEMINI_API_KEY` | Optional — Gemini key for AI assessment. |

Email/password login works without Google OAuth. If `GOOGLE_CLIENT_ID` is unset, **Continue with Google** is hidden.

Gmail App Password is for **email delivery only**. Do not use it for Google Sign-In.

## After setting vars

1. Site overview → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
2. Hard-refresh the site (`Ctrl+Shift+R`)

## Do not commit `.env`

Copy values from your local `.env` into the Netlify UI only. Never commit secrets to git.

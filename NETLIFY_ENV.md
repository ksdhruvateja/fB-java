# Netlify environment variables

Vite embeds `VITE_*` values **at build time**. Changing them in the Netlify UI does nothing until you **trigger a new deploy** (Clear cache and deploy site).

## Site settings → Environment variables

Add these for **Production** (and Preview if you want them there too):

| Variable | Notes |
|----------|--------|
| `SESSION_SECRET` | JWT signing secret (set a long random string in production). |
| `NEON_DATABASE_URL` | Postgres connection string (needed for auth/jobs). |
| `GMAIL_USER` | Gmail address for SMTP (password reset + notifications). |
| `GMAIL_APP_PASSWORD` | Google App Password (not your normal Gmail password). |
| `FROM_EMAIL` | Optional — e.g. `FixBridge <you@gmail.com>`. |
| `APP_URL` | Public site URL, e.g. `https://YOUR-SITE.netlify.app` (reset links). |
| `VITE_GEMINI_API_KEY` | Optional — Gemini key for AI assessment. |

Auth is email/password only (no Google/Auth0 OAuth). Email is sent via Gmail SMTP (no Resend). SMS/Twilio is disabled.

## After setting vars

1. Site overview → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
2. Hard-refresh the site (`Ctrl+Shift+R`)

## Do not commit `.env`

Copy values from your local `.env` into the Netlify UI only. Never commit secrets to git.

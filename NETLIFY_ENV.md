# Netlify environment variables (required for Google + Gemini)

Vite embeds `VITE_*` values **at build time**. Changing them in the Netlify UI does nothing until you **trigger a new deploy** (Clear cache and deploy site).

## Site settings → Environment variables

Add these for **Production** (and Preview if you want them there too):

| Variable | Notes |
|----------|--------|
| `VITE_GOOGLE_CLIENT_ID` | Same value as local `.env` (OAuth Web client ID). Required for the live Google button on both login portals. |
| `GOOGLE_CLIENT_ID` | Same value — used by the Netlify Functions API to verify Google ID tokens. |
| `VITE_GEMINI_API_KEY` | Gemini key for AI assessment in the homeowner flow. |
| `NEON_DATABASE_URL` | Postgres connection string (already needed for auth/jobs). |
| `SESSION_SECRET` | JWT signing secret (set a long random string in production). |

## After setting vars

1. Site overview → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
2. Hard-refresh https://fixbridge.netlify.app (`Ctrl+Shift+R`)
3. Confirm footer shows a new **Build … · v0.0.2** stamp

## Do not commit `.env`

Copy values from your local `.env` into the Netlify UI only. Never commit secrets to git.

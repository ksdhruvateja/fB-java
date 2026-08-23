# FixBridge

A React + Vite web app connecting homeowners with local contractors. Features AI-powered job assessment, auth (email + Google OAuth), job posting, contractor bidding, profiles, documents, and Stripe payments.

## Stack

- **Frontend**: React 18 + Vite 6, Tailwind CSS v4, shadcn/ui (Radix UI), MUI, React Router 7
- **API**: Express 5 (`api/app.js`) — runs locally on port 3001, proxied via Vite as `/api/*`
- **Database**: Neon Postgres (`NEON_DATABASE_URL`), or in-memory fallback if omitted
- **AI**: Multi-provider — OpenRouter/OpenAI/Gemini (configured via `AI_PROVIDER` in `.env`)
- **Auth**: JWT sessions + Google OAuth (`@react-oauth/google`, `google-auth-library`)
- **Payments**: Stripe (`stripe` SDK)
- **Email**: Resend (`resend` SDK)

## Running the app

```bash
npm run dev
```

The workflow "Start application" runs this automatically. Vite serves the frontend on port 5000; Express API on port 3001 is proxied from Vite as `/api/*`.

**Note**: The project originally used `pnpm` but runs on Replit with `npm` (pnpm is not available in this environment).

## Environment variables

All secrets are stored as Replit Secrets or in `.env`. Key variables:

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | JWT signing (set as Replit Secret) |
| `NEON_DATABASE_URL` | Yes (for persistence) | Neon Postgres connection string |
| `VITE_GOOGLE_CLIENT_ID` | For Google Sign-In | Google OAuth Web Client ID |
| `AI_PROVIDER` | Optional | `openrouter`, `openai`, `gemini`, or `auto` |
| `OPENROUTER_API_KEY` | Optional | OpenRouter AI key |
| `GEMINI_API_KEY` | Optional | Google Gemini key |
| `STRIPE_SECRET_KEY` | Optional | Stripe payments |
| `RESEND_API_KEY` | Optional | Password-reset emails |

See `.env.example` for the full list. Do not commit `.env`.

## Project structure

- `src/app/` — all page and feature components
- `api/app.js` — Express API (auth, jobs, profile, docs, admin, Stripe)
- `api/ai.js` — multi-provider AI assessment
- `api/stripe.js` — Stripe routes
- `server.js` — local API entry point (wraps `api/app.js`)
- `netlify/functions/api.js` — Netlify Functions entry (serverless-http wrapper)
- `netlify.toml` — Netlify build + redirect config
- `data/users.json` — seed/fallback user data

## User preferences

- Keep the existing project structure intact
- Use `npm` (not `pnpm`) for package management on Replit

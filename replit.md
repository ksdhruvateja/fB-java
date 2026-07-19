# FixBridge

A React + Vite web app that connects homeowners with local contractors. Built with Figma Make.

## Stack

- **Framework**: React 18 + Vite 6
- **Styling**: Tailwind CSS v4, shadcn/ui (Radix UI), MUI
- **Routing**: React Router 7
- **AI**: Google Gemini (for job assessment feature)

## Running the app

```bash
pnpm run dev
```

The dev server starts on port 5000. The workflow "Start application" handles this automatically.

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_GEMINI_API_KEY` | Google Gemini API key for AI job assessment (optional — app runs without it) |

Get a free key at https://aistudio.google.com/apikey, then add it as a Replit Secret named `VITE_GEMINI_API_KEY`.

## Project structure

- `src/app/` — all page and feature components
  - `App.tsx` — root component with routing/nav
  - `HomeownerDashboard.tsx` / `ContractorDashboard.tsx` — authenticated dashboards
  - `AdminPanel.tsx` — admin view
  - `geminiAssessment.ts` — Gemini AI integration
  - `auth.ts` — auth helpers
- `src/main.tsx` — entry point
- `vite.config.ts` — Vite config (port 5000, Replit host allowance, Figma asset resolvers)

## User preferences

- Keep the existing Figma Make project structure intact

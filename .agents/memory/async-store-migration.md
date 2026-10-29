---
name: Async store migration
description: All four frontend data store files are now async fetch calls to the Express API.
---

## Rule
- `auth.ts`, `jobBoard.ts`, `jobLifecycle.ts`, `jobChat.ts` — all exported DB-touching functions return `Promise<T>`.
- Pure utility functions (`getDemoUser`, `contractorCanDoJob`, `getJobRequirements`, `STATUS_LABELS`, `STATUS_NEXT`, `STATUS_NEXT_LABEL`) remain synchronous.
- Components must never call async store functions directly inside render; use `useState` + `useEffect` pattern.
- For computed values that need multiple lifecycles (e.g. stats, counts), fetch `getAllLifecycles()` once into a state map, then look up synchronously in render — avoids N API calls per render.

**Why:** Migrated from localStorage to Neon (PostgreSQL) for persistence across sessions/devices.

**How to apply:** When adding a new component that needs lifecycle data for multiple jobs, always use the lifecycle-map pattern (fetch all once, build `Record<number, string>` map, look up by `jobId ?? "open"`).

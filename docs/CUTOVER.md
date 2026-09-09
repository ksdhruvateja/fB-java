# FixBridge Cutover (Netlify Functions → Spring + Angular)

Goal: switch production traffic from React + Netlify Functions to Angular SPA + Spring Boot API **without** deleting legacy trees until verification completes.

---

## Preconditions

1. Spring API deployed (`api.fixbridge.us`) healthy: `/api/health`.
2. Neon has additive tables applied (e.g. `db/manual/001_service_offerings.sql`).
3. Angular build served at `fixbridge.us` (or staging URL) with correct API base / proxy.
4. Env vars set per `docs/ENVIRONMENT_VARIABLES.md` (JWT, Stripe, AI, CORS, mail).
5. Smoke journeys pass against Spring base URL (auth, property, report→assess, pay-dispatch sandbox, webhook, messaging, `/api/home-services`).
6. Feature parity for **cutover-critical** paths is DONE or accepted PARTIAL — see `docs/FEATURE_PARITY.md`.
7. DNS / TLS ready; Stripe webhook endpoint updated (or dual-write briefly).

Do **not** delete `api/` or `src/` as part of cutover day.

---

## Recommended cutover steps

### A. Staging rehearsal

1. Point a staging SPA at staging Spring + Neon branch/clone.
2. Run full smoke + payment sandbox + webhook.
3. Confirm CORS and Google GIS client origins include staging.

### B. Stripe webhook

1. Add Spring endpoint `https://api.fixbridge.us/api/stripe/webhook`.
2. Optionally keep Netlify webhook until traffic flipped; prefer single consumer with idempotent `webhook_events`.
3. Send Stripe test events; confirm processing.

### C. DNS / traffic flip

1. Deploy Angular to `fixbridge.us` (or swap CDN origin).
2. Ensure SPA calls Spring (`api.fixbridge.us` or reverse-proxied `/api`).
3. Lower Netlify Function traffic (or stop publishing new Function deploys).
4. Monitor errors, 401/403 spikes, Stripe failures, assessment latency.

### D. Post-cutover

1. Watch logs 24–72h.
2. Keep Netlify app available for emergency rollback.
3. Only after stable period: archive Netlify site / stop Functions (still keep git trees).

---

## Rollback

| Symptom | Action |
| --- | --- |
| SPA broken / wrong API | Redeploy previous React build to `fixbridge.us`; point DNS/CDN back to Netlify static |
| API errors | Route SPA `/api` (or `api.` host) back to Netlify Functions; restore prior webhook URL in Stripe |
| Data issues | Neon is shared — prefer forward fixes; avoid destructive restores without backup |
| Partial dual-run | Temporarily serve React again while Spring remains up for debugging |

Rollback should be **configuration/DNS**, not “delete Spring.” Legacy `api/` + `src/` remain the known-good reference.

---

## Acceptance smoke (minimum)

- [ ] Homeowner sign-in / Google (if enabled)
- [ ] Create property; create managed job; assess; DIY start/stop
- [ ] Hire path: proposal → approve → pay-dispatch (test mode)
- [ ] Webhook marks payment without double charge
- [ ] Contractor invitation respond + status marks
- [ ] Admin work-queue invite/assign
- [ ] Messages + notifications poll
- [ ] `GET /api/home-services` catalog

---

## After stable cutover

- Update runbooks to Spring/Angular only.
- Schedule removal of Netlify Functions **later**, in a dedicated change, after product sign-off.
- Continue porting PARTIAL/MISSING items from `FEATURE_PARITY.md` on the new stack.

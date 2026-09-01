# FixBridge AI / DIY Safety + Security Audit

**Date:** September 1, 2026  
**Scope:** Homeowner AI-assisted troubleshooting, Guided DIY, legal integration, endpoint security, regression tests  
**Counsel status:** Working product copy — counsel review recommended

---

## FIXBRIDGE AI / DIY SAFETY + SECURITY

| Area | Result |
|------|--------|
| DIY safety popup | **PASS** |
| No pre-checked safety consent | **PASS** |
| Accept All | **PASS** |
| Professional option from popup | **PASS** |
| Stop DIY & Get a Professional | **PASS** |
| GREEN | **PASS** |
| YELLOW | **PASS** |
| RED | **PASS** |
| Conservative uncertainty rule | **PASS** |
| Dynamic risk reassessment | **PASS** |
| Emergency escalation | **PASS** |
| Emergency-service boundary | **PASS** |
| Gas | **PASS** |
| Electrical | **PASS** |
| Roof/height | **PASS** |
| Structural | **PASS** |
| Refrigerant | **PASS** |
| Sewage/biohazard | **PASS** |
| Carbon monoxide | **PASS** |
| Open flame | **PASS** |
| User-unsafe statement handling | **PASS** |
| AI confidence handling | **PASS** |
| Photo/video safety handling | **PARTIAL** (policy in prompts; no separate vision disclaimer UI) |
| Professional handoff context | **PASS** (job retains assessment; handoff banner) |
| Unsafe-advice feedback | **PASS** |
| Human/admin escalation | **PARTIAL** (admin priority event list; no full ticketing workflow) |
| Incident reporting | **PASS** |
| AI audit trail | **PASS** (`diy_safety_events` + `homeowner_acceptances` + `diy_risk_level`) |
| Disclaimer versioning | **PASS** |
| Server-side acknowledgment | **PASS** |
| Terms integration | **PASS** |
| Homeowner Agreement integration | **PASS** |
| Privacy AI disclosure | **PASS** |
| Privacy actual data-flow match | **PASS** |
| AI data minimization | **PASS** |
| AI endpoint auth | **PASS** |
| AI endpoint IDOR | **PASS** (job ownership on chat) |
| Rate limiting | **PASS** (`aiLimiter`) |
| Prompt injection resistance | **PASS** (deterministic block + tests) |
| Output XSS protection | **PASS** (React text nodes; markdown stripped) |
| AI cannot execute business actions | **PASS** |
| Deterministic hazard overrides | **PASS** |
| AI safety regression tests | **PASS** (`npm run smoke:ai-safety`) |
| AI red-team | **PARTIAL** (automated injection/hazard suite; manual adversarial review recommended) |
| Mobile | **PASS** (modal scroll, responsive CTAs) |
| Accessibility | **PARTIAL** (labels, focus trap in modal; full SR audit recommended) |

---

## P0 SAFETY ISSUES

None identified in automated regression after this hardening pass.

---

## P1 SECURITY ISSUES

1. **Client-injected chat context** — HomeownerDashboard prepends instructional context in chat payload. Server re-classifies risk and enforces policy, but consider moving job context server-side only to reduce prompt-leak surface.
2. **Admin safety events** — Read-only list; no assignment/SLA workflow yet.

---

## P2 IMPROVEMENTS

1. Dedicated support queue for repeated unsafe-feedback on same job.
2. Live `/api/ai/chat` integration tests in CI with mocked LLM.
3. Explicit low-confidence banner in DIY UI when `confidenceBand === LOW_CONFIDENCE`.
4. Contractor-visible safety summary on dispatch (operational, not full chat log).

---

## FINAL VERDICT

**NEARLY READY** for controlled beta — safety policy, legal integration, audit logging, and regression suite are in place. Recommend counsel review of legal copy and a manual red-team session before broad public scale.

---

## Test commands

```bash
npm run smoke:ai-safety
npm run smoke:diy-safety-guardrails
npm run smoke:legal-ai-integration
npm run smoke:homeowner-consent
```

## Key files

- `api/diy-safety.js` — GREEN/YELLOW/RED classification, prompt injection detection
- `api/diy-safety-events.js` — audit event persistence
- `api/diy-safety-routes.js` — feedback, stop, incident, admin events
- `src/app/DiySafetyStartModal.tsx` — pre-DIY acknowledgments
- `src/app/DiyStopProfessionalBar.tsx` — persistent stop/pro escalation
- `scripts/smoke-ai-safety.mjs` — regression suite

# Fixera fixes (October 2026)

Baseline: the `fB-java-main` zip. Every change below has a test that fails on the baseline and passes after it, unless noted.

## Before you deploy: check the Hire-a-Pro price

Non-member Hire-a-Pro checkout used to charge a **hardcoded $125**. It now charges the total of **Admin → Pricing → Professional dispatch pricing**, the same lines HomeCare members already paid.
- With the built-in defaults, that total is **$95**: Assessment $149 + Visit $95 − Beta discount $149.
- Open that screen in production, set the lines you want (for example Platform fee, Admin fee, Care fee), and save before deploying.

## 1. Crash bugs (HTTP 500s)

| Where | Bug | Effect before |
| --- | --- | --- |
| `api/fixa/core.js` `getFixaHealth` | Leftover lines referenced undefined `code` / `packed` | `/api/fixera/health`, `/api/fixa/health` and the admin Fixera providers page always returned 500 |
| `api/ai.js` `analyzeRepairStructured` | Failure path read undefined `resolved` (plus a duplicate `provider` key) | When every provider failed, a ReferenceError was thrown instead of `AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE` |
| `api/ai.js` `analyzeRepair` | Catch block read undefined `result` | Unexpected provider exceptions became ReferenceErrors |
| `api/managed-routes.js` | `assertEmployeeAssignable` used but never imported | Assigning a contractor employee crashed |
| `api/platform-routes.js` | `retailFromBid`, `mergePricingRules` used but never imported | The route at line ~1061 crashed |
| `api/contractor-compliance.js` | Undefined `deriveStatus` (now `deriveComplianceStatus`, same logic) | Changing document applicability crashed |
| `api/managed-routes.js` Stripe webhook | `event` declared inside `try` | Failed webhooks were never marked failed |

These were found with ESLint `no-undef` over `api/`. One harmless finding remains: `api/messaging.js:225` assigns a variable to itself (a no-op). The intent was unclear, so it was left alone.

## 2. Fixera AI is a HomeCare Pro feature

A shared guard, `api/fixera/entitlement.js`, returns 403 `HOMECARE_PLAN_REQUIRED` (with `canHireProfessional: true`) to non-members. Admins are exempt.

**Covered routes:**
- `/api/fixera|fixa|ai/assessment`, `/reassess`, `/chat`
- `/api/home-assistant/chat`
- `/api/managed/jobs/:id/assess`
- `/api/pending-service-requests/:id/assess`
- DIY outcome events on `/api/managed/jobs/:id/fixera-diy`

"Professional requested" stays open to everyone.

**Backstops:**
- The background worker refuses to run AI for a non-member, whatever queued it.
- `/api/public/jobs` (guests) no longer queues AI. The job is marked "assessment failed: `HOMECARE_PLAN_REQUIRED`", which the hire wizard already treats as "continue to professional booking".

**Website:** when a non-member reopens a saved request, the dashboard now goes straight to the hire flow instead of "needs its Fixera assessment to finish".

Booking a professional never requires HomeCare or AI.

## 3. Safety and ownership

- **Chat without a job** now runs the prompt-injection and red-hazard checks before any model call. Previously these ran only when a `jobId` was sent.
- **`/api/fixera/professional-handoff`**: a `jobId` must belong to the caller, and the summary is built from the stored case. Client-supplied assessment text is ignored.
- **`/api/fixera/feedback`**: a `jobId` must belong to the caller, and feedback only updates the caller's own interactions.

## 4. Real timeouts

`runWithTimeout` in `api/ai.js` now aborts the provider request when the outer deadline (`AI_FETCH_TIMEOUT_MS`) fires. Previously it only raced the request, which kept running until the adapter's own timer.

## 5. Fixera Engine (optional, environment opt-in)

`api/fixa/providers/fixera-engine.js` is registered in `resolveAiProvider()`.

To enable it, set:
- `FIXERA_AI_PROVIDER=fixera-engine`
- `FIXERA_ENGINE_URL`
- `FIXERA_ENGINE_SECRET` (an HMAC secret; not `SESSION_SECRET`)

The original providers stay behind it as the fallback, unless `FIXERA_ENGINE_FALLBACK=none`. To roll back, unset `FIXERA_AI_PROVIDER`. FixBridge parsing, safety and persistence still run on the engine's output.

## 6. Hire-a-Pro fees, managed in the admin panel

- **Admin → Pricing → Professional dispatch pricing** now has **Add line** (name, amount, charge or discount) and **Remove**, with a live total.
- **Server validation on save:**
  - every line needs a name and an amount of $0–$10,000
  - at most 15 lines
  - no duplicate keys
  - the total must stay above $0
  - each change bumps the pricing version and is audited (existing behaviour)
- **The same lines price every homeowner:**
  - New `GET /api/pending-service-requests/:id/professional-pricing` returns the itemized quote for non-member requests.
  - `professional-checkout` charges that total and returns `409 PRICING_CHANGED` if it differs from what the homeowner confirmed on screen.
  - The Stripe webhook validates against the quoted amount instead of a fixed 12500.
- **The hire screen** shows each fee line and the total, and the "Your $125 payment was received" messages no longer hardcode the amount.

## 7. Health endpoint

`/api/health` keeps `database: "neon"` for existing smoke checks and adds two fields:
- `databaseVendorEvidence`: what was actually observed, such as the hostname or Neon-specific server settings
- `commit`: from `RAILWAY_GIT_COMMIT_SHA` or `COMMIT_REF`

`/api/fixera/health` reports `probed: false`, because it does not call a model.

## Tests

```bash
node --test $(find api -name "*.test.js")    # 24 pass, 12 database tests skip
# With a real PostgreSQL (or a Neon branch) for the route/pricing tests:
FIXERA_TEST_DATABASE_URL=postgresql://... DB_SSL_REJECT_UNAUTHORIZED=false \
  node --test --test-concurrency=1 $(find api -name "*.test.js")   # 36 pass
```

**New test files:**
- `api/fixa/failure-paths.test.js`
- `api/fixa/timeout-cancellation.test.js`
- `api/fixa/providers/fixera-engine.test.js`
- `api/fixera-routes.test.js`
- `api/hire-pricing.test.js`

The in-memory `pg-mem` fallback cannot run the full schema (it lacks `trim()` and other functions). That's why the route tests need a real PostgreSQL.

## Not changed (noted for later)

- Photo assessment is single-photo in this codebase (`imageDataUrl`).
- `logs/fixbridge-jobs-debug.json` is written into the repository at runtime. Consider adding it to `.gitignore`.
- Assessment jobs still use in-process scheduling (`setImmediate`) on Railway, as before.
- Real AI answer quality has not been evaluated. No provider keys were available.

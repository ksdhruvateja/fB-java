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

## 8. Workflow changes to match the flowcharts

### 8.1 DIY safety is based on actual risk, not the category
`api/diy-safety.js` → `evaluateDiySafety()` replaces the old rule that made every HVAC, electrical and roofing case red.
- **Active hazards** stop DIY: a gas smell, fire or smoke, a CO alarm, sparking, water on live electrical, a sagging ceiling, a sewage backup, or an emergency urgency. Negated mentions ("no gas smell") do not count. The model's own stop conditions are warnings, not observations, so they are no longer scanned.
- **Risk factors** set the decision. Each has a severity (low/medium/high), from deterministic patterns plus the model's `risk_factors`; the model can raise a severity but never lower it. Factors: mains electrical, gas, sealed cooling system, working at height, structure, water near electrical, open flame, pressurized hot water, asbestos/lead/mold, chemicals, sewage.
- **Guardrails**: every DIY step (and every DIY chat reply) is checked against instructions Fixera never gives a homeowner, whatever the category. Examples: opening the electrical panel, gas fitting work, refrigerant or capacitor work, walking on the roof, cutting framing, torch work, disturbing asbestos, bypassing safety devices. Matching steps are removed and counted. A warning that mentions them ("do not open the panel") is kept.
- **Decisions** (`assessment.diy_safety.decision`), each with its reasons, factors, permitted actions and prohibited actions:

| Decision | Level | Meaning |
| --- | --- | --- |
| `emergency` | red | Active hazard. Safety steps only. |
| `professional_only` | red | A high-risk factor, or no step left within the guardrails. Only safe actions are shown. |
| `diy_with_guardrails` | yellow | A moderate risk or removed steps. Limited DIY after the homeowner confirms (8.3). |
| `diy_with_care` | yellow | Moderate difficulty only. No popup. |
| `diy_ok` | green | Low risk. |

Examples now handled on their merits: a tripped GFCI, a clogged AC filter or condensate line, and containing a roof leak from inside are guarded DIY. A breaker that keeps tripping in the main panel, or a two-story roof, is professional only.

### 8.2 Unclear photos: ask for clearer photos first
The model now reports `photo_assessment` (usable photo count, issues, specific photo requests). When the photos are unusable or insufficient, confidence is below 0.4, or the category conflicts, the result is `assessment_stage: "needs_more_info"`:
- no DIY steps and no parts cost
- **not** a red safety block
- the result screen lists what is wrong with the photos and what to photograph (up to 5), with **Send photos and reassess** and **Hire a Professional instead**.

### 8.3 Safety-concern popup
For `diy_with_guardrails` the DIY steps are withheld from the homeowner until they answer a popup (`src/app/diy/SafetyConcernModal.tsx`). The popup shows why, what they can do safely, and what Fixera will not guide.
- **Continue** (needs the "I understand" box) → `POST /api/managed/jobs/:id/safety-confirmation {decision:"continue", acknowledged:true}`. The decision is stored on the case and audited in `diy_safety_events`.
- **Hire a Professional** records the choice and opens the hire flow.
- **Server-enforced, not just UI:**
  - the job serializer and the assessment/reassess responses withhold steps
  - DIY step events, DIY chat and `DIY_START` consent return `409 SAFETY_CONFIRMATION_REQUIRED` until confirmed
- **Confirming never changes the guidance.** The steps were already filtered by the guardrails, and they are served unchanged. A new assessment with a different finding needs a new confirmation.

### 8.4 Up to 5 photos, including the first request
- **Intake form:** **Upload Photos** accepts several files, with thumbnails, remove buttons and an "N of 5" counter.
- **Server:** `POST /api/managed/jobs` and `/api/public/jobs` accept `mediaDataUrls` (plus the existing `mediaDataUrl` cover), and store each photo as case media. More than 5 returns `400 TOO_MANY_PHOTOS`.
- **AI:** the assessment worker, `/api/fixera/assessment` and `/api/fixera/reassess` send up to 5 photos, labelled Photo 1..N.
- **Follow-up:** the reassess panel accepts up to 5 photos at a time.

### 8.5 Approximate DIY parts cost
- **Model output:** each part in `materials_needed` now carries a rough per-part price range and a quantity. Labor and service prices are still not allowed.
- **Server:** prices are clamped (at most $2,000 per part) and totalled into `diy_parts_cost_estimate` (required parts; optional parts only when none are required).
- **Result screen:** a "Approximate DIY parts cost" card shows the range with **"Rough estimate — not a quote"** and the disclaimer: varies with the exact issue, the parts and materials chosen, brand and location; labor, tools, tax and shipping are not included.
- **When it is hidden:** no cost is shown for red or needs-more-info results.

### 8.6 Maintenance reminders tied to the repair
- **Model output:** `follow_up_maintenance` (task, interval, reason) for the specific issue.
- **When the repair is finished** (homeowner marks the DIY repair fixed, or a professional completes the job), `api/fixera/maintenance-reminders.js` adds to the property's maintenance calendar:
  - a check that the repair is holding (14 days after DIY, 30 after a professional)
  - each follow-up task, with the issue, the repair, the reason and the recurrence
- **Notifications:** `processDueServiceReminders` (the existing poll, admin route and Netlify function) now also sends one in-app notification per item due within 3 days.
- **Recurrence:** completing a recurring item schedules the next one.
- **Saving the passport** keeps these fields (`PUT /api/properties/:id/health` and `/maintenance`).
- **Where the homeowner sees it:**
  - the result screen previews the reminders
  - the passport calendar shows the reason and the related repair

### Prompt version
`FIXERA_PROMPT_VERSION` is now `fixera-repair-v4`.

## 9. Learning loop: record, review, reuse

Fixera does **not** retrain any model. It improves by reusing cases that admins have reviewed, and it builds a clean dataset you can use for fine-tuning later.

### 9.1 Record
- **Every AI call is saved** to `fixera_interactions`, and every successful one also becomes a review case in `fixera_training_candidates`. Before saving, Fixera removes emails, phone numbers, street addresses, ZIP codes and stated names.
- **Coverage:** assessments, reassessments, DIY chat, general Fixera chat and Home Assistant chat. Safety-policy refusals (prompt injection, hazards, user stop) are included.
- **What each assessment case holds:** the problem, Fixera's diagnosis, likely causes, the safety decision and risk factors, the DIY steps, the parts and the follow-up maintenance.
- **Outcomes are linked back** to the assessment they test, in the new table `fixera_case_outcomes`:

| Outcome | Recorded when |
| --- | --- |
| `DIY_FIXED`, `DIY_STILL_BROKEN`, `PROFESSIONAL_REQUESTED` | The homeowner reports the DIY result, with what they did and the parts they used |
| `SAFETY_CONFIRMED`, `SAFETY_DECLINED` | The homeowner answers the safety-concern popup |
| `PROFESSIONAL_COMPLETED` | A professional completes the job, with their summary |
| `USER_FEEDBACK` | The homeowner rates the answer helpful or not |

- **Professional's completion form:** two new optional fields, "Did Fixera's diagnosis match what you found?" and "Actual cause you found". These become the case's correction. An already-approved case goes back to review (`NEEDS_REREVIEW`) when a professional's findings arrive.

### 9.2 Review (Admin → Fixera → Review)
- **Filters:** has an outcome, needs review, approved, rejected. You can switch between assessments and chat.
- **Each card shows** the problem, Fixera's diagnosis, the steps, the safety factors, every outcome and the professional's finding.
- **Actions:**

| Action | Effect |
| --- | --- |
| Approve | Reused and exported as it is |
| Approve as gold | Approved, and ranked first when reused |
| Correct | Enter the right diagnosis and fix; the case is approved with your correction |
| Reject | Never reused or exported |
| Unsafe guidance | Never reused or exported, and cannot be approved unless you reset it first |
| Reset | Back to unreviewed |

- **Permissions:** viewing needs `settings.view`, the same as the existing Training tab. Actions need admin write access.
- **Export:** `GET /api/admin/fixera/training/export` now returns the approved and corrected cases with their outcomes and corrections, ready for a future fine-tune.

### 9.3 Reuse
**Off by default since section 10**, so houses stay separate. When enabled, each new assessment and reassessment looks up up to 3 **approved or corrected** past cases from other homes. They must be in the same category and match the problem's words.
- **What goes into the prompt:** each case's problem, confirmed cause and what fixed it, labelled "reference only, not evidence about this home; every safety rule still applies".
- **Safety:** the risk engine and guardrails still check everything the model returns.
- **Tracing:** the case IDs used are saved with each assessment (`knowledge_refs`).

**Nothing is reused until an admin approves it.** To also reuse cases confirmed fixed (by the homeowner or a professional) before review, set `FIXERA_REUSE_CONFIRMED_OUTCOMES=true`. It's off by default because unreviewed outcomes can be wrong.

### What this does not do
- **No training:** it does not train or change model weights. A fine-tune (step 4) needs a few thousand approved cases first, then a side-by-side comparison against the current provider.
- **Simple matching:** reuse matches on words (PostgreSQL full-text search), not meaning. Semantic search can be added later.
- **De-identification has limits:** it uses fixed patterns. Admins should still reject a case if personal details slip through.

## 10. House separation, data use, accounts and subscriptions

### 10.1 Each house's data stays with that house
- **Fixera's context comes from one house at a time.** Every prompt is built from a single property, after checking that the user owns it or is a household member. This covers the house's equipment, history, documents, cases, photos, maintenance and DIY outcomes.
- **Fixed: mixing two houses of the same owner.** Home Assistant could combine a job from one of an owner's houses with the context of another house. A job now has to belong to the house being discussed.
- **Cross-home reuse is off by default.** No case from one house is placed in another house's prompt, even after an admin approves it. Collected cases are used only for the review queue and the training export (section 9).
  - To allow it, set `FIXERA_CROSS_HOME_REUSE=true`.
  - Even then, only the category plus the diagnosis and fix written by the reviewer or Fixera are used. The other homeowner's own words, outcome notes, property, job and identity are never included.
- **Where collected data goes:**
  - only to the admin review queue and the admin-only training export
  - never to homeowners or contractors
  - with personal details removed before it is saved for review or training

### 10.2 Accounts and sign-in
**Already in place:**
- **Password accounts** are stored as bcrypt hashes. Sign-in matches the email in any letter case.
- **Google sign-in** is verified on the server (audience, issuer, expiry and verified email), then matched to an account by its Google ID or email.
  - A password account that later uses Google with the same email is linked to the **same** account, with the same profile, houses and subscription. Password sign-in keeps working.
  - Each Google identity can belong to only one FixBridge account.
- **Both sign-in types** store the session the same way. Every visit restores the account and subscription from the server through `/api/auth/me`.

**Fixed:**
- **Guessable password on Google accounts.** Accounts created through Google were given the password `GOOGLE_OAUTH_<Google ID>`. A Google ID is not a secret, so anyone who knew it could sign in with a password.
  - New Google accounts now get a random password, and password sign-in is off for them (`users.password_login_enabled = FALSE`).
  - Existing Google accounts are detected on the first password attempt and refused.
  - Owners can add a password with **Forgot password**, which turns password sign-in on. They then see "This account uses Google sign-in. Continue with Google, or use Forgot password to add a password."
- **Free HomeCare Pro by email address.** Any `demo.homeowner.*@example.com` sign-up got free Pro, with no payment. In production this now only applies to addresses listed in `QA_GUIDED_DIY_EMAILS`.

### 10.3 Subscription status
**Already in place:**
- The `subscriptions` table is the source of truth. Pro needs an active or trialing row whose period has not ended; a stored plan code alone never grants it.
- It is re-checked on every sign-in, every session restore and every request (cached for 15 seconds).
- Expired rows are marked expired, and `users.plan_code` is kept in sync.
- Stripe checkout, the webhook and the post-payment check all update it.

No change was needed beyond the free-Pro fix above.

## Tests

```bash
node --test $(find api -name "*.test.js")    # 37 pass, 35 database tests skip
# With a real PostgreSQL (or a Neon branch) for the route/pricing tests:
FIXERA_TEST_DATABASE_URL=postgresql://... DB_SSL_REJECT_UNAUTHORIZED=false \
  node --test --test-concurrency=1 $(find api -name "*.test.js")   # 72 pass
```

**New test files:**
- `api/fixa/failure-paths.test.js`
- `api/fixa/timeout-cancellation.test.js`
- `api/fixa/providers/fixera-engine.test.js`
- `api/fixera-routes.test.js`
- `api/hire-pricing.test.js`
- `api/fixera/workflow.test.js`: safety engine, guardrails, evidence check, parts cost, confirmation, reminders, photo limits
- `api/fixera-workflow-routes.test.js`: popup gate, DIY outcome → reminders, passport save, notifications, 5-photo upload
- `api/fixera/learning-loop.test.js`: de-identification, case record, prompt framing
- `api/fixera-learning-routes.test.js`: record → outcome → professional correction → chat capture → admin review → reuse → export
- `api/account-and-isolation.test.js`: password and Google sign-in to the same account, subscription restore, no guessable Google password, demo-email rule, one house per context

The in-memory `pg-mem` fallback cannot run the full schema (it lacks `trim()` and other functions). That's why the route tests need a real PostgreSQL.

## Not changed (noted for later)

- Saved pending (unpaid) requests in `GET /api/pending-service-requests/my` still return the raw assessment. DIY runs on managed jobs, where steps are withheld until confirmed.
- Unsaved intake drafts keep only the first photo.
- The safety patterns and guardrails are deterministic English-language rules. Review them with your safety or legal adviser before relying on them.
- `logs/fixbridge-jobs-debug.json` is written into the repository at runtime. Consider adding it to `.gitignore`.
- Assessment jobs still use in-process scheduling (`setImmediate`) on Railway, as before.
- Real AI answer quality has not been evaluated, including the new photo-quality and part-price fields. No provider keys were available.

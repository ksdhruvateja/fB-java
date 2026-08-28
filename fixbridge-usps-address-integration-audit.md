# FIXBRIDGE USPS ADDRESS INTEGRATION

## Specification

**USPS YAML inspected:** YES  
**Local specification file:** `addresses-v3r2_0.yaml`  
**OpenAPI `info.version`:** 3.3.1  
**Filename note:** `v3r2_0` vs online “Addresses API v3.x” — no material endpoint mismatch found for implemented features.

**Endpoints implemented from local YAML:**

| USPS endpoint | FixBridge route |
|---|---|
| `GET /address` | `POST /api/address/verify` |
| `GET /city-state` | `GET /api/address/city-state` |
| `GET /zipcode` | `GET /api/address/zip` |
| *(none)* | `GET /api/address/suggestions` → **501 NOT_SUPPORTED** |

**OAuth:** `POST {USPS_API_BASE_URL}/oauth2/v3/token` (client credentials, server-side only)

---

## Test matrix

| Area | Result | Notes |
|---|---|---|
| OAuth | **PASS / SKIP** | PASS when `USPS_CLIENT_ID` + `USPS_CLIENT_SECRET` set; SKIP otherwise |
| USPS address verification | **PASS / SKIP** | Via `POST /api/address/verify` |
| USPS true autocomplete supported by spec | **NO** | Not in YAML — not implemented |
| Address suggestion UX | **PARTIAL** | Verify-on-complete + city/state ZIP assist; no street autocomplete |
| City/state lookup | **PASS / SKIP** | USPS when configured; zippopotam.us fallback when logged out |
| ZIP lookup | **PASS / SKIP** | `GET /api/address/zip` |
| Homeowner property | **PASS** | `VerifiedAddressFields` on property page + dashboard modals |
| Homeowner service request | **PASS** | Address prompt modal uses same component |
| Homeowner profile | **N/A** | No standalone mailing-address profile field |
| Contractor application | **PASS** | Signup + compliance `ContractorApplicationForm` |
| Contractor profile/compliance | **PASS** | Same reusable component |
| Apartment/unit handling | **PASS** | `secondaryAddress` / `addressLine2` preserved; USPS warnings surfaced |
| Manual fallback | **PASS** | “Use entered address” → `address_verified = false` |
| USPS outage fallback | **PASS** | Forms remain usable; unavailable message shown |
| Admin verification visibility | **PASS** | Homeowner properties + contractor admin detail |
| Mobile | **PASS** | Build OK; stacked comparison cards at narrow widths |
| OAuth secrets server-only | **PASS** | No USPS vars in Vite/public bundle |
| Rate limiting | **PASS** | `express-rate-limit` on address routes |
| ZIP pricing regression | **PASS** | `zip5()` / `zip5ForPricing()` store 5-digit ZIP for pricing |
| RBAC/IDOR regression | **PASS** | Address routes require auth; property updates scoped by `owner_user_id` |
| Build | **PASS** | `npm run build` |
| Smoke test | **`npm run smoke:usps-address`** | Restart API after deploy to pick up new routes |

---

## Architecture

```
React (VerifiedAddressFields)
  → /api/address/*
  → api/usps-address.js (OAuth cache + USPS calls)
  → USPS Addresses API v3
```

**No USPS credentials in the browser.**

---

## Files changed

### Backend
- `api/usps-address.js` — OAuth token cache, verify, city-state, ZIP lookup
- `api/address-routes.js` — Express routes + rate limiting
- `api/app.js` — route registration, contractor `address_verified` on profile save
- `api/schema-managed.js` — `address_verified*`, `postal_code_plus4` on `properties` + `users`
- `api/managed-routes.js` — property CRUD + `/properties/:id/address` verification metadata
- `api/platform-routes.js` — admin homeowner profile includes verification flags

### Frontend
- `src/app/addressApi.ts` — client API helpers
- `src/app/VerifiedAddressInput.tsx` — `VerifiedAddressFields` component
- `src/app/UsLocationFields.tsx` — USPS city/state via backend when authenticated
- `src/app/addressFormat.ts` — `zip5ForPricing()`
- `src/app/HomeownerPropertyPage.tsx`
- `src/app/HomeownerDashboard.tsx`
- `src/app/ContractorApplicationForm.tsx`
- `src/app/contractorApplication.ts`
- `src/app/ContractorDashboard.tsx`
- `src/app/AdminHomeownerProfile.tsx`
- `src/app/ContractorAdminDetail.tsx`
- `src/app/auth.ts`, `src/app/managedJobs.ts`

### Config / tests
- `.env.example` — `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET`, `USPS_API_BASE_URL`
- `scripts/smoke-usps-address.mjs`
- `package.json` — `smoke:usps-address`

---

## Database changes (additive)

**`properties`:** `postal_code_plus4`, `address_verified`, `address_verified_at`, `address_verification_provider`  
**`users`:** same columns (contractor business address verification)

**No migration of existing addresses** — legacy rows keep `address_verified = false` until user edits/verifies.

---

## External USPS configuration required

1. Create USPS developer app at [developers.usps.com](https://developers.usps.com)
2. Enable **Addresses API** scope
3. Set in `.env` / Netlify (server-only):

```env
USPS_CLIENT_ID=your_client_id
USPS_CLIENT_SECRET=your_client_secret
USPS_API_BASE_URL=https://apis-tem.usps.com   # testing
# USPS_API_BASE_URL=https://apis.usps.com    # production
```

4. Restart the API after setting variables

---

## UX flow

1. User enters street, unit, city, state, ZIP (city/state searchable selects retained)
2. ZIP blur → USPS city/state lookup (or zippopotam fallback)
3. User clicks **Verify with USPS** when address is complete
4. If USPS standardizes → side-by-side **entered vs USPS** choice
5. User confirms → `address_verified = true`, `address_verification_provider = "usps"`
6. Manual override allowed → `address_verified = false`

---

## Remaining issues / follow-ups

1. **USPS credentials not configured in this environment** — live OAuth/verify tests require production `.env` values.
2. **Restart API** after pulling changes so `/api/address/*` routes are active.
3. **Admin quote workspace** still uses plain `StructuredAddressFields` (admin-only; can add verification later).
4. **Service-area radius / ZIP lists** intentionally separate from USPS verification.
5. **Version label:** YAML reports `3.3.1`; filename says `v3r2_0` — treat local YAML as contract.

---

## Security notes

- OAuth tokens cached in server memory only (per process)
- Address routes require authentication + rate limiting
- Full addresses not logged on errors
- USPS verification ≠ identity verification (documented in UI copy)

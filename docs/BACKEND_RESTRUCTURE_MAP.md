# Backend restructure map (old → new)

**Status:** Completed locally (no git commit).  
**Scripts:** `scripts/restructure-backend.mjs`, `scripts/fix-backend-imports.mjs`, `scripts/restructure-frontend.mjs`  
**App class:** `FixbridgeApiApplication` → `com.fixbridge.FixBridgeApplication`

## Cross-cutting

| Old | New |
|-----|-----|
| `config/*` | `config/*` (includes `SecurityConfig`) |
| `security/*` | `security/{jwt,filter,principal,authorization}/` |
| `exception/*` | `exception/*` |
| `util/*` | `common/util/*` |
| `integration/ai/*` | `fixa/{provider,router,service,controller,dto}/` |
| `integration/stripe/*` | `payment/stripe/common/` |
| geoapify / email / highlevel | `integration/*` |

## Domain packages

`auth`, `property`, `propertypassport` (marker), `servicecatalog`, `servicerequest` (marker), `homeowner` (marker), `job`, `dispatch`, `fixa`, `diy`, `contractor`, `contractorteam`, `compliance`, `quote`, `changeorder`, `payment`, `payout`, `subscription`, `messaging`, `notification`, `support`, `dispute`, `admin`, `file`, `common`, `config`, `security`, `exception`, `integration`

Entity `*Entity` suffixes retained (no schema change).

## Angular

| Old | New |
|-----|-----|
| `app/services` | `app/core/services` |
| portal/auth/marketing folders | `app/features/*` |
| `diy` / `ai` | `app/features/fixa/*` |
| `shared/utilities` | `shared/utils` |

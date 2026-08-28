# FixBridge Service Catalog Audit

Date: 2026-08-28

## SERVICE CATALOG: PASS

Canonical registry:
- `src/app/serviceCatalog.ts` (frontend)
- `api/service-catalog.js` (backend matching + labels)

## Category Results

| Category | Result |
|----------|--------|
| Snow Removal | **PASS** |
| Landscaping | **PASS** |
| Cleaning | **PASS** |

## Integration Checklist

| Area | Result |
|------|--------|
| Homeowner service selection | **PASS** — quick-pick cards + sub-service chips |
| Contractor trade selection | **PASS** — Snow Removal, Landscaping, Cleaning in `PRIMARY_SERVICES` |
| Admin visibility | **PASS** — trade labels/charts include new slugs |
| Dispatch matching | **PASS** — `contractor-matching.js` uses `contractorTradesMatchCategory` |
| Service-area matching | **PASS** — unchanged ZIP logic reused |
| Quotes | **PASS** — uses existing quote/pricing system (no hardcoded prices) |
| Job filtering | **PASS** — category stored on `managed_jobs.category` |
| Mobile service UI | **PASS** — flex-wrap chips, scrollable lists |
| Database persistence | **PASS** — `managed_jobs.service_subcategory` column |
| Frontend/backend IDs consistent | **PASS** — slugs `snow_removal`, `landscaping`, `cleaning` |

## Sub-services

### Snow Removal
Residential snow removal, driveway, sidewalk/walkway, shoveling, plowing, de-icing/salting, ice management, commercial

### Landscaping
Lawn mowing/maintenance, yard cleanup, leaf removal, hedge trimming, mulching, garden maintenance, seasonal cleanup, edging, general landscaping

### Cleaning
General home, deep, move-in/out, kitchen, bathroom, apartment, post-renovation, recurring, one-time

## Tests

```bash
npm run smoke:service-catalog
npm run build
```

## Notes

- Legacy contractor trades `Snow` and `Janitorial` still match via synonym map.
- `Landscaping & Yard` homeowner label maps to landscaping slug for pricing/AI.
- No seasonal blocking — services available year-round.

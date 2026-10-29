# Admin Permission Matrix — FixBridge

Server enforcement uses `requireAdmin`, `requireAdminWrite`, and `requirePermission(...)` in `api/rbac.js`.  
UI hiding is **not** security; this matrix reflects API behavior.

## Roles

| Role | Preset key | Write access |
|------|------------|--------------|
| Super Admin | `super_admin` | All permissions |
| Operations Admin | `operations_admin` | Jobs, quotes, contractors (no staff/pricing/refund by default) |
| Finance Admin | `finance_admin` | Payments, refunds, payouts, pricing view |
| Dispatcher | `dispatcher` | Jobs assign/edit, quotes view |
| Contractor Manager | `contractor_manager` | Contractor CRUD/verify |
| Customer Support | `customer_support` | Homeowners, jobs, refunds |
| Read Only | `read_only` | GET-only admin surfaces |

## Mutation matrix (representative)

| Action | Endpoint | Super Admin | Operations | Finance | Read Only |
|--------|----------|:-----------:|:----------:|:-------:|:---------:|
| View jobs / work queue | `GET /api/admin/work-queue` | ✓ | ✓ | ✓ | ✓ |
| Edit job mode | `PUT /api/admin/managed/jobs/:id/mode` | ✓ | ✓* | ✗ | ✗ |
| Assign contractor | `POST /api/admin/managed/jobs/:id/assign` | ✓ | ✓* | ✗ | ✗ |
| Match contractor | `POST /api/admin/managed/jobs/:id/match` | ✓ | ✓* | ✗ | ✗ |
| Build/send quote | `PUT/POST /api/admin/quotes/*` | ✓ | ✓* | ✗ | ✗ |
| Convert quote → invoice | `POST /api/admin/quotes/:id/convert-invoice` | ✓ | ✓* | ✗ | ✗ |
| Price change order | `POST /api/admin/change-orders/:id/price` | ✓ | ✓* | ✗ | ✗ |
| Mark invoice paid | `POST /api/admin/invoices/:id/mark-paid` | ✓ | ✓* | ✗ | ✗ |
| Refund payment | `POST /api/admin/payments/:id/refund` | ✓ | ✗ | ✓† | ✗ |
| Approve/release payout | `POST /api/admin/payouts/:id/approve` | ✓ | ✗ | ✓† | ✗ |
| Global pricing rules | `PUT /api/pricing/rules` | ✓ | ✗ | ✓† | ✗ |
| Manage staff | `POST /api/admin/staff/*` | ✓ | ✗ | ✗ | ✗ |
| Block user | `PUT /api/admin/users/:userId/block` | ✓ | ✓* | ✗ | ✗ |
| Create discount | `POST /api/admin/discounts` | ✓ | ✓* | ✗ | ✗ |
| Production config | `GET /api/admin/production-config` | ✓ | ✗ | ✗ | ✓‡ |

\* Operations Admin has `requireAdminWrite` on most ops routes but lacks explicit `payments.refund`, `payouts.approve`, `pricing.edit`, `staff.*` unless granted.  
† Finance Admin holds the named permission.  
‡ Read-only may view settings if `settings.view` is in preset.

## Enforcement helpers

| Helper | Behavior |
|--------|----------|
| `requireAdmin` | Any admin role; read endpoints |
| `requireAdminWrite` | Blocks `read_only` and users with `admin_read_only` flag |
| `requirePermission('x')` | Checks role preset permission list |

## Automated verification

Run:

```bash
npm run smoke:rc
```

RBAC spot-checks are included in `scripts/smoke-p1.mjs` (static) and should be extended with live 403 tests per role in a future pass.

## Gaps (P1 honest)

- Not every `/api/admin/*` route uses granular `requirePermission`; many rely on `requireAdminWrite` only.
- Live mutation tests for **each** role × endpoint are not yet exhaustive.
- Partner portal routes use separate auth and are out of scope here.

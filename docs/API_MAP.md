# FixBridge API Map (Spring Boot)

Inventory of controllers under `backend/src/main/java/com/fixbridge/controller/` and primary `/api` paths. Legacy Express still owns many domains — see **Gaps**.

**Auth notes:** Unless marked *public*, routes require a valid Bearer JWT. `/api/admin/**` requires `ROLE_ADMIN`. `/api/contractor/**` requires `ROLE_CONTRACTOR`.

---

## Controllers → paths

| Controller | Method | Path | Access |
| --- | --- | --- | --- |
| **HealthController** | GET | `/api/health` | public |
| **AuthController** | POST | `/api/auth/signin` | public |
| | POST | `/api/auth/signup` | public |
| | GET | `/api/auth/me` | auth |
| | PUT | `/api/auth/profile` | auth |
| | POST | `/api/auth/forgot-password` | public |
| | POST | `/api/auth/reset-password` | public |
| **GoogleAuthController** | GET | `/api/auth/google/config` | public |
| | POST | `/api/auth/google` | public |
| | GET | `/api/auth/google/linked` | auth |
| **MfaController** | POST | `/api/auth/mfa/start` | auth (mfa stage) |
| | POST | `/api/auth/mfa/verify` | auth (mfa stage) |
| **PropertyController** | GET/POST | `/api/properties` | auth |
| | GET/PUT | `/api/properties/{id}` | auth (owner/admin) |
| **ManagedJobController** | POST | `/api/managed/jobs` | auth |
| | GET | `/api/managed/jobs/my` | auth |
| | GET | `/api/managed/jobs/{id}` | auth (participant) |
| | PUT | `/api/managed/jobs/{id}/homeowner-update` | auth |
| | POST | `/api/managed/jobs/{id}/cancel` | auth |
| | POST | `/api/managed/jobs/{id}/assess` | auth |
| | GET | `/api/managed/jobs/{id}/assessment-status` | auth |
| | GET | `/api/managed/jobs/{id}/proposal` | auth |
| | GET | `/api/managed/jobs/{id}/quote-options` | auth |
| | POST | `/api/managed/jobs/{id}/approve-proposal` | auth |
| | GET/POST | `/api/managed/jobs/{id}/change-orders` | auth |
| | POST | `/api/managed/jobs/{id}/change-orders/{coId}/approve` | auth |
| **CheckoutController** | POST | `/api/managed/jobs/{id}/prepare-checkout` | auth |
| | POST | `/api/managed/jobs/{id}/pay-dispatch` | auth |
| **PublicJobController** | POST | `/api/public/jobs` | public |
| **AiController** | GET | `/api/ai/status`, `/api/fixera/status`, `/api/fixa/status` | auth |
| | POST | `/api/fixera/assessment`, `/api/fixa/assessment`, `/api/ai/assess` | auth |
| | POST | `/api/fixera/chat`, `/api/fixa/chat`, `/api/ai/chat` | auth |
| **DiyProjectController** | POST/GET | `/api/diy/projects` | auth |
| | PUT | `/api/diy/projects/{id}/steps` | auth |
| **DiySafetyController** | POST | `/api/homeowner/diy-safety/start\|feedback\|stop\|incident` | auth |
| **PaymentController** | GET | `/api/payments/mine` | auth |
| **StripeWebhookController** | POST | `/api/stripe/webhook` | public (signature) |
| **MessagingController** | GET | `/api/messages/unread-count` | auth |
| | GET/POST | `/api/messages/conversations` | auth |
| | GET | `/api/messages/conversations/{id}` | auth |
| | POST | `/api/messages/conversations/{id}/messages` | auth |
| | POST | `/api/messages/conversations/{id}/read` | auth |
| | GET | `/api/messages/attachments/{id}` | auth |
| **NotificationController** | GET | `/api/notifications`, `/api/notifications/unread-count` | auth |
| | POST | `/api/notifications/{id}/read`, `/read-all`, `/{id}/archive`, `/archive-read`, `/read` | auth |
| **AddressController** | GET | `/api/address/status` | public |
| | POST | `/api/address/validate`, `/api/address/verify` | auth |
| | GET | `/api/address/autocomplete`, `/suggestions`, `/city-state`, `/zip` | auth |
| | GET | `/api/public/address/autocomplete` | public |
| **ServiceAreaController** | GET | `/api/service-area/check` | public |
| | GET | `/api/public/service-area/check` | public |
| **AdminController** | GET | `/api/admin/verify` | admin |
| | GET | `/api/admin/work-queue` | admin |
| | GET | `/api/admin/managed/jobs` | admin |
| | POST | `/api/admin/managed/jobs/{id}/invite` | admin |
| | POST | `/api/admin/managed/jobs/{id}/assign` | admin |
| **ServiceCatalogController** | GET | `/api/home-services` | public |
| | GET | `/api/admin/services` | admin |
| | PUT | `/api/admin/services/{id}` | admin |
| **ContractorController** | GET | `/api/contractor/invitations` | contractor |
| | POST | `/api/contractor/invitations/{id}/respond` | contractor |
| | POST | `/api/contractor/managed/jobs/{id}/mark-travel\|arrived\|started` | contractor |
| | GET | `/api/contractor/performance` | contractor |
| **ContractorStripeController** | POST | `/api/contractor/stripe/onboard` | contractor |

Security also permits (when implemented later): `GET /api/reviews`, `/api/partner/login`, `GET /api/partners/lookup` — **not yet implemented as Spring controllers**.

---

## Gaps (legacy Express still primary)

| Domain | Typical legacy paths | Spring status |
| --- | --- | --- |
| Full admin CRM | `/api/admin/homeowners*`, search, notes, legal, settings | Missing / shell |
| HomeCare / recurring | `/api/homecare*`, `/api/recurring-services*` | Missing (catalog list only) |
| Quotes workspace depth | quote-workspace routes | Partial (proposal/CO on job) |
| Invoices | `/api/invoices*` | Missing |
| Payouts v2 | `/api/payout*` | Missing (Connect onboard only) |
| Tips / coupons / schedules | various | Missing |
| Disputes / refunds | refund helpers | Missing |
| Compliance docs CRUD | contractor-compliance | Missing |
| Employees / availability | team routes | Missing |
| Support tickets | `/api/support*` | Missing |
| Partners / referrals | partner routes | Missing |
| Legal publish | `/api/admin/legal*` | Missing |
| Service reminders cron | admin reminders | Missing |
| Reviews | `GET /api/reviews` | Permitted in security; no controller |

---

## Contract stability

Preserve path shapes and response envelopes (`{ ok, … }`) so smoke scripts can retarget `API_BASE` from Netlify to Spring without rewriting clients.

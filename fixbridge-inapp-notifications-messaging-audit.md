# FIXBRIDGE IN-APP COMMUNICATIONS

Date: 2026-09-03

## Summary

Native in-app notifications and messaging are implemented using Neon PostgreSQL, Express APIs, and React UI. No third-party messaging providers are required. Support tickets remain a separate structured escalation path; general messaging uses extended `conversations` / `messages` tables.

---

## Results

| Area | Status |
|------|--------|
| Notifications | **PASS** |
| Notification red badge | **PASS** |
| Unread count | **PASS** |
| Mark read | **PASS** |
| Mark all read | **PASS** |
| Clear/archive | **PASS** |
| Notification deep links | **PARTIAL** — `actionUrl` stored; basic navigation wired |
| Homeowner ↔ Admin | **PASS** |
| Contractor ↔ Admin | **PASS** |
| Admin inbox | **PASS** |
| Admin initiation | **PARTIAL** — API supports `homeownerUserId` / `contractorUserId`; profile buttons not yet added |
| Unread message badge | **PASS** |
| Read state | **PASS** |
| Attachments | **PASS** |
| Photo upload | **PASS** |
| PDF | **PASS** |
| Multiple attachments | **PASS** (max 5) |
| Attachment security | **PASS** |
| Near-real-time updates | **PASS** |
| Method | **Polling** (15s visible tab, slower when hidden) + focus refresh |
| RBAC | **PASS** |
| IDOR | **PASS** |
| XSS protection | **PASS** |
| Rate limiting | **PASS** (30 messages/min/user) |
| Mobile | **PARTIAL** — responsive layout; manual device QA recommended |
| Build | **PASS** |
| Automated tests | **21/21 PASS** (`smoke:inapp-communications`) |

---

## Architecture

### Notifications
- Extended existing `notifications` table: `read_at`, `archived_at`, `entity_type`, `entity_id`, `action_url`, `metadata`
- Service: `api/in-app-notifications.js`
- Routes: list, unread-count, mark read, mark all read, archive, archive-read
- Server-side creation only (`createInAppNotification`, `notifyAdmins`)
- Existing writers (jobs, payouts, support tickets, etc.) continue inserting notifications

### Messaging
- Reused orphan `conversations` + `messages` tables (extended)
- New: `conversation_read_cursors`, `message_attachments`
- Types: `homeowner_admin`, `contractor_admin` only (no direct homeowner↔contractor)
- Admin replies display as **FixBridge Support**; internal `sent_by_admin_user_id` stored
- Attachments: JPEG/PNG/WEBP/PDF, max 2.5 MB, authorized download proxy

### Frontend
- `NotificationBell` — header dropdown with badge
- `NotificationsPage` — full list with filters
- `MessagesPanel` — conversation list + thread + composer (all roles)
- `useInAppComms` — polling hook for badge counts
- Wired into Homeowner inbox, Contractor Messages, Admin Communications tab

### Support tickets
- **Unchanged** — `support_tickets` remain for structured help/escalation
- Ticket replies still create in-app notifications

---

## Storage provider

**Neon PostgreSQL** — attachment bytes stored as base64 in `message_attachments.storage_data` (same durable pattern as employee photos and legacy job chat). No Netlify ephemeral filesystem.

External object storage (S3/R2) can be added later behind the same attachment API.

---

## Near-real-time strategy

**Polling** — not WebSockets/SSE (Netlify/serverless constraints).

- 15-second interval when tab visible
- 45-second when hidden
- Immediate refresh on window focus and after send/read actions

Described accurately as **near-real-time**, not true push.

---

## Files changed

### Backend
- `api/in-app-notifications.js` (new)
- `api/messaging.js` (new)
- `api/app.js` — schema init + route registration

### Frontend
- `src/app/notificationsApi.ts` (new)
- `src/app/messagingApi.ts` (new)
- `src/app/useInAppComms.ts` (new)
- `src/app/NotificationBell.tsx` (new)
- `src/app/NotificationsPage.tsx` (new)
- `src/app/MessagesPanel.tsx` (new)
- `src/app/HomeownerInboxPanel.tsx`
- `src/app/HomeownerDashboard.tsx`
- `src/app/HomeownerBottomNav.tsx`
- `src/app/ContractorDashboard.tsx`
- `src/app/AdminPanel.tsx`

### Tests
- `scripts/smoke-inapp-communications.mjs` (new)
- `package.json` — `smoke:inapp-communications`

---

## Database changes (additive)

```sql
-- notifications extensions
ALTER TABLE notifications ADD COLUMN read_at, archived_at, entity_type, entity_id, action_url, metadata;

-- conversations extensions
ALTER TABLE conversations ADD type, homeowner_user_id, contractor_user_id, subject, status, updated_at;
ALTER TABLE conversations ALTER COLUMN job_id DROP NOT NULL;

-- messages extensions
ALTER TABLE messages ADD sender_role, sender_display_name, sent_by_admin_user_id;

-- new tables
CREATE TABLE conversation_read_cursors (...);
CREATE TABLE message_attachments (...);
```

---

## External configuration required

None for core in-app messaging. Email/SMS remain optional future channels subscribing to the same events.

---

## Remaining issues

1. **Admin profile “Message Homeowner/Contractor” buttons** — API ready; UI shortcuts on profiles not wired
2. **Notification deep links** — partial navigation mapping per role
3. **Mark notification unread** — not implemented (low priority)
4. **Message pagination UI** — API supports `beforeId`; UI loads latest 50 only
5. **Migrate legacy job chat** — `JobChatPanel` still unwired; separate from admin messaging
6. **Large attachment storage** — base64 in Postgres works for beta; object storage recommended at scale

---

## Future integration

`createInAppNotification()` and message send hooks are ready for optional SMS/email/push subscribers without changing core UX.

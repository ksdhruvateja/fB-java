# Scaling FixBridge

This covers what the code now does for scale and isolation, what was measured, and the infrastructure needed to reach 10,000+ simultaneous users and, later, a billion registered accounts. Code alone cannot deliver those numbers: they depend on how many servers run, the database tier, file storage and the AI providers' limits.

## 1. What the code does now

| Area | Change |
| --- | --- |
| Stateless API | Sessions are signed tokens, so any API instance can serve any user. Add instances behind the load balancer to add capacity. |
| Shared debug log removed from the request path | Every API request used to rewrite one shared JSON file containing all users' requests and responses. That serialised every request and mixed users' data. It is now off unless `JOB_DEBUG_LOG=true` outside production. |
| Photos out of the job rows | Case photos are stored once as bytes in Neon (`media_objects.bytes`), and job rows keep only a reference, so reading a job no longer pulls its photo. `MEDIA_STORAGE=s3` optionally moves the bytes to a bucket. |
| Lighter dashboard | Job lists no longer embed each job's photo, contractor insurance document or staff photo. Photos load through 1-hour signed links (`/api/media/job/:id`). The average dashboard response fell from 117 KB to 2 KB. Lists are capped at 500 jobs per request. |
| Durable AI queue | On long-running servers (Railway), AI assessments are rows in `fixera_assessment_queue`, claimed with `FOR UPDATE SKIP LOCKED`. Work survives restarts and deploys, runs once, and is shared across every instance. Each instance runs at most `FIXERA_WORKER_CONCURRENCY` (default 4) at a time. Work left by a crashed instance is retried. Netlify keeps its background function. |
| Fair use | The queue runs one assessment per homeowner at a time while others are waiting, so a heavy user cannot delay everyone else. Instant AI calls (chat, direct assessment, reassess, Home Assistant) are limited to 2 in flight per user and `AI_MAX_INFLIGHT` (default 64) per instance. Beyond that the server answers "busy, retry in a few seconds" (503) instead of slowing every user down. |
| Bounded memory | The login and subscription caches are capped (`AUTH_CACHE_MAX`, `ENTITLEMENT_CACHE_MAX`, default 50,000 each) and keep only what they need. They used to grow with every user and held each user's full row, including uploaded documents. |
| Database connections | Pool size, idle timeout, connect timeout and a 60-second statement timeout are configurable (`DB_POOL_MAX` default 20, `DB_POOL_IDLE_MS`, `DB_CONNECT_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`). A runaway query cannot hold a connection other users are waiting for. |
| Safe with many instances | Maintenance reminders take a database lock, so only one instance sends. Service reminders already claim rows. |
| Graceful shutdown | On a deploy or scale-in, in-flight requests finish and connections are returned (`SHUTDOWN_GRACE_MS`, default 25 s). |
| Per-user personalisation | `fixera_user_profiles` holds one profile per homeowner, built from that homeowner's own cases only (see FIXERA_FIXES.md §11). |

## 2. Measured

Run with `scripts/loadtest.mjs`. Each virtual user has its own account, house and three jobs with a 150 KB photo, and repeats the dashboard requests: session restore, job list, unread count, properties.

The test ran on one 4-core container that also ran PostgreSQL and the load generator. Treat the numbers as a before/after comparison, not production capacity.

| Run | Simultaneous users | Requests/s | Median | 95th percentile | Errors | Responses with another user's data |
| --- | --- | --- | --- | --- | --- | --- |
| Before, 1 instance | 400 | 248 | 1.67 s | 2.31 s | 0 | 0 |
| After, 1 instance | 400 | 549 | 0.79 s | 1.04 s | 0 | 0 |
| After, 1 instance | 1,000 | 545 | 1.96 s | 2.55 s | 0 | 0 |
| After, 3 instances (same machine) | 1,000 | 929 | 0.93 s | 2.08 s | 0 | 0 |

- **Every response was checked for another user's data.** None was found in any run.
- **Throughput grows with instances.** The 3-instance figure is held back by the shared 4 cores; separate machines scale closer to linearly.
- **AI was not part of this test.** No provider keys were available; see section 4.

## 3. 10,000 simultaneous users

**Assumption:** an active user makes a request about every 5 seconds, which is about 2,000 requests per second for 10,000 users.

| Component | Starting point |
| --- | --- |
| API | 8–10 Railway instances of 1–2 vCPU behind the load balancer. Roughly 500 requests/s per instance was measured on shared hardware, and this keeps 2× headroom. Autoscale on CPU and response time. |
| Database | Neon with autoscaling compute (for example 4–8 CU) and the **pooled** connection string (`-pooler` host). Keep `DB_POOL_MAX` × instances below the pooler's limit. Add a read replica if dashboard reads dominate. |
| AI workers | The same instances, or a separate worker service (`FIXERA_WORKER_ENABLED=false` on the API side plus `FIXERA_QUEUE_EXTERNAL_WORKER=true`). Size the total worker concurrency to your provider limits (section 4). |
| Rate limits | They are per instance and in memory today. With many instances, move them to a shared Redis store so the limits are exact. |
| Static site | Already served by Netlify's CDN. |
| Monitoring | Alert on 5xx rate, 95th-percentile latency, queue depth (`SELECT count(*) FROM fixera_assessment_queue WHERE status='queued'`), database CPU and connections. |

**Before launch:** run `scripts/loadtest.mjs` (or k6) from several machines against staging at 10,000 virtual users, and confirm latency and the zero-leak check there.

## 4. AI capacity

The real limit for simultaneous assessments is the AI providers, not FixBridge.
- **Throughput:** an assessment takes about 10–30 seconds. If your provider accounts allow *N* requests at a time, completed assessments per minute ≈ *N* × 60 / 20.
- **Example:** 10,000 people starting an assessment in the same minute needs on the order of 3,000 requests at a time across providers.
- **What the queue does:** it keeps the site responsive and fair while that happens (people see "analysing" and results arrive in order). It cannot create provider capacity.
- **What to do:**
  - Ask each provider for higher rate limits.
  - Keep several providers configured; the fallback chain already exists.
  - Set `FIXERA_WORKER_CONCURRENCY` × instances to just below the combined limit.

## 5. Toward a billion registered users

These need infrastructure projects; they are not in this patch.
1. **Photo storage.** Photos are in Neon as bytes, outside the job rows (FIXERA_FIXES.md §12). At very large volume, set `MEDIA_STORAGE=s3` to move them to a bucket behind a CDN with `scripts/migrate-case-photos.mjs`; no code change is needed.
2. **Partition and shard by user.** A single PostgreSQL database will not hold the jobs, notifications, interactions and media of a billion accounts.
   - Partition the big tables by `homeowner_user_id`/`user_id` hash, then shard: Citus, or several Neon projects with a router keyed by user or region.
   - Every query is already scoped by user or property, which keeps sharding straightforward.
3. **Archive old data.** Move closed jobs, read notifications and AI interaction logs older than N months to cheaper storage.
4. **Shared cache and limits** (Redis), and multi-region deployment with regional databases for latency and resilience.
5. **Login at scale.** Signed tokens already avoid server-side session storage. Keep the Google sign-in verification and the bcrypt cost; add instances for sign-in bursts.
6. **Operations:** distributed load tests, failure drills (kill an instance during load; the queue must recover), backups and point-in-time recovery, and on-call alerting.

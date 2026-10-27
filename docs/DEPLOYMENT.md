# Production Deployment Guide

This guide details operational procedures for provisioning, deploying, monitoring, backing up, and rolling back the LMS platform.

---

## 1. Architecture & Component Topology

```
             ┌─────────────────────────┐
             │       CDN / Edge        │
             │   (Cloudflare / Fastly) │
             └────────────┬────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
    ┌───────▼─────────┐       ┌─────────▼─────────┐
    │  apps/web (SSR) │       │  apps/api (Nest)  │
    │  Port 3100      │       │  Port 4100        │
    └───────┬─────────┘       └─────────┬─────────┘
            │                           │
            │                           ├──► PostgreSQL (Port 5432)
            │                           ├──► Redis (Port 6379)
            │                           ├──► S3 Storage (MinIO / AWS S3)
            │                           └──► SMTP Relay
            │                                     ▲
    ┌───────▼─────────────────────────────────────┴───────┐
    │  apps/api Worker (BullMQ consumers & tasks)         │
    │  - Fulfillment, Completion, Notifications, Media    │
    └─────────────────────────────────────────────────────┘
```

- **Web Tier (`apps/web`)**: Next.js 15 App Router running on port 3100. Stateless; scales horizontally.
- **API Tier (`apps/api`)**: NestJS 11 application on port 4100. Exposes `/api/v1` routes and optional Swagger docs at `/api/docs`.
- **Worker Tier (`apps/api/dist/workers/main.js`)**: Background processes running BullMQ queue consumers and periodic cron tasks.
- **Persistence**:
  - PostgreSQL 16+ with connection pooling (PgBouncer recommended).
  - Redis 7+ for queue management and distributed caching.
  - S3-compatible Object Storage for assets and generated certificates.

---

## 2. Secrets Management & Environment Configuration

Never commit production `.env` files. Inject secrets via Kubernetes Secrets, AWS Secrets Manager, or HashiCorp Vault.

### Critical Production Secrets

| Variable | Description | Security Requirements |
| -------- | ----------- | --------------------- |
| `DATABASE_URL` | PostgreSQL connection string with SSL | Must use TLS (`sslmode=require`) |
| `REDIS_URL` | Redis connection string with TLS/Auth | `rediss://...` with strong password |
| `JWT_ACCESS_SECRET` | Secret for short-lived access tokens | 256-bit cryptographically secure string (min 32 chars) |
| `JWT_REFRESH_SECRET` | Secret for rotating refresh tokens | 256-bit cryptographically secure string (min 32 chars) |
| `CONTENT_HOST_KEY` | Encrypts live-session host URLs | Required in production; 64 lowercase hexadecimal characters, generated securely |
| `AUDIT_IP_HASH_SECRET` | Salt for anonymizing IP addresses in audit logs | Unique per deployment (min 32 chars) |
| `TENANCY_MAIL_KEY` | AES-256-GCM encryption key for invitation tokens in the outbox | Explicit base64-encoded 32-byte key; never use the committed development default |
| `STRIPE_SECRET_KEY` | Stripe API Secret Key | Test or live secret/restricted key matching `STRIPE_MODE` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Endpoint Secret | `whsec_...` from Stripe Webhook settings |
| `S3_ACCESS_KEY_ID` | S3 Access Key ID | IAM user with scoped bucket permissions |
| `S3_SECRET_ACCESS_KEY` | S3 Secret Access Key | Stored securely |
| `CERTIFICATE_CHROMIUM_PATH` | Path to Chrome binary for rendering | Absolute path (worker image: `/usr/bin/chromium`) |

Production startup requires an explicit `TENANCY_MAIL_KEY` distinct from the committed development default, an `AUDIT_IP_HASH_SECRET`, and a `CONTENT_HOST_KEY` containing 64 lowercase hexadecimal characters for live-session host URL encryption. Provide all three to production API and worker containers, including Docker Compose deployments and CI deployments targeting production. Rotate the mail key by setting a new `TENANCY_MAIL_KEY` and `TENANCY_MAIL_KEY_ID`, and retaining old keys in `TENANCY_MAIL_PREVIOUS_KEYS`, a JSON map of key ID to base64 key, until encrypted outbox entries no longer need them. Protect the previous keys like the current key.

`STRIPE_MODE` defaults to `test`: keys must start with `sk_test_` or `rk_test_`. `live` is allowed only in production and requires `sk_live_` or `rk_live_`. Use the webhook signing secret for the corresponding endpoint and mode; incoming webhook events and retrieved sessions must match the configured mode. Before going live, decide the payment and payout business model, configure the live endpoint and matching secrets, verify webhook delivery and reconciliation, run a controlled live transaction and refund, and monitor failures.

`TRUST_PROXY` defaults to `false`; use a known hop count (1–10) when every request traverses exactly that many trusted proxies, or a comma-separated list of trusted proxy IPs/CIDRs or `loopback`, `linklocal`, `uniquelocal`. Use `true` only when the ingress reliably overwrites forwarded headers and direct access is blocked. `THROTTLE_STORAGE` defaults to `redis`, using `REDIS_URL` and prefix `lms:throttle:`; `memory` is allowed only in development or test. `SWAGGER_ENABLED` defaults to `false` in production and `true` otherwise; set it explicitly if needed.

---

## Container images

Build from the repository root (pass the public API URL at build time for the web bundle):

```bash
docker build -f apps/api/Dockerfile --target api -t lms-api .
docker build -f apps/api/Dockerfile --target worker -t lms-worker .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://example.com/api/v1 -t lms-web .
```

Run with deployment-specific environment and networking, for example `docker run --env-file production.env lms-api`, `docker run --env-file production.env lms-worker`, and `docker run --env-file production.env lms-web`. The worker image includes Chromium, ffmpeg/ffprobe, `clamscan`, and a signature database populated by `freshclam` at build time. Keep signatures current with `freshclam` on the worker host or rebuild and redeploy the image regularly; scanning uses the CLI, not a clamd daemon. The API image defaults to `node dist/main.js`; the worker target defaults to `node dist/workers/main.js`.

Run migrations as a one-off from the build stage, which contains the Prisma CLI and migration files:

```bash
docker build -f apps/api/Dockerfile --target build -t lms-migrate .
docker run --rm --env-file production.env -w /app/apps/api lms-migrate pnpm exec prisma migrate deploy
```

## 3. Zero-Downtime Expand/Contract Migrations

All schema changes adhere to the **expand/contract pattern**:

### Phase 1: Expand
1. Add new columns as **nullable** or with safe database defaults.
2. Add new tables, relations, and indexes concurrently (`CREATE INDEX CONCURRENTLY`).
3. Deploy new application code capable of reading both old and new representations and writing the new format.

### Phase 2: Backfill & Verify
1. Execute background data backfills in small batches using keyset pagination.
2. Verify that all application replicas are running the new release.

### Phase 3: Contract
1. Add `NOT NULL` constraints (using `VALIDATE CONSTRAINT` in PostgreSQL).
2. Drop deprecated columns in a follow-up deployment once old application versions are no longer active.

### Migration Deployment Command
```bash
# Apply committed migrations without running interactive development generators
pnpm --filter @lms/api exec prisma migrate deploy
```

---

## 4. Backups and Disaster Recovery Drill

### Database Backup
Execute automated hourly snapshots and daily full logical dumps:
```bash
# Automated logical backup
pg_dump -Fc --no-owner --no-privileges -d "$DATABASE_URL" -f "/backups/lms_$(date +%Y%m%d_%H%M%S).dump"
```

### S3 Storage Versioning
Object storage buckets (`lms-private` and `lms-public`) must have versioning enabled:
```bash
# Verified via scripts/bootstrap-storage.sh in development
aws s3api put-bucket-versioning --bucket lms-private --versioning-configuration Status=Enabled
```

### Regular Restore Drill Procedure
1. Create a disposable target database:
   ```bash
   createdb -h localhost -U lms lms_restore_drill
   ```
2. Restore the logical dump:
   ```bash
   pg_restore --clean --if-exists -d "postgresql://lms:password@localhost:5432/lms_restore_drill" /backups/latest.dump
   ```
3. Run verification checks:
   ```bash
   DATABASE_URL="postgresql://lms:password@localhost:5432/lms_restore_drill" pnpm --filter @lms/api exec prisma migrate status
   ```
4. Verify key ledger counts (Orders, Enrollments, Certificates).

---

## 5. Queue Draining & Worker Lifecycle

### Graceful Shutdown
Worker processes listen for `SIGINT` and `SIGTERM`. When received:
1. Pauses incoming job polling on all active queues.
2. Permits active job executions up to `SHUTDOWN_TIMEOUT_MS` (default 30 seconds).
3. Closes Redis connection handles and exits cleanly.

### Pre-Deployment Queue Drain
When performing breaking operational maintenance:
```bash
# Pause queue processing via Redis command or BullMQ CLI
redis-cli -u "$REDIS_URL" PAUSE 60000
```

### Dead-Letter & Failure Recovery
Failed outbox events transition to `status = DEAD` and record `errorCode` and attempt counters.
Administrators can inspect failed events and trigger replays via:
- Web: `/admin/operations`
- API: `POST /api/v1/workspaces/:workspaceId/operations/events/:eventId/replay`

---

## 6. Health Checks, Monitoring & Metrics

### Health Endpoints
- **Readiness Probe**: `GET /api/v1/health`
  - Validates PostgreSQL connection pool health.
  - Validates Redis connectivity.
  - Returns `200 OK` with JSON:
    ```json
    { "data": { "status": "ok", "database": "ok", "redis": "ok" } }
    ```
  - Returns `503 Service Unavailable` if database or Redis fails.
- **Liveness Probe**: `GET /api/v1/health` (also checks dependencies)

### Key Metric Thresholds
- **Catalog Browsing (`/api/v1/catalog/courses`)**: p95 < 50ms, throughput > 400 req/s.
- **Player & Lessons (`/api/v1/me/enrollments/:id/lessons/:id`)**: p95 < 80ms.
- **Assessment Submission**: p95 < 120ms.
- **Database Connection Budget**: Configure PgBouncer max client connections to 500, pool size to 50.

---

## 7. Rollback Procedures

If an incident occurs post-deployment:
1. **Traffic Switch**: Revert ingress / load balancer routing to previous stable container tags for Web and API.
2. **Worker Alignment**: Revert worker deployment to the matching previous tag immediately to avoid schema version divergence.
3. **Database Safeguard**: Because expand/contract migrations never drop active columns during expand, the previous code version remains fully operational against the expanded schema.
4. **Verification**: Run `pnpm check:api-paths` and curl `/api/v1/health` to confirm cluster stability.

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

- **Web Tier (`apps/web`)**: Next.js 15 App Router running standalone on port 3100. Stateless; scales horizontally.
- **API Tier (`apps/api`)**: NestJS 11 application on port 4100. Exposes `/api/v1` routes and Swagger docs at `/api/docs`.
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
| `AUDIT_IP_HASH_SECRET` | Salt for anonymizing IP addresses in audit logs | Unique per deployment (min 32 chars) |
| `TENANCY_MAIL_KEY` | Symmetric key for workspace invitation HMACs | Base64-encoded 32-byte key |
| `STRIPE_SECRET_KEY` | Stripe API Secret Key | Restricted key from Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Endpoint Secret | `whsec_...` from Stripe Webhook settings |
| `S3_ACCESS_KEY_ID` | S3 Access Key ID | IAM user with scoped bucket permissions |
| `S3_SECRET_ACCESS_KEY` | S3 Secret Access Key | Stored securely |
| `CERTIFICATE_CHROMIUM_PATH` | Path to Chrome binary for rendering | Absolute path (`/usr/bin/google-chrome`) |

Startup validation will fail fast and abort boot if any mandatory secret is absent or malformed.

---

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
- **Liveness Probe**: `GET /api/docs-json` or `/api/v1/health`

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

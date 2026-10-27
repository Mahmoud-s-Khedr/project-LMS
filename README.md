# Learnspace LMS

A pnpm/Turborepo workspace for a course-selling and learning platform. The foundation uses NestJS 11, Next.js 15 App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Redis/BullMQ, and S3-compatible storage.

## Requirements

- Node.js 22.12+ within the Node 22 release line (`nvm use`)
- pnpm 10 (`corepack enable && corepack prepare pnpm@10.33.0 --activate`)
- Docker Engine with Docker Compose

## Set up

Run these commands from the repository root:

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`pnpm install` builds `@lms/shared`. Prisma reads the canonical schema at `apps/api/prisma/schema.prisma` and the root `.env` through `apps/api/prisma.config.ts`. Migration creation is coordinated by the database owner; use `pnpm --filter @lms/api db:deploy` to apply committed migrations in deployment. The idempotent development seed supplies demo users, workspaces, courses, enrollments, assessments and commerce ledgers; see [development fixtures](apps/api/prisma/fixtures/README.md) for local-only login credentials and limits.

The example credentials are for local development. Configure real secrets and service endpoints for deployment. Environment variables supplied by the process override `.env` values.

## Run

```bash
pnpm dev
```

Or run either service separately:

```bash
pnpm --filter @lms/api dev
pnpm --filter @lms/web dev
```

| Service       | Local URL / connection               |
| ------------- | ------------------------------------ |
| Web           | http://localhost:3100                |
| API           | http://localhost:4100/api/v1         |
| API readiness | http://localhost:4100/api/v1/health  |
| Swagger       | http://localhost:4100/api/docs       |
| PostgreSQL    | localhost:55432, database/user `lms` |
| Redis         | localhost:56379                      |
| MinIO API     | http://localhost:59000               |
| MinIO console | http://localhost:59001               |
| Mailpit inbox | http://localhost:58025               |
| SMTP          | localhost:51025                      |

The web and API ports are explicit. Port 3000 belongs to another project.

Compose uses project name `lms`, named volumes, health checks, and loopback-only host bindings. Its bucket initializer creates `lms-private` (anonymous access disabled) and `lms-public` (anonymous reads enabled). MinIO and `mc` are packaged in the same digest-pinned Chainguard image because the original upstream Docker Hub and Quay repositories are unavailable. The local MinIO container runs as root to initialize its Docker-managed data volume. Mailpit captures local email without delivering it externally.

Stop the development servers with Ctrl+C. Stop this project's infrastructure with `pnpm docker:down`; named volumes are retained. Use `docker compose down --volumes` only when you intend to erase this project's local data.

## Check and build

```bash
pnpm -r typecheck
pnpm -r test
pnpm lint
pnpm build
pnpm format:check
```

The root `typecheck`, `test`, `lint`, and `build` scripts use Turborepo to build workspace dependencies first. API tests use Jest; shared and web tests use Vitest, with Testing Library for web interactions. Generated Prisma types require `pnpm db:generate` after any schema update.

For production-style local runs, build first, then run `pnpm --filter @lms/api start:prod` and `pnpm --filter @lms/web start` in separate terminals.

## Workspace layout

```text
apps/api/src/common/           HTTP errors and validation
apps/api/src/infrastructure/   Prisma, Redis/queues, object storage, email
apps/api/src/health/           Readiness endpoint
apps/api/src/modules/          Domain packages (owned by feature agents)
apps/api/prisma/               Canonical data model and database tooling
apps/web/src/app/              App Router pages and layouts
apps/web/src/components/ui/    shadcn/ui primitives
apps/web/src/features/         Domain UI packages
apps/web/src/lib/api/          Typed fetch client and session refresh
packages/shared/src/          Shared Zod schemas, enums, and HTTP contracts
docs/                         Architecture and domain contracts
.orchestration/               Package ownership, dependency requests, reports
```

Domain modules register in `apps/api/src/app.module.ts`. The API has global class-validator validation; use `ZodValidationPipe` on parameters that use Zod schemas. Unhandled exceptions return the shared error envelope with an `x-request-id` header; Pino logs structured request records and redacts authorization and cookie headers.

The web root provides TanStack Query, light/dark themes, and Sonner notifications. Use `api` / `apiFetch` from `@/lib/api` for credentialed requests. It retries a request once after a successful, deduplicated `/auth/refresh` call; access tokens stay in memory and refresh tokens belong in HttpOnly cookies. Authentication endpoints are implemented by the identity package.

The UI primitives are derived from the upstream shadcn/ui `new-york-v4` registry (https://ui.shadcn.com). Keep feature-specific logic in `src/features`, and coordinate shared contracts and dependency requests through `.orchestration/deps`.

Cookie-changing auth calls automatically obtain a CSRF token. Refresh uses Web Locks and BroadcastChannel in supporting browsers, and concurrent calls share one refresh promise. Writes receive an idempotency key that is preserved across a refresh retry; callers should supply their own key when reusing one across separate user attempts. HTTP responses retain the API's `{data, meta?}` envelope.

## Seeded Accounts

The idempotent development seed (`pnpm db:seed`) creates default test accounts with password `Lms-demo-only!2026`:

| Role                 | Email                        | Purpose                                                                        |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| Platform Super Admin | `admin@example.test`         | Full platform administration, audit logs, webhooks inspection, user governance |
| Workspace Owner      | `owner@example.test`         | Academy owner, workspace settings, pricing, members                            |
| Course Instructor    | `instructor@example.test`    | Course builder, curriculum, assessments authoring, coupons, reporting          |
| Teaching Assistant   | `ta@example.test`            | Assessment grading queue, student submissions evaluation                       |
| Student 1            | `student@example.test`       | Enrolled learner, lesson player, quiz & assignment taker, certificates         |
| Student 2            | `other-student@example.test` | Second learner for multi-tenant, drip & cohort isolation testing               |

All seeded accounts have email verification pre-stamped and Argon2id password hashes configured.

## Scanner Modes

- `MEDIA_SCANNER_MODE=clamav` (Default): Production and standard development mode. Inspects uploaded media via local ClamAV daemon.
- `MEDIA_SCANNER_MODE=development-bypass`: Development-only fallback when running offline without ClamAV. Bypasses virus scanning. **Strictly forbidden in production** (enforced by startup environment validation).

## Self-contained HTTP QA

Start the seeded local infrastructure, then build before running the suites:

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm test:security
pnpm test:e2e --workers=1
```

Both commands own a fresh API on 4100 with `NODE_ENV=test` and stop it by PID afterward. Leave ports 4100 and 3100 free before running. Fresh processes reset in-memory throttle state between suites; the auth test limit applies only to `NODE_ENV=test`, never development or production. Security QA sets a local test-only `STRIPE_WEBHOOK_SECRET=whsec_test_secret_for_qa_testing_only_12345` in both the API and test process, so all three signature/replay tests execute. It also sets the SDK-only placeholder `STRIPE_SECRET_KEY=sk_test_local_fixture` because the provider requires both settings to initialize; no Stripe API call or account is needed for these signed fixtures. API logs are under `/tmp/lms-security-api.log`.

E2E also owns the worker and production web server on 3100. It explicitly sets `MEDIA_SCANNER_MODE=development-bypass` for its API and worker only, allowing the real assignment upload pipeline without a local ClamAV install. The regular `.env` scanner setting is unchanged. Chromium (Playwright browser installation), PostgreSQL, Redis, MinIO and Mailpit (API 58025) are required. The free learner journey creates unique fixtures through APIs; its only direct database write verifies the student's email. Retained course, enrollment, grading and certificate history remains in the seeded dev DB.

## Stripe Test Setup

The free journey runs without Stripe. `full-learner-journey.spec.ts` skips unless a real Stripe test secret key is supplied; `sk_test_local_fixture` is not a real key and must not be reported as payment coverage.

For paid QA, use a real Stripe test account and forward its webhooks:

```bash
stripe listen --forward-to localhost:4100/api/v1/webhooks/stripe
# In another terminal, use your account's key and the whsec_... printed by stripe listen:
STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... pnpm test:e2e --workers=1
```

Keep `stripe listen` running throughout paid QA. The runner preserves these E2E Stripe settings. Empty keys disable checkout. Webhook signature verification is always enforced; the security suite's local secret authenticates fixtures only and does not enable Stripe Checkout.

## API Path Parity

With the API running on port 4100:

```bash
pnpm check:api-paths
```

Statically analyzes every `api.get/post/put/patch/delete` call across `apps/web/src` and checks them against the OpenAPI schema exported by `/api/docs-json`. Exits with code 0 only when there are zero mismatches and zero unresolved paths. All Phase 4 administration endpoints are fully registered and passing.

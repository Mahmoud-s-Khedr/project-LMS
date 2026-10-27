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
pnpm test
pnpm test:db
pnpm test:security
pnpm test:e2e --workers=1
pnpm lint
pnpm build
pnpm format:check
```

The root `typecheck`, `test`, `lint`, and `build` scripts use Turborepo to build workspace dependencies first. Plain `pnpm test` runs workspace unit suites; database-backed API tests are skipped unless their test database URLs are set. `pnpm test:db` runs the workspace tests with isolated PostgreSQL databases and exercises SMTP and storage using the local services. `pnpm test:security` runs HTTP security tests; `pnpm test:e2e --workers=1` runs browser journeys after migrations, seed, build and Chromium installation. The HTTP suites start services on ports 4100 and 3100, so free those ports first. CI runs all four categories. API tests use Jest; shared and web tests use Vitest, with Testing Library for web interactions. Generated Prisma types require `pnpm db:generate` after any schema update.

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

- `MEDIA_SCANNER_MODE=clamav` (Default): Production and standard development mode. Inspects uploaded media via the `clamscan` CLI and its signature database (maintained with `freshclam`).
- `MEDIA_SCANNER_MODE=development-bypass`: Development-only fallback when running offline without ClamAV. Bypasses virus scanning. **Strictly forbidden in production** (enforced by startup environment validation).

## Web Security Headers and Content Security Policy

The Next.js 15 web application enforces strict baseline security headers and a per-request nonce-based Content Security Policy (CSP).

### Baseline Security Headers

Configured statically in `apps/web/next.config.ts`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enabled in `NODE_ENV=production`)

### Strict Nonce-Based Content Security Policy

CSP headers are dynamically generated per request in edge-safe middleware (`apps/web/src/middleware.ts`) via `apps/web/src/lib/security/csp.ts` using Web Crypto nonces (`crypto.getRandomValues`):

- **Scripts:** `script-src 'self' 'nonce-<base64>' 'strict-dynamic'`. Production forbids `'unsafe-inline'` and `'unsafe-eval'`. `'unsafe-eval'` is permitted strictly in `NODE_ENV=development` for React developer tooling and HMR.
- **Styles:** `style-src 'self' 'unsafe-inline'`. Retained because Next.js App Router, Tailwind CSS v4, and UI primitives (shadcn/Radix/Sonner) inject dynamic runtime styles and inline element style attributes during hydration and transitions.
- **Narrowed Origins (No Blanket `https: http:`):**
  - `img-src`: `'self' data: blob:` plus derived S3/CDN endpoints, and API origins.
  - `media-src`: `'self' data: blob:` plus S3/CDN endpoints and API origins for video/audio playback.
  - `connect-src`: `'self'`, API origin, and S3 presigned PUT upload origin. No Stripe origins: Checkout is a full-page redirect and the web app never loads Stripe.js.
  - `frame-src`: Configured embed origins (`CONTENT_EMBED_ORIGINS`) only (`'none'` when empty).
  - `frame-ancestors: 'none'`, `object-src: 'none'`, `base-uri: 'self'`, `form-action: 'self'`.
  - `upgrade-insecure-requests`: Enforced in production only.
- **Nonce Propagation:** The root layout (`apps/web/src/app/layout.tsx`) reads `headers().get('x-nonce')` and passes it to `<Providers nonce={nonce}>` (which nonces the `next-themes` theme-switch script) and inline client bootstrap scripts (`window.__zod_globalConfig = { jitless: true }`). Routes that require the nonce become dynamically server-rendered.

### CSP Environment Variables

- `NEXT_PUBLIC_API_URL`: Origin added to `connect-src`, `img-src`, and `media-src` (default: `http://localhost:4100/api/v1`).
- `API_PUBLIC_ORIGIN`: Public origin for course assets and API endpoints (default: `http://localhost:4100`).
- `S3_ENDPOINT`: Object store origin for presigned binary uploads and media streaming (default: `http://localhost:59000`).
- `CONTENT_PUBLIC_ORIGIN`: Optional CDN or public bucket origin if media is fronted by a CDN.
- `CONTENT_EMBED_ORIGINS`: Comma-separated list of permitted video and widget frame embed origins (default: `https://www.youtube-nocookie.com,https://player.vimeo.com,https://www.h5p.com`).

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

### Paid checkout browser journey

Create a Stripe test-mode secret key and install the Stripe CLI. Start webhook forwarding in a separate terminal:

```bash
stripe listen --forward-to localhost:4100/api/v1/webhooks/stripe
```

Set `STRIPE_SECRET_KEY` to the test key and `STRIPE_WEBHOOK_SECRET` to the `whsec_...` value printed by the listener; export both in the terminal that runs the tests. With infrastructure running, migrate and seed the database, build the workspace, and install Chromium (`pnpm exec playwright install chromium`), then run `pnpm test:e2e --workers=1`. The paid journey is skipped without a real `sk_test_...` key.

To enable it in CI, configure repository secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with the test key and the signing secret for `stripe listen` for that account. CI starts a Stripe CLI listener and forwards events to the API; both secrets must match that listener.

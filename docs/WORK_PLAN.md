# Implementation work plan

## 1. Execution rules and gates

This plan implements `ARCHITECTURE.md`, `API.md` and `apps/api/prisma/schema.prisma`. Read all three and `.orchestration/00-brief.md` / `.orchestration/RULES.md` before work. This is a package assignment plan, not permission to start unassigned work. The architect deliverable contains specifications and schema only; application implementation starts with P0.

Packages may run concurrently only when their dependencies have passed and their owned paths are disjoint. A later package can own a path used by an earlier package only after a recorded handoff and the earlier agent has stopped writing there. Features should not wait for a matching backend implementation once the shared contract gate passes: frontend packages use typed HTTP fixtures through the API client. Never import backend code into the web.

Difficulty is `simple`, `medium` or `hard`, based on concurrency/security/domain complexity. Package IDs are stable report/dependency-note names. Every package finishes with `.orchestration/reports/<id>.md` containing changed files, completed acceptance criteria, commands/results, open issues and exact wiring/dependency needs. Each package additionally owns only its own `.orchestration/deps/<id>*.md` and report. Reports are required even if blocked; do not claim unrun checks passed.

### Shared-file and integration policy

- P0 is the sole owner of root/workspace manifests, lockfile, tooling, Compose and bootstrap entrypoints during scaffolding. After P0, P5-I owns these integration surfaces; feature agents request dependency/wiring changes through their own deps note, not concurrent edits.
- P1-C owns all shared contract files after the P0 handoff. It freezes exported symbols, request/response shapes, errors and fixtures before downstream coding. Later amendments go to P1-C through a request and are serialized; no feature package edits a shared barrel.
- P1-D is the only schema/migration writer after architect handoff. Feature packages request a concrete Prisma/SQL diff. It serializes migrations and client generation with P0/P5-I. No agent runs `prisma db push` against shared data or fabricates its own migration branch.
- P0 supplies minimal placeholders in shared files and route layouts, then stops writing owned feature paths. P1-F takes shared frontend shell ownership only after handoff; feature packages own individual leaf pages and feature directories, never common layouts.
- P5-I wires module imports, providers, guards, workers, navigational links and package dependencies from reports. Backend modules export `<Name>Module`, expose documented services and contain their own processors/providers; they do not edit `app.module.ts` or a worker bootstrap. No service-locator lookup or dynamic runtime scanning replaces explicit integration.
- A backend package may contain controllers and service/repository/tests only within its owned module directories. Shared guard contracts are requested from P1-S. A frontend package places module-specific reusable components in its own feature directory, not `components/ui`.
- Run relevant tests for the behavior changed. Security, timing, financial idempotency and concurrency require integration tests with real PostgreSQL/Redis or faithful isolated services; trivial implementation-mirroring tests are insufficient. Do not repeatedly run the full suite while another agent is installing dependencies.
- No commits, resets, checkouts or stashes by package agents. Preserve concurrent changes. Do not use port 3000 or stop containers not created for this project.

## 2. Dependency graph and parallel waves

```text
Phase 0: P0 scaffold
          |
Phase 1a: P1-C contracts -------- P1-D database baseline
          |                             |
Phase 1b: P1-S identity/policy | P1-E event foundation | P1-F web shell
          |
Phase 2:  P2-B-CONTENT | P2-B-ASSESS | P2-B-COMMERCE
          P2-F-AUTH | P2-F-CATALOG | P2-F-AUTHOR | P2-F-ASSESS
          |
Phase 3:  P3-B-LEARNING | P3-B-ENGAGE | P3-B-ANALYTICS
          P3-F-LEARN | P3-F-STUDENT | P3-F-COMMERCE | P3-F-ADMIN
          |
Phase 4:  P4-B-FULFILL | P4-B-ADMIN | P4-QA
          |
Phase 5:  P5-I integration/release verification
```

The graph shows broad waves; each package's explicit dependency list is authoritative. P1-D and P1-C can run together after agreeing enum names/serialization. Backend learning consumes assessment result and access-policy interfaces established by P1-C/P1-S; assessment/content packages develop against those interfaces so there is no implementation cycle. P3-B-ENGAGE/P3-B-ANALYTICS consume shared event fixtures before learning/commerce producers finish. P4-QA can author scenarios against fixtures while modules finish, then runs them after integration.

## 3. Phase 0 — executable repository foundation

### P0 — Scaffold and local infrastructure

- **Difficulty:** hard.
- **Depends on:** architect documents/schema available; no feature implementation dependencies.
- **Owns:** root manifests/configuration, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, ESLint/Prettier/editor/git/node configs, `.env.example`, `docker-compose.yml`, `README.md`; workspace `package.json`/tsconfig/test/tool configs; `packages/config/**`; initial `packages/shared/**`; `apps/api/prisma.config.ts`; `apps/api/src/{main.ts,app.module.ts}`; `apps/api/src/infrastructure/**`; initial `apps/api/src/common/{filters,pipes}/**`; `apps/api/src/config/**`; `apps/api/src/health/**`; `apps/api/src/modules/health/**`; initial module README; `apps/web/src/app/{layout.tsx,page.tsx,globals.css}`; initial group layout stubs under `(public)`, `(auth)`, `(dashboards)`; `apps/web/src/components/**`, `apps/web/src/lib/**`, `apps/web/src/providers/**`; initial features README; API/web smoke test setup. This ownership ends at handoff. Does **not** own `docs/**`, `apps/api/prisma/schema.prisma`, migrations, future feature modules or feature route leaves.
- **Acceptance criteria:**
  - Node 22/pnpm 10 workspaces and Turborepo tasks (`dev`, `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:generate`, `db:seed`, `docker:up`, `docker:down`) run from root; strict TypeScript in every workspace.
  - Compose project `lms`: Postgres 16 host 55432, Redis host 56379, MinIO 59000/59001 with `lms-private`/`lms-public`, Mailpit 58025/51025; health checks, named volumes, working bucket initialization.
  - NestJS 11 boots on 4100 with Config validation, Prisma 7 driver adapter, Redis/BullMQ, S3 and Nodemailer services; graceful shutdown, Helmet, cookie parsing, pino request IDs and shared error filter; raw Stripe body support prepared; Swagger paths and `/api/v1/health` work.
  - Next.js 15/React 19 boots on 3100 with Tailwind v4, basic shadcn/ui-style primitives, TanStack Query, react-hook-form/zod availability, theme, HTTP client with credentialed fetch and typed errors. No feature business logic is required.
  - Shared starter exports include exact Role names, pagination schemas and API error envelope; package builds ESM/CJS/types without depending on Nest/Prisma/React. API/web can both import it.
  - Workspace install, build/typecheck/lint and one meaningful smoke test per app run; any environmental failures are explicitly reported. API readiness and web landing page are verified. Stop dev servers started for checks; leave project Compose services running. Read dependency request notes at end.

## 4. Phase 1 — stable contracts, schema and trust foundations

### P1-C — Shared contracts and fixtures

- **Difficulty:** hard.
- **Depends on:** P0 shared skeleton; architecture/API/schema.
- **Owns:** `packages/shared/src/**`, `packages/shared/test/**` only; P0 hands over these paths. Manifests/build config remain integration-owned.
- **Acceptance criteria:**
  - Domain folders export zod create/update/query/response schemas and inferred types for every API resource, exact Prisma enum value parity, stable errors and versioned events. Decimal/BigInt serialization and timezone/date/money conventions are explicit.
  - Event/notification contracts explicitly distinguish null global identity/security scope from required business tenant scope. Separate author vs learner question/attempt schemas prevent answer-key leakage. Lesson and question payloads are discriminated unions; unknown keys fail. Pagination/optimistic version/idempotency formats are shared.
  - Provide representative safe fixtures for catalog, enrollment, timed/manual assessments, checkout, errors, grading and dashboard reports. Tests cover actual invalid boundary inputs, secret-field rejection, and response serialization.
  - Publish symbol/path manifest and frozen contract revision in report; frontend/backend packages can develop independently. No speculative event fields or response variants diverge from API.md.

### P1-D — Database migrations, constraints and deterministic fixtures

- **Difficulty:** hard.
- **Depends on:** P0 Prisma configuration/infrastructure, architect schema; coordinates enum/serialization gate with P1-C.
- **Owns:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/**`, `apps/api/prisma/seed.ts`, `apps/api/prisma/fixtures/**`, `apps/api/prisma/tests/**`. Exclusive post-architect schema writer throughout all phases.
- **Acceptance criteria:**
  - Validate/format/generate the canonical schema using the installed Prisma version; apply initial migration to empty PostgreSQL 16, with all CHECK/partial index requirements in ARCHITECTURE §8. Review generated SQL, no cascaded financial/history deletes.
  - Database-level tests prove tenant FK rejection, one open attempt, one published assessment version, email/coupon normalization, global preference uniqueness, grant source shape and money/range constraints. Cross-row service invariants are documented for owning packages rather than falsely claimed as CHECKs.
  - Re-runnable seed supplies platform admin, personal and academy workspaces, all scoped roles, free/paid/self-paced/cohort examples, question types, published assessment versions, historical grades and multiple access sources. No real credentials or Stripe IDs; test credentials only in development instructions.
  - Fresh migrate→seed→generate works; migration rollout/backfill notes recorded. Serially apply later accepted schema requests without touching feature source or package manifests.

### P1-S — Auth, tenancy and shared authorization contracts

- **Difficulty:** hard.
- **Depends on:** P0, P1-C, P1-D.
- **Owns:** `apps/api/src/common/**`, `apps/api/src/modules/auth/**`, `apps/api/src/modules/users/**`, `apps/api/src/modules/tenancy/**`; P0 hands over its initial common filters/pipes first.
- **Acceptance criteria:**
  - All auth/profile/workspace/member/invitation endpoints in API.md implemented; Argon2id, email verification/reset, 10-minute JWT and fixed 30-day refresh families; hashes only, atomic single-child rotation and reuse revocation.
  - CSRF double-submit/Origin validation, rate-limit integration hooks, explicit scoped role guards and policy interfaces for staff/learner/resource access, ownership and current user state. No platform role escalation from signup/invites.
  - Provide shared `AccessPolicy` interface/token, transaction/context helpers and typed auth decorators; P3-B-LEARNING supplies the concrete learner evaluator through P5-I wiring. Auth tests do not require learning implementation.
  - Tests cover replay races, suspension/logout/reset revocation, cross-tenant IDs, owner transfer/last-admin protections, scope role escalation, expired invitations and uniform recovery responses. Reports describe module registration and mail/event interfaces required.

### P1-E — Durable event bus and audit

- **Difficulty:** hard.
- **Depends on:** P0, P1-C, P1-D.
- **Owns:** `apps/api/src/modules/events/**`, `apps/api/src/modules/audit/**`, `apps/api/src/workers/**`.
- **Acceptance criteria:**
  - Transaction-aware outbox/audit append helpers, including allowlisted global identity/security events before a user has a workspace; leased SKIP LOCKED dispatcher, stable BullMQ job IDs, per-consumer transactional receipts, retry/backoff/dead-letter and replay services.
  - Worker bootstrap accepts explicitly registered processors; no imports of incomplete feature implementation. Security audit redacts secrets, answers and signed links.
  - Crash-between-publish-and-mark, duplicate delivery, competing workers, lost lease and Redis recovery tests prove at-least-once behavior with one domain side effect per receipt. Reconciliation/backstop scheduler interface documented.

### P1-F — Shared frontend shell and transport

- **Difficulty:** medium.
- **Depends on:** P0, P1-C.
- **Owns:** `apps/web/src/components/**`, `apps/web/src/lib/**`, `apps/web/src/providers/**`, `apps/web/src/app/{layout.tsx,page.tsx,globals.css}`, group-level layout files only under `(public)`, `(auth)`, `(dashboards)`; `apps/web/src/app/(dashboards)/{student,instructor,admin}/layout.tsx`; `apps/web/src/app/learn/layout.tsx`. P0 must hand off these paths first; no ownership of nested leaf pages.
- **Acceptance criteria:**
  - Accessible responsive navigation/dashboard shells; role-aware menus, theme, loading/error boundaries and reusable primitives without business-specific screens.
  - Typed API transport follows shared envelope, sends credentials/CSRF, stores access token in memory, coordinates one refresh across tabs, one retry and preserved idempotency keys; no token in localStorage.
  - Query providers/keys and error handling support resource isolation on logout/workspace switch. Form patterns surface validation details and screen reader feedback. Transport tests cover concurrent 401s, refresh rejection and retry loops using HTTP fixtures.

## 5. Phase 2 — domain producers and independent frontend areas

The three backend packages below own disjoint modules and can run together. Each matching frontend area can run with P1 fixtures before its backend is complete.

### P2-B-CONTENT — Catalog, authoring, media and cohort delivery

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-D, P1-S, P1-E.
- **Owns:** `apps/api/src/modules/catalog/**`, `apps/api/src/modules/content/**`, `apps/api/src/modules/media/**`.
- **Acceptance criteria:** Catalog, category/staff/outline/prerequisite CRUD, publish/archive, cohorts/release overrides/live sessions and asset lifecycle endpoints implemented. Publish rejects cycles, wrong lesson/assessment types, unsafe rich text/embeds and unusable assets. Tenant/course composite links and actor permissions checked. Storage upload completion verifies actual bytes/MIME/checksum, scan state and purpose; download capabilities consult AccessPolicy and expire in 60 seconds. Cohort capacity reservation API is exposed for commerce/learning transactions. Tests cover staff capability flags, cross-parent IDs, negative signing, preview escape, drip boundaries and capacity contention. Provide explicit assessment-publish validation hook and learning AccessPolicy binding requests; never bypass them when absent.

### P2-B-ASSESS — Assessment authoring, delivery and grading

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-D, P1-S, P1-E; consumes frozen content/access interfaces, not unfinished concrete learning service imports.
- **Owns:** `apps/api/src/modules/assessments/**`.
- **Acceptance criteria:** Every bank/version/pool/accommodation/attempt/answer/grading endpoint implemented. Published versions and frozen pool membership preserved; unique deterministic draw and options order, cross-version attempt limits, server deadlines, accommodation and late policies enforced. Manual rubric/file grading, GradeEvents, released feedback, void and regrade work. Tests cover concurrent starts, deadline worker failure, duplicate submission, author edits after attempt, objective scoring edges, unpublished/pool/key leakage and unauthorized grading. Export finalized effective-result query and result events for learning; access evaluator is injected through the common interface.

### P2-B-COMMERCE — Commerce ledgers and Stripe state

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-D, P1-S, P1-E; cohort reservation contract from content is frozen before cohort checkout acceptance.
- **Owns:** `apps/api/src/modules/commerce/**`.
- **Acceptance criteria:** Products/prices/bundles/plans/coupons, quotes/checkout, order receipts, customer portal, payments, subscriptions/refunds and Stripe inbox endpoints implemented. Server pricing, immutable entitlement snapshots, coupon/seat reservations, refund locks/allocations and idempotency survive concurrency. Signature verification uses raw bytes and persisted Stripe ID mappings. Worker handles duplicate/unordered webhook and renewals/reconciliation without granting directly; emits trusted fulfillment events. Tests use Stripe fixtures/mock server and optionally test mode, never real charges; cover async payment failure, zero total, partial refund, cancellation/renewal and currency errors.

### P2-F-AUTH — Authentication and workspace onboarding

- **Difficulty:** medium.
- **Depends on:** P1-C, P1-F; P1-S required only for live acceptance.
- **Owns:** `apps/web/src/features/auth/**`, `apps/web/src/features/workspaces/**`, `apps/web/src/app/(auth)/{login,register,forgot-password,reset-password,verify-email,accept-invitation}/**`, `apps/web/src/app/(dashboards)/onboarding/**`.
- **Acceptance criteria:** Accessible validated auth forms, verified-email recovery/reset/invite flow, personal/academy creation and workspace chooser. Safe redirect paths, generic recovery messaging, session restore/logout behavior work through shared transport. No privilege selectors for platform roles. Tests cover expired token, validation errors, refresh/session expiry and keyboard navigation.

### P2-F-CATALOG — Public catalog and product detail

- **Difficulty:** medium.
- **Depends on:** P1-C, P1-F; live acceptance P2-B-CONTENT/P2-B-COMMERCE.
- **Owns:** `apps/web/src/features/catalog/**`, `apps/web/src/app/(public)/{catalog,courses,products,academies}/**`.
- **Acceptance criteria:** Search/filter/sort/cursor catalog, course/product/bundle/plan pages, safe outline/previews, cohort dates and price displays. Public/unlisted/private behavior follows API; protected asset links are requested only from dedicated endpoints. Responsive empty/loading/error states, SEO metadata and accessible filters. No client-authoritative pricing or hidden staff data.

### P2-F-AUTHOR — Instructor course/content/cohort editor

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-F; live acceptance P2-B-CONTENT.
- **Owns:** `apps/web/src/features/authoring/**`, `apps/web/src/app/(dashboards)/instructor/courses/**`.
- **Acceptance criteria:** Course metadata/staff, section/lesson ordering, all lesson type forms, sanitized rich authoring, upload/scan polling, drip/prerequisite/cohort/live configuration and publish validation. Assessment editor links to P2-F-ASSESS routes rather than duplicating its forms. Optimistic conflicts show recovery UI; no accidental overwrite. TA flags reflected in actions and verified through API. Upload tests include rejected/oversized/pending files.

### P2-F-ASSESS — Instructor question bank and grading UI

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-F; live acceptance P2-B-ASSESS.
- **Owns:** `apps/web/src/features/assessment-authoring/**`, `apps/web/src/features/grading/**`, `apps/web/src/app/(dashboards)/instructor/{question-banks,assessments,grading}/**`.
- **Acceptance criteria:** All question types, version history, assessment fixed/pool/rubric/timing/feedback forms, publish feasibility errors, accommodations and manual grading queue. Rubric totals and file access are server-validated; regrade/void require reasons. Published versions never edit in place. Tests cover feedback permissions, stale grading updates and TA action restrictions.

## 6. Phase 3 — learner experience, engagement and reporting

### P3-B-LEARNING — Access evaluation and progress

- **Difficulty:** hard.
- **Depends on:** P1-S/P1-E, P2-B-CONTENT, P2-B-ASSESS; frozen shared contracts and database baseline.
- **Owns:** `apps/api/src/modules/learning/**`.
- **Acceptance criteria:** Concrete AccessPolicy, free/manual enrollment/grants, roster suspension/cohort moves, lesson availability/prerequisites/drip/expiry, bounded progress, effective assessment results and completion snapshot implement API.md. Commerce source grants can be created only through internal trusted commands; independent source access survives unrelated revocation. Tests use real transaction contention for seats and grants, and fake clocks for boundaries. Complete-once event and no client-awarded grades/certificates proven. Export idempotent grant/extend/revoke services for fulfillment.

### P3-B-ENGAGE — Certificates and notifications

- **Difficulty:** hard.
- **Depends on:** P1-C/P1-D/P1-S/P1-E; content/media contracts; learning event fixtures; live acceptance P3-B-LEARNING.
- **Owns:** `apps/api/src/modules/certificates/**`, `apps/api/src/modules/notifications/**`.
- **Acceptance criteria:** Template versions, idempotent issuance, private rendering/download and public minimal verification/revocation. In-app preferences/read states, mandatory transactional email classification, deduped delivery/retries and scheduled reminders work. Mailpit confirms real local SMTP delivery. Tests prove no duplicate certificate/mail under redelivery and no PII/key leakage in public verification or email payloads. Rendered PDF output is visually checked with a representative fixture.

### P3-B-ANALYTICS — Activity and reports

- **Difficulty:** hard.
- **Depends on:** P1-C/P1-D/P1-S/P1-E; learning/commerce event contracts; live report reconciliation P2-B-COMMERCE/P3-B-LEARNING.
- **Owns:** `apps/api/src/modules/analytics/**`.
- **Acceptance criteria:** Authorized bounded activity ingestion, idempotent dedupe/recomputation, daily progress/assessment reports and per-currency ledger-derived revenue. Report export jobs use documented ReportExport/OutboxEvent/Asset persistence and owner-bound polling. Tests reject spoofed authoritative event types, cross-course telemetry/exports, repeated aggregate increments and mixed-currency totals. Reports agree with seeded payments, refunds and grades.

### P3-F-LEARN — Protected player and assessment taking

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-F; live acceptance P2-B-CONTENT/P2-B-ASSESS/P3-B-LEARNING.
- **Owns:** `apps/web/src/features/player/**`, `apps/web/src/features/assessment-taking/**`, `apps/web/src/app/learn/[enrollmentId]/**`; not `app/learn/layout.tsx`.
- **Acceptance criteria:** Navigable outline/lock reasons, video/document/text/embed/live lessons, expiring-link renewal, progress heartbeats and all learner question types. Countdown derives from server deadline; no browser-authoritative extensions. Autosave, attachment polling, refresh/reconnect and idempotent submit preserve work; show grading/feedback release states without fetching author DTOs. Accessible controls, mobile layout and network failure tests. No answer keys bundled into learner fixtures/client code.

### P3-F-STUDENT — Student home, account and engagement

- **Difficulty:** medium.
- **Depends on:** P1-C, P1-F; live acceptance P1-S/P3-B-LEARNING/P3-B-ENGAGE/P3-B-ANALYTICS.
- **Owns:** `apps/web/src/features/student/**`, `apps/web/src/features/account/**`, `apps/web/src/features/notifications/**`, `apps/web/src/features/certificates/**`, `apps/web/src/app/(dashboards)/student/{page.tsx,enrollments/**,results/**,certificates/**,notifications/**,settings/**}`, `apps/web/src/app/(public)/verify/**`.
- **Acceptance criteria:** Student overview, continue learning, historical grades, valid/expired access, certificates/private download/public verification, unread notifications/preferences and account sessions/password UI. Preserve ownership and distinguish historical visibility from active course access. Empty/loading/error/mobile/accessibility coverage and logout cache clearing.

### P3-F-COMMERCE — Checkout, receipts and commerce administration

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-F; live acceptance P2-B-COMMERCE and P4-B-FULFILL for purchased access.
- **Owns:** `apps/web/src/features/commerce/**`, `apps/web/src/app/(public)/checkout/**`, `apps/web/src/app/(dashboards)/student/{orders,subscriptions}/**`, `apps/web/src/app/(dashboards)/admin/commerce/**`.
- **Acceptance criteria:** Server quotes/coupons/cohorts, Stripe redirect and persisted order polling with fulfillment-pending UX; own receipts/subscription cancel/resume/portal. Admin products/prices/coupons/orders/refund allocation views. Reuse idempotency keys; no redirect-based local access grants. Tests cover async payment, duplicate submission, coupon rejection, partial refund and awaiting enrollment.

### P3-F-ADMIN — Administration, roster and analytics screens

- **Difficulty:** hard.
- **Depends on:** P1-C, P1-F; live acceptance P1-S/P3-B-LEARNING/P3-B-ANALYTICS/P4-B-ADMIN.
- **Owns:** `apps/web/src/features/administration/**`, `apps/web/src/features/roster/**`, `apps/web/src/features/reporting/**`, `apps/web/src/app/(dashboards)/admin/{page.tsx,users/**,workspaces/**,members/**,audit/**,operations/**,analytics/**}`, `apps/web/src/app/(dashboards)/instructor/{page.tsx,learners/**,analytics/**}`.
- **Acceptance criteria:** Scoped admin/instructor dashboards, memberships/invites, roster/manual enrollment/grant changes, learner progress/assessment analytics, per-currency revenue, export polling and platform-only support screens. Dangerous state changes require clear intent/reason, appropriate permissions and visible server errors. Reports never expose other workspaces or privilege platform controls via a tenant role. Shared shell changes are requested from P1-F, not edited here.

## 7. Phase 4 — cross-domain fulfillment, administration and end-to-end validation

### P4-B-FULFILL — Trusted billing-to-learning orchestration

- **Difficulty:** hard.
- **Depends on:** P2-B-COMMERCE, P3-B-LEARNING, P1-E.
- **Owns:** `apps/api/src/modules/fulfillment/**`.
- **Acceptance criteria:** Trusted order paid, refund succeeded and subscription entitlement consumers create/extend/revoke only matching source grants from immutable snapshots. Per-event receipts and per-source unique keys make repeated events harmless. Reconciliation repairs missed grants/expiry without resetting progress. Tests prove standalone refund with surviving subscription access, overlapping bundle grants, renewal failure and paid-period cancellation, coupon/seat reservation conversion and webhook disorder. Provide module imports and periodic reconciler registration notes.

### P4-B-ADMIN — Administrative orchestration and operations projections

- **Difficulty:** hard.
- **Depends on:** P1-S/P1-E, P2-B-COMMERCE, P3-B-LEARNING/P3-B-ANALYTICS.
- **Owns:** `apps/api/src/modules/administration/**`.
- **Acceptance criteria:** Platform user/workspace suspension, scoped audit/operation views and safe replay endpoints. Call owning services instead of direct ledger/grade mutation. Suspension takes effect in content signing, access and auth; self-lockout and tenant-role escalation rejected. Replay never accepts replacement webhook bodies or ignores signatures/receipts. Tests cover platform/tenant isolation and redacted diagnostics.

### P4-QA — Cross-application regression scenarios

- **Difficulty:** hard.
- **Depends on:** P1-C fixtures; scenario authoring may run alongside feature packages; execution requires relevant modules plus P5-I wiring checkpoint.
- **Owns:** `tests/e2e/**`, `tests/security/**`, `tests/fixtures/**`, `tests/load/**`. Package/test runner dependencies requested from P5-I.
- **Acceptance criteria:** Executable browser/API scenarios for signup→purchase→grant→lesson→timed quiz→manual assignment→certificate, free/cohort/drip flows, TA grading and admin refunds. Include negative ownership/tenant cases, CSRF/refresh reuse, expired link/grant, duplicate/unordered webhook and worker-failure deadline behavior. Use deterministic clocks/fixtures where appropriate, isolated test databases/buckets and Stripe test fixtures; no real charges or unrelated containers. Report exact commands, failures and reproducible evidence; fix requests go to module owners, not edits across ownership boundaries.

## 8. Phase 5 — integration, release readiness and handoff

### P5-I — Single-writer integration and verification

- **Difficulty:** hard.
- **Depends on:** P0 and integration notes from every package; initial wiring checkpoints can run incrementally after corresponding owners hand off entrypoints.
- **Owns:** root/workspace manifests and lockfile, shared tooling/CI configuration, `.env.example`, Compose, `README.md`, `apps/api/src/{app.module.ts,main.ts}`, `apps/api/prisma.config.ts`, `apps/api/src/infrastructure/**`, `apps/api/src/config/**`, `apps/api/src/health/**`, `apps/api/src/modules/health/**`, `apps/api/src/workers/**` after explicit P1-E bootstrap handoff, API/web tool/test configuration, root `scripts/**`, `.github/**`, `docs/**`. Does not take feature directories or schema/migrations without a separate explicit handoff. P1-F retains shared frontend layouts/components during integration and implements navigation requests serially; after its closure P5-I may take those explicitly listed shared files.
- **Acceptance criteria:**
  - Resolve dependency/wiring requests, register explicit modules/worker processors/AccessPolicy provider, verify common raw-body/CSRF/guard/filter conventions and Swagger generation. Resolve remaining schema requests only through P1-D.
  - Fresh install→Compose→migrate→seed→API/web/worker boot is documented and verified on required ports. `.env.example` includes all JWT, refresh, CORS, database, queue, S3 public/internal endpoint, Stripe webhook/API version and SMTP settings without secrets.
  - `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and e2e/security suites pass; compare OpenAPI to frozen shared contracts. Meaningful authorization, payment, timing and replay tests must pass, not only smoke checks.
  - Confirm health, presigned browser upload/download with MinIO CORS/public hostname, Mailpit transactional email, Stripe test webhook replay, subscription/refund reconciliation, signed asset expiry and certificate rendering.
  - Measure representative catalog/player/assessment latency and query/queue behavior; document observed bottlenecks, baseline resource limits and DB connection budgets. Load tests use owned isolated services and bounded volume.
  - CI runs format/lint/typecheck/build/unit/integration, migration checks and contract drift checks. Deployment notes cover secrets, backup restore drill, expand/contract migration, queue drain, monitoring and rollback compatibility; no production deployment is assumed authorized by this plan.
  - Final reports identify completed packages, exact checks, residual limitations and any explicit deferred work. Do not mark the release gate passed while architectural security or ledger invariants remain unverified.

## 9. Required review scenarios by capability

| Capability | Minimum evidence | Responsible packages |
|---|---|---|
| Scaffold | All required ports boot; unrelated port 3000 unaffected | P0/P5-I |
| Tenant security | Forged workspace/course/asset/attempt IDs rejected; TA restrictions | P1-S, all backend owners, P4-QA |
| Content delivery | READY-only upload lifecycle; signed URL expires; grant/drip/prerequisite checks | P2-B-CONTENT/P3-B-LEARNING/P3-F-LEARN |
| Assessment history | Author edit leaves old grade stable; unique draw/open attempt; timed close without worker | P2-B-ASSESS/P4-QA |
| Manual grading | Assignment attachments/rubrics, final grade/regrade events, delayed feedback | P2-B-ASSESS/P2-F-ASSESS |
| Commerce | Server amounts; coupon/refund contention; duplicate/unordered webhook; subscriptions | P2-B-COMMERCE/P4-B-FULFILL/P4-QA |
| Access provenance | Independent grants survive unrelated refund; expiry/suspension respected | P3-B-LEARNING/P4-B-FULFILL |
| Events | Replay/crash/lease loss causes no duplicate business effects | P1-E and each consumer owner |
| Engagement | One certificate per completion; safe public verification; email dedupe | P3-B-ENGAGE/P3-F-STUDENT |
| Analytics | Dedupe/rebuild match authoritative records and per-currency financial totals | P3-B-ANALYTICS/P3-F-ADMIN |
| Integration | Shared schema/OpenAPI parity, full journey, restore/replay evidence | P1-C/P1-D/P4-QA/P5-I |

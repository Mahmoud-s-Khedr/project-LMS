# LMS architecture and implementation contract

## 1. Scope and fixed decisions

This is a greenfield course creation, learning, and commerce platform for independent instructors and optional academies. An academy is a business workspace, not a school, university, department, class, or academic year. The canonical requirements are `.orchestration/00-brief.md`. Implement only the design in this document and the companion `API.md`, `WORK_PLAN.md`, and Prisma schema; later changes require a coordinated contract/schema update.

| Layer | Decision |
|---|---|
| Runtime/tooling | Node 22, pnpm 10 workspaces, Turborepo, strict TypeScript in every package |
| API | NestJS 11 modular monolith; REST `/api/v1`; OpenAPI with `@nestjs/swagger` |
| Persistence | PostgreSQL 16, Prisma ORM; database is the durable source of truth |
| Jobs/cache | Redis + BullMQ; workers run as a separate process from the same API workspace |
| Assets | S3-compatible object storage; MinIO locally; private buckets and presigned URLs |
| Commerce | Stripe Checkout, Billing, verified webhooks; platform merchant initially, no instructor payouts/Connect |
| Mail | Nodemailer; Mailpit locally; provider SMTP in production |
| Web | Next.js 15 App Router, React 19, Tailwind CSS v4, shadcn/ui-style primitives |
| Web state/forms | TanStack Query; react-hook-form + zod; API over HTTP only |
| Shared contracts | `packages/shared` (`@lms/shared`): zod input/output schemas, inferred types, enums; never imports Prisma, Nest, or React |
| Local services | web 3100; API 4100; Postgres 55432→5432; Redis 56379→6379; MinIO 59000→9000 and 59001→9001; Mailpit UI 58025→8025, SMTP 51025→1025 |

Port 3000 belongs to another project. Docker Compose project name is `lms`; never stop unrelated services. Compose includes persistent volumes, health checks and private/public bucket initialization (`lms-private`, `lms-public`). Public storage is limited to deliberately published marketing assets.

Use stable Prisma 7.x with identical `prisma` and `@prisma/client` versions, `@prisma/adapter-pg` and `pg`. The schema intentionally has no datasource URL: the scaffolding owner supplies `apps/api/prisma.config.ts` and reads `DATABASE_URL` there. Do not select an npm prerelease merely because it has the `latest` tag. Generate the conventional `@prisma/client` via the schema's `prisma-client-js` generator. Exact dependency pins and lockfile belong to scaffolding/integration, not feature agents.

## 2. Repository and runtime boundaries

```text
apps/api/
  prisma/schema.prisma                 canonical database model, single writer
  prisma/migrations/                   reviewed SQL, single writer
  src/infrastructure/{prisma,queue,storage,mail}/
  src/common/                          guards, policy interfaces, errors, request context
  src/modules/<module>/                controllers, services, repositories, tests
  src/workers/                         worker bootstrap only; processors live with modules
apps/web/src/
  app/(public)/                        published catalog and marketing
  app/(auth)/                          authentication routes
  app/(dashboards)/{student,instructor,admin}/
  app/learn/                           learner player routes
  features/<area>/                     screens, hooks, query keys and forms
  components/ui/                      shared presentation primitives
  lib/api/                             HTTP transport, refresh coordination, errors
packages/shared/src/
  {auth,tenancy,catalog,content,assessments,learning,commerce,
   engagement,analytics,administration}/ contract directories
  roles.ts pagination.ts errors.ts index.ts
```

The API owns every authorization decision and business calculation. Next route handlers/server components may call the API, but never Prisma or Stripe directly. Browser authorization hiding is a UX aid only. Feature modules expose narrow service interfaces; no module reaches into another module's private repositories. Cross-module writes use exported command services in a shared Prisma transaction, or durable domain events when immediate consistency is unnecessary. Avoid circular Nest module imports; put cross-domain orchestration in `fulfillment` or `learning`, with policy interfaces in `common`.

The API and worker deployments share code, schema and configuration. HTTP handlers do bounded work; scans, mail, certificates, aggregates, webhook handling, AI adapters and reconciliation run in workers. A committed database outbox drives durable jobs; Redis loss must not lose business events.

### Backend module ownership

| Module / path under `src/modules` | Owns | Exports / boundary |
|---|---|---|
| `auth` / `users` | User identity/profile, Argon2id passwords, one-time tokens, refresh families | Authentication, session revocation; no workspace authorization in token claims alone |
| `tenancy` | Workspace, memberships, invitations | Workspace access and scoped roles; owner transfer; no course content writes |
| `catalog` | Course metadata, categories, course staffing, course prerequisite graph, publish workflow | Public catalog projection, course management policy |
| `content` | Sections, lessons, lesson prerequisites, asset associations, cohorts, releases, live sessions, attendance | Outline and lesson metadata; content-access policy consults learning |
| `media` | Asset upload verification, scan lifecycle, storage signing | Authorized upload/download capabilities; never returns raw storage secrets |
| `assessments` | Banks, questions/versions, assessment versions/pools, accommodations, attempts, answers, grading | Learner-safe delivery, authoritative results; never exposes answer keys before feedback policy permits |
| `learning` | Enrollment records, access grants, lesson progress, completion | Effective access evaluator, idempotent grant commands, completion evaluation |
| `commerce` | Products, prices, coupons, orders, payment/refund ledgers, subscriptions, Stripe inbox | Trusted billing state; no direct progress changes |
| `fulfillment` | Paid/refunded/subscription event orchestration | Calls learning grant commands; persists per-event receipts; does not own a second ledger |
| `certificates` | Template versions, issuance, verification, revocation | Completion consumer and private rendered files |
| `notifications` | In-app notifications, preferences, delivery records | Event-to-notification templates and Nodemailer jobs |
| `analytics` | Activity events, daily course metrics, authorized reports | Telemetry ingestion and deterministic recomputation |
| `events` | Outbox dispatcher, consumer receipts, retry/dead-letter management | Versioned event bus; no business rules |
| `audit` | Append-only audit records | Redacted security/domain auditing |
| `administration` | Platform/workspace administrative projections and actions | Calls owning modules for suspension, role changes, refunds and replay |
| `health` | Readiness/liveness | No business data; checks dependencies with bounded timeouts |

## 3. Identity, tenancy, roles and ownership

`User` is global. `Workspace` is mandatory for all course, learning, asset and commerce aggregates and has `PERSONAL` or `ACADEMY` kind. A personal workspace is the same tenancy boundary as an academy and initially belongs to its instructor. A student can buy from several workspaces without joining each as staff. `WorkspaceMember` grants workspace roles; `CourseStaff` assigns an instructor or TA to specific courses. Global identity/security OutboxEvent, Notification, NotificationDelivery, NotificationPreference, EventReceipt and AuditLog may have null workspaceId; this is an explicit system scope, not permission to omit tenancy on business data. All non-security domain events and learner notifications require a workspace. Every user has student/self-service capabilities; roles are additive by scope, not a numeric hierarchy.

`User.platformRole` accepts only `STUDENT` or `SUPER_ADMIN`; tenant `WorkspaceMember.role` accepts `ADMIN`, `INSTRUCTOR`, `TEACHING_ASSISTANT`, or `STUDENT`, never `SUPER_ADMIN`. Workspace creators receive an ADMIN membership. Their course instructor assignment is explicit. A CourseStaff user must have an active staff membership in that workspace; membership suspension immediately invalidates staff access. TA defaults: grade=true, edit=false, manageLearners=false. Course lead instructors can manage those flags; no flag authorizes pricing, refunds, membership administration or ownership transfer.

A workspace owner is a User with an active ADMIN membership. Ownership is singular, transferable by the owner or super-admin, and cannot be removed without transfer. Platform super-admin uses explicit, audited administrative actions; normal student content access still uses grants unless the request is an authorized staff preview. Instructor registration creates only a personal workspace with its owner ADMIN membership; it never assigns platform powers or membership in an existing workspace. Creating an academy is an authenticated owner workflow; joining an existing one requires an invitation or admin action.

Routes include workspace IDs for tenant resources. Resolve the workspace from the resource and constrain business queries by `workspaceId`, including background jobs. Global self-service/security records are instead constrained by authenticated recipient/actor ownership; only allowlisted identity event types may use null scope. Do not trust a header, JWT workspace hint, slug, or body ID as authorization. Composite workspace foreign keys prevent cross-workspace links. Return 404 for inaccessible tenant resources to reduce enumeration; 403 is reserved for a visible resource with a forbidden action.

### Permissions matrix

`Assigned` means CourseStaff or resource ownership plus active membership; `Self` means the authenticated learner owns the record and has any required access. Workspace admin scope never extends to other workspaces.

| Action | Super-admin | Workspace admin | Instructor | Teaching assistant | Student |
|---|---|---|---|---|---|
| Platform workspace/user administration | Yes, audited | No | No | No | No |
| Workspace settings, invitations, staff roles | Yes | Own workspace | No | No | No |
| Owner transfer | Yes | Owner only | No | No | No |
| Create course | Yes | Own workspace | Own workspace, becomes assigned lead | No | No |
| Edit course and lesson content | Yes | Own workspace | Assigned | Assigned + edit flag | No |
| Publish/archive course | Yes | Own workspace | Assigned instructor | No | No |
| Manage assigned course staff | Yes | Own workspace | Assigned instructor; cannot grant workspace admin | No | No |
| Author banks/questions/assessments | Yes | Own workspace | Owned bank or assigned course | Assigned + edit flag; no unrelated banks | No |
| Grade/regrade submissions | Yes | Own workspace | Assigned | Assigned + grade flag | No |
| Cohort roster/manual grants | Yes | Own workspace | Assigned | Assigned + manageLearners flag | No |
| Products/prices/coupons/refunds | Yes | Own workspace | No | No | No |
| View course learner analytics | Yes | Own workspace | Assigned | Assigned, scoped learner data | Own progress/results only |
| Buy/enroll, learn, submit attempts | Self | Self | Self | Self | Self |
| Own orders/subscriptions/session management | Self | Self | Self | Self | Self |
| Sign staff-preview asset URLs | Yes, audited | Own workspace | Assigned | Assigned + relevant flag | No |
| Sign learner asset/join URLs | Self | Self | Self | Self | Self, effective access required |
| Issue/revoke certificates | Yes | Own workspace | Assigned; revocation reason required | No | View own; public minimal verification |
| Read notifications/preferences | Self | Self | Self | Self | Self |
| Replay dead events/webhooks | Yes | Workspace events only, safe allowlist | No | No | No |

Banks are workspace resources with a creator. Instructors edit their own banks; admins edit any; course-specific TA access is granted only through assessment references on assigned courses. Creating an assessment cannot reference a bank the author cannot use. Audit sensitive reads, staff previews, role changes, manual grants, grades, financial actions and impersonation-like support actions. No impersonation endpoint is provided initially.

## 4. Domain model and lifecycle

### Aggregate map

| Aggregate | Main records / cardinality |
|---|---|
| Identity | User 1:N RefreshSession/AuthToken; Workspace (ACTIVE/SUSPENDED/ARCHIVED) 1:N WorkspaceMember/WorkspaceInvitation |
| Authoring | Workspace 1:N Course; Course N:M Category and staff; Course 1:N Section 1:N Lesson |
| Prerequisites | CoursePrerequisite and LessonPrerequisite directed acyclic edges |
| Files | Asset metadata; LessonAsset and AnswerAttachment associations; optional cover/recording/template/certificate assets |
| Delivery | Course 1:N Cohort; CohortLessonRelease overrides; Lesson 1:N LiveSession; Attendance per session/enrollment |
| Learning | User+Course unique Enrollment; Enrollment 1:N EnrollmentGrant and LessonProgress |
| Assessment | QuestionBank 1:N Question 1:N immutable QuestionVersion 1:N QuestionOption; Lesson 0:1 Assessment |
| Assessment delivery | Assessment 1:N AssessmentVersion; fixed AssessmentQuestion and AssessmentPool with frozen AssessmentPoolQuestion members |
| Attempt history | Assessment+Enrollment 1:N AssessmentAttempt; attempt 1:N AttemptQuestion; question 0:1 AttemptAnswer; answer 1:N attachments/GradeEvent |
| Selling | Product N:M Course; Product 1:N Price; Coupon N:M Product; Order 1:N OrderItem/Payment; OrderItem 1:N OrderItemCourse freezes course/cohort entitlements; CouponRedemption reserves usage |
| Billing | Workspace+User unique BillingCustomer; Subscription N:1 product/price; Payment links order and/or subscription; Refund 1:N RefundItem |
| Engagement | CertificateTemplate 1:N Certificate; Notification 1:N NotificationDelivery; NotificationPreference per user/type/channel |
| Operations | StripeWebhook inbox, OutboxEvent, EventReceipt, ActivityEvent, DailyCourseMetric, ReportExport, AuditLog, IdempotencyRecord |

UUID identifiers use PostgreSQL UUID columns; timestamps are UTC `timestamptz(3)` except metric day (`date`). API encodes all UUIDs as strings, timestamps as RFC 3339, Date-only values as `YYYY-MM-DD`, Decimal grades as decimal strings, and BigInt asset sizes/counts as digit strings. Money is integer minor units with lowercase ISO currency codes. UI uses the user's timezone and locale; course/cohort timezone governs display and authored scheduling only.

Mutable records have `createdAt`/`updatedAt`; retained entities have `deletedAt` or a domain archive/revoke state. Immutable facts have `createdAt` and no update timestamp. Actor attribution lives on roots (`createdBy`, `uploadedBy`, `grantedBy`, `requestedBy`, `gradedBy`) and transaction-bound AuditLog; do not fabricate creator IDs for automated actions. No hard-delete API exists for financial, grade, enrollment, certificate or audit history. Ordinary DELETE archives/soft-deletes authoring resources. Tombstoned slugs/emails remain reserved; deliberate anonymization releases personal identity through a new non-deliverable address, never silently reuses it.

### Course and content

Course state: `DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`; authorized publishers may publish directly from DRAFT. Unpublish moves to DRAFT only when policy allows; paid learners retain the last accessible content until an explicit admin suspension. Archiving removes new catalog sales but preserves existing learner delivery and history. Publishing requires a title, at least one required lesson, a valid outline, ready linked assets, valid assessment versions, no prerequisite cycles, usable product/free enrollment configuration, and tenant-consistent cohort settings. Public catalog includes only PUBLISHED, PUBLIC, non-deleted courses. UNLISTED is accessible by direct link; PRIVATE requires invitation/manual grant and is never cataloged. Product visibility cannot reveal a private course's protected content.

Sections and lessons use integer positions scoped to parent. Reorder the entire sibling set in a transaction using temporary negative positions, then final positions; enforce nonnegative positions at transaction commit via service validation rather than a nondeferrable SQL check that would block this technique. Optimistic `version` concurrency prevents lost authoring updates. DELETE soft-deletes only unused drafts/sections/lessons. Return 409 when retained attempts or a started enrollment policySnapshot references the resource; an explicit archive workflow must preserve delivery of required material. Course archive changes status without setting deletedAt and cannot strand active attempts. Required lessons already available to learners cannot be removed/retyped without a reviewed migration; edits never invalidate existing completion or issued certificates automatically.

| Lesson type | Payload / related data | Completion |
|---|---|---|
| VIDEO | Ready private LessonAsset (`purpose=PRIMARY_VIDEO`), duration metadata, optional captions/resources | Server-validated watch threshold or explicit configured acknowledgment |
| DOCUMENT | Ready private PRIMARY_DOCUMENT asset, resources | View or acknowledgment |
| TEXT | Sanitized structured rich content in `body` | Acknowledgment |
| INTERACTIVE | Allowlisted HTTPS embed URL and sandbox options in `body` | Acknowledgment; signed provider completion adapter later |
| QUIZ | Assessment kind QUIZ + published version | Passing finalized grade |
| ASSIGNMENT | Assessment kind ASSIGNMENT, rubric, text/file answers | Manual or configured automatic passing grade |
| EXAM | Assessment kind EXAM; strict attempt/time/release policies | Passing finalized grade |
| LIVE_SESSION | LiveSession metadata, optional cohort, protected meeting links and recording | Verified attendance threshold or acknowledgment policy |

Asset association purposes and lesson body variants are discriminated zod schemas. `body` never holds presigned URLs, arbitrary scripts, answer keys or provider host secrets. Text/rich content is rendered through a strict sanitizer. Embed providers use a server allowlist and constrained iframe permissions; arbitrary HTML is not accepted. One LIVE_SESSION lesson may have several sessions (e.g. cohort-specific repetitions); its policy defines the qualifying session. Host URLs are encrypted at rest and staff-only. Recordings inherit the lesson access rules.

### Assessments and question banks

Supported question types: single choice, multiple choice, true/false, short answer, numeric, essay, file upload, matching and ordering. `QuestionVersion.prompt`, options and explanation use structured sanitized rich content. `answerKey` contains accepted option keys/pairs/order, normalized strings or numeric tolerance; `gradingConfig` selects case sensitivity, partial credit and normalization. Essay/file upload are manually graded. Multiple choice partial credit must never award a negative score or more than the configured points. Matching/ordering use stable option keys. Store only JSON validated by the shared discriminated schemas; JSON is not an untyped escape hatch.

The shared assessment schemas use these concrete response/key shapes. The `type` discriminator must match the stored QuestionVersion.type. Stable keys reference that version's QuestionOption rows, not array offsets.

| Type | Learner `response` example | Private `answerKey` / scoring |
|---|---|---|
| SINGLE_CHOICE | `{type:"SINGLE_CHOICE",optionKey:"a"}` | `{correctOptionKeys:["a"]}`; exact match |
| MULTIPLE_CHOICE | `{type:"MULTIPLE_CHOICE",optionKeys:["a","c"]}` | `{correctOptionKeys:["a","c"]}`; default all-or-nothing; explicit bounded partial-credit config |
| TRUE_FALSE | `{type:"TRUE_FALSE",value:true}` | `{value:true}` |
| SHORT_ANSWER | `{type:"SHORT_ANSWER",text:"..."}` | `{accepted:["..."]}` with normalization config |
| NUMERIC | `{type:"NUMERIC",value:"12.50"}` | `{value:"12.5",absoluteTolerance:"0.01"}`; decimal-safe comparison |
| ESSAY | `{type:"ESSAY",document:{...}}` | `{}`; sanitized rich document, manual rubric |
| FILE_UPLOAD | `{type:"FILE_UPLOAD",note:"..."}` plus AnswerAttachment IDs | `{}`; required ready file(s), manual rubric |
| MATCHING | `{type:"MATCHING",pairs:[{leftKey:"l1",rightKey:"r2"}]}` | `{pairs:[...]}`; stable left/right option groups, bounded partial credit |
| ORDERING | `{type:"ORDERING",optionKeys:["b","a","c"]}` | `{optionKeys:["b","a","c"]}`; default exact sequence |

Rubric JSON is `{criteria:[{id,label,description?,maxPoints}]}` with nonnegative decimal-string points and unique criterion IDs; GradeEvent.rubricScores references those IDs. Matching options include a validated left/right group in their structured content. AttachmentIds belong to the answer request envelope and are normalized into AnswerAttachment, not duplicated into unvalidated response JSON. Draft versions can omit an answer; submitted required items cannot. Payload bounds, allowed file types and maximum files are explicit shared config, defaulting to 10 MiB per submission file and at most 5 files unless an assessment sets a stricter maxUploadBytes/maxFiles limit. Submission MIME types default to PDF, plain text, JPEG and PNG; scripts/HTML/executables/archives are rejected unless a reviewed sandboxed processing policy is added.

Question edits create new versions. Assessment draft versions can change; published/retired versions and all referenced options, fixed selections and pool memberships are immutable. A published assessment must have at least one item and strictly positive total points. On publish, freeze eligible QuestionVersion IDs into AssessmentPoolQuestion and verify enough unique questions exist. A question cannot appear twice in one attempt, including overlaps between fixed lists/pools; publish must prove a feasible draw and attempt creation draws without replacement. Do not delete a referenced version. Question deletion removes it from future authoring, not existing published versions or attempts.

Attempt creation locks the learner's assessment/enrollment scope, validates grant, prerequisites, time window, limits and accommodation, resolves the current published version, creates a cryptographically generated server seed and snapshots question IDs, order, option order, points and policy. AttemptQuestion holds learner-visible snapshots; privileged grading uses immutable QuestionVersion.answerKey. `deliverySnapshot` captures timing, rubric, feedback, penalties and version rules. AFTER_DUE requires a dueAt at publish. Assignment versions require at least one ESSAY or FILE_UPLOAD item (or a mixed set with those items), with rubric criterion maxima reconciling to the frozen total. Do not return the seed or grading configuration to students. Draft/pool IDs never let a learner request arbitrary questions.

Limits count across assessment versions. At most one IN_PROGRESS attempt per assessment/enrollment. `deadlineAt = min(start + timeLimit + extraTime, effective availableUntil)` where absent terms are ignored; `dueAt` marks late work, while `availableUntil` is a hard cutoff. An accommodation can extend the hard cutoff explicitly. At the deadline, a worker submits saved responses with a compare-and-set; every answer/submit endpoint also checks server time so worker delays cannot extend an exam. `allowLateSubmission` permits work after dueAt only until the hard cutoff. Late penalty applies to finalized total, bounded at zero. Availability changes do not shorten a started attempt's frozen deadline except an explicit audited void/suspension action.

Answers autosave with optimistic answer version while attempt is IN_PROGRESS and server time allows. Attachment size/type and ready/clean status are verified before submission. Submit is idempotent: `IN_PROGRESS → SUBMITTED → GRADING → GRADED`; fully objective work may finalize immediately. `VOID` requires a reason and preserves evidence; it does not consume an attempt limit. Manual graders record rubric points, feedback and append-only GradeEvent. Overall grades are derived from answer points (or an assignment-level rubric), never accepted as authoritative from clients. Publish final grades atomically with total, percent and passed. Regrading appends an event and updates the projection, then emits result.changed; completion recalculation does not silently revoke certificates. Manual certificate review is required if eligibility disappears.

Effective result policy is HIGHEST/LATEST/FIRST among nonvoid finalized attempts, with FIRST/LATEST ordered by attempt.number and ties for HIGHEST resolved by the latest number; attempts awaiting manual grading never mark completion. FeedbackPolicy controls when score, explanations and solutions become visible: immediate on finalization, after dueAt, after grading, or never. Short answers/objective auto-grading can complete synchronously, while API serialization must still apply the feedback policy. Attempt DTOs omit correctness, score and solutions until release. Answer upload and grading URLs require the submitting learner or an authorized course grader.

### Enrollment, schedules and access

Enrollment is unique per learner/course and retains lifetime progress. EnrollmentGrant is the provenance of access: FREE, MANUAL, ORDER_ITEM or SUBSCRIPTION. Effective access requires active user/workspace/course policy, Enrollment.status ACTIVE, and at least one unrevoked grant with `startsAt <= now` and `expiresAt > now` (null expiry is unlimited). Revoking/refunding a grant affects only that source. Manual suspension on Enrollment overrides all grants. Natural expiry is computed from grant time, not a stale status cache.

Manual grants require course staff permission, an explicit reason, dates and an audited grantor. A free self-enrollment endpoint exists only for isFree courses and cannot bypass PRIVATE/cohort restrictions. Paid access comes only from confirmed billing events. Purchase does not require course prerequisites to be complete; starting protected learning does. Prerequisite satisfaction checks completed prior courses and minimumPercent, plus required lesson completion; graphs must be acyclic, same workspace, with lesson prerequisites in the same course.

SELF_PACED has no cohort. COHORT enrollments require a published cohort of the same course; enforce enrollment windows/capacity under a row lock. Reserve scarce paid cohort capacity using OrderItemCourse rows on pending unexpired orders under the same cohort lock; expire reservations with orders. Manual admins may override a closed window with a reason but cannot exceed capacity silently. Moving cohort preserves progress, recalculates future release times and requires an audited admin/staff command; active attempts retain frozen deadlines.

Lesson availability is the intersection of course access, lesson publication, prerequisites and release window:

1. CohortLessonRelease override takes precedence if present.
2. Otherwise ReleaseType chooses immediate, absolute releaseAt, enrolledAt + offsetDays, or cohort.startsAt + offsetDays.
3. availableUntil closes access to the lesson; optional cohort endsAt and grant expiry are outer access bounds.
4. No cohort offset is allowed on a self-paced course. A required lesson must have a satisfiable release/completion path before publish.

Preview lessons may expose only deliberately approved content through dedicated preview endpoints; they cannot enable protected quizzes, graded submissions, other assets or live host/join URLs. Expired learners may view their own historical receipts, results and certificates, but cannot start/resume learning or download protected course files. Staff previews use a separate explicit policy and never create learner progress.

LessonProgress is a projection; bounded watch heartbeats are deduped via activity event IDs, cannot jump farther than plausible elapsed playback, and cannot award assessment pass/attendance. Required lesson completion determines completionPercent; the enrollment policySnapshot freezes required lesson IDs and criteria when learning starts. Later optional additions do not dilute completion. Finalization runs transactionally, stamps completedAt once and emits course.completed once. Retain completedAt even after access expiry. Re-enrollment extends grants rather than creating another enrollment or erasing progress.

### Commerce and billing

A COURSE product contains exactly one course, a BUNDLE one or more, and a SUBSCRIPTION_PLAN one or more. All courses/products in a checkout belong to one workspace and one currency. Prices are immutable after use; replacement prices retire old ones. Subscription prices have MONTH/YEAR interval, intervalCount, optional trialDays; one-time prices have no interval. A checkout contains either one plan or one/more one-time items, quantity always one per product; duplicate products and mixed subscription/one-time baskets are rejected. No platform revenue sharing, tax engine, marketplace payouts or multi-currency conversion is assumed. Stripe-collected taxes are preserved in order snapshots; launch tax configuration is an explicit commerce deployment decision.

The server resolves current prices, eligibility, cohort reservations and coupons, and creates a PENDING order with immutable item/product/course entitlement snapshots and OrderItemCourse rows. Each cohort-based course in an item requires a selected same-course cohort; a bundle can therefore reserve seats in several cohorts. Cohort selectors can only name courses already in the resolved product. The Subscription entitlement snapshot preserves the same selection for renewals; cohort changes require the explicit audited enrollment transfer workflow. `grandTotal = subtotal - discountTotal + taxTotal`; line totals reconcile exactly using deterministic minor-unit rounding. Order status is PENDING→PAID, CANCELED or EXPIRED; paid orders can become PARTIALLY_REFUNDED or REFUNDED. A zero-total confirmed free checkout is fulfilled through the same trusted server command without pretending a Stripe charge exists. Checkout redirect success alone never grants access.

Coupons are normalized uppercase; percent or fixed amount, never both. A fixed coupon has currency, optional eligible-product set, validity window, minimum subtotal, global/per-user limit. Empty CouponProduct means all eligible workspace products. Reserve usage in CouponRedemption under a lock before creating Stripe Checkout; count active reservations plus successful redemptions. Release failed/expired reservations. Coupons apply once to the initial checkout invoice; recurring discounts are outside initial scope. Never increment a naked counter without reconciliation or accept client-calculated discounts.

Stripe requests use stable idempotency keys derived from internal operations. Verify webhook signature against the exact raw body and correct endpoint secret before storing; reject bad signatures. Persist unique StripeWebhook.stripeEventId then acknowledge promptly, and process asynchronously. Stripe documents retries and unordered delivery, so handlers must be idempotent and retrieve current authoritative objects when events conflict ([Stripe webhook guidance](https://docs.stripe.com/webhooks)). Resolve workspace/user using persisted Stripe ID mappings and validate metadata against them; never grant arbitrary IDs from metadata alone.

Record Payment for every payment intent/invoice, including renewals. Reconcile `checkout.session.completed`, async payment success/failure, invoice paid/payment failed, subscription create/update/delete, and refund updates against current Stripe state; exact SDK event types belong to a pinned Stripe API version and fixtures. Paid one-time orders emit order.paid; fulfillment creates sourceKey `order-item:<itemId>:course:<courseId>` grants from frozen entitlementSnapshot/OrderItemCourse rows. One-time grants start at confirmed paidAt (not delayed worker execution), with expiry paidAt + frozen accessDurationDays when configured; subscription grants use the confirmed trial/paid period bounds. Refund request status is PENDING until Stripe confirmation. Concurrent refund requests lock the Payment; pending + successful refunds cannot exceed captured amount. Allocate per-order-item RefundItem amounts with an explicit revokeAccess decision. Subscription-payment refunds have no OrderItems and must explicitly choose whether to revoke/suspend the corresponding subscription grants. A partial financial refund does not imply every grant should be revoked.

Subscriptions map Stripe states to local SubscriptionStatus. ACTIVE/TRIALING grants expire at the confirmed period/trial end. Renewal extends the same subscription source grants. PAST_DUE allows only already paid time (no implicit grace extension); UNPAID/PAUSED/INCOMPLETE/EXPIRED do not extend. Cancellation at period end preserves paid access until periodEnd; immediate cancellation expires/revokes at Stripe's effective termination time. Frozen plan course membership applies for a subscription's lifetime; new plan offerings affect new subscriptions, and existing changes require an explicit migration. Recovery/reconciliation jobs compare pending orders, refund states and subscriptions with Stripe, healing missed events without duplicate grants or mail.

## 5. Secure content and authentication

### Authentication flow

Verification tokens expire after 24 hours, password reset tokens after 30 minutes, and workspace invitation tokens after 7 days. AuthToken/WorkspaceInvitation persist only verifier hashes; consumption is atomic and single-use. To deliver a generated one-time link durably, its mail-only capability payload is envelope-encrypted before entering the outbox, with key ID and expiry. Only the mail worker decrypts it; never copy it to in-app Notification.data, logs, analytics or general event subscribers, and purge encrypted capability material after delivery/expiry.

Use Argon2id password hashes with deployment-benchmarked memory/time parameters, generic login/recovery responses, rate limits and verified email before payment/graded submissions. JWT access lifetime: 10 minutes, explicit issuer/audience, allowlisted algorithm, key rotation and token ID. Refresh lifetime: fixed 30-day family deadline; rotation does not extend it. JWT claims contain subject/session family and minimal platform role hints, never trusted tenant membership snapshots. Suspended users/families are rejected through a bounded cache backed by current database state.

Access tokens live in memory, not localStorage. Store only a hash of a cryptographically random 256-bit refresh token. Rotation atomically consumes the old RefreshSession and creates one child under a lock. An already consumed token is reuse: revoke its entire family, clear cookie, require login and audit. Browser tabs coordinate refresh with Web Locks/BroadcastChannel and the client dedupes refresh promises; otherwise racing refreshes would trigger deliberate reuse detection. Logout revokes the family; logout-all/password reset revokes all families. Expired sessions/tokens are pruned after the replay-detection retention window.

Refresh cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`, path `/api/v1/auth`, host-only, name `lms_refresh`; local HTTP disables Secure only. API and web deploy under the same site; cross-site deployments require a reviewed SameSite=None and CSRF setup. Credentialed CORS allowlists exact origins, never `*`. Refresh/logout/login cookie-changing POSTs require a same-origin/allowlisted Origin check and `X-CSRF-Token` double-submit token issued by `GET /auth/csrf`; reject missing or mismatched tokens. SSR forwards only explicit cookies to the trusted API, never request headers wholesale. Client retries at most once after refresh and never loops; mutating retry requires an idempotency key.

### Asset delivery

1. Staff or authorized submitting learner requests an upload for a declared purpose, workspace/resource, size, MIME and checksum. API validates scope/quota and creates a PENDING_UPLOAD asset with a generated object key.
2. Return a short (5 minute) presigned PUT or constrained POST into a quarantine/private prefix. Do not accept arbitrary bucket or object keys. Validate actual size, sniffed MIME and checksum via HEAD/scan after completion; presigned PUT alone cannot enforce every declared bound.
3. Upload completion moves to SCANNING. BullMQ scan/transcode process marks READY or REJECTED; assets are unusable before READY. Expired abandoned uploads are removed by a reconciler and lifecycle policy.
4. A download request resolves the LessonAsset, recording, answer attachment or certificate relationship and validates current workspace, ownership, grant, drip and prerequisite rules. Student assets are authorized through their specific resource association; uploadedBy is insufficient.
5. Return a 60-second presigned GET and expiry timestamp, `Cache-Control: private, no-store` for capability responses. Use safe Content-Disposition. Throttle signing and never log query signatures. Public covers must be an approved PUBLIC asset variant, not a moved private object.

Signed URLs are bearer capabilities and cannot prevent screen capture or sharing during their TTL. Revocation blocks future signatures; already issued links remain valid for their short lifetime. For segmented video, sign every private segment through a validated playlist/token gateway; signing a manifest alone cannot protect public segments. Initial implementation can use progressive MP4 with Range support. Multi-GB streaming/transcoding stays outside API request memory. SSRF protections apply to remote embeds/media metadata and all future fetchers.

## 6. Certificates, notifications and analytics

Certificate eligibility is server-confirmed completion with finalized passing grades for required assessments. Template versions freeze layout and issuer details. Idempotent issuance is unique per enrollment; the certificate snapshots recipient, course and template, generates a cryptographically unguessable verification code, and renders a private PDF via a job. Public verification returns validity, course title, issuer, issue date and a masked recipient name; no email, full profile, or file URL. Staff revocation requires a reason; verification shows revoked without exposing private reason. Re-render/reissue updates the same record through an audited command and retains history in AuditLog and object versioning. Expired access does not remove earned certificates.

Notification templates subscribe to enrollment, course release, live reminder, assessment submitted/graded, order paid/refunded, subscription payment failures and certificate issued. Insert Notification and per-channel NotificationDelivery once using stable dedupe keys. In-app notifications are scoped to the recipient; email preferences can suppress optional messages, while security and transactional mail bypass opt-out under explicit template classification. Retry with exponential backoff and provider message IDs; sanitize deep links to application routes and exclude secrets/answer keys from payloads. Keep email provider calls outside domain transactions.

ActivityEvent accepts an allowlist of client events (lesson viewed/playback heartbeat/navigation), validated bounded payloads and an eventId for dedupe. Actor and workspace derive from auth/resource access. Server emits authoritative attempt/grade/payment/completion events; a client cannot supply them. occurredAt is bounded against server receivedAt to limit spoofed time. Analytics aggregates run by workspace UTC day with idempotent recomputation, not repeated increments; business dashboards localize display. Revenue reports aggregate successful payments minus confirmed refunds per currency from ledgers, never sum incompatible currencies or trust client telemetry. Staff dashboards show only authorized course learners; students get their own progress. Paginated CSV exports run asynchronously with the same authorization and short-lived private download capabilities. ReportExport persists requester, validated report parameters, lease/status/error, expiry and the resulting private Asset. Workers transition PENDING→PROCESSING→READY/FAILED, recover expired leases, and mark EXPIRED after 24 hours; polling and signing recheck current requester/admin scope. Outbox status alone is not export completion.

## 7. Events, AI extension points and reliability

Insert OutboxEvent in the same transaction as each externally observable state change. Envelope: `id`, nullable `workspaceId` (global security types only), `type`, `schemaVersion`, `aggregateType`, `aggregateId`, monotonically allocated sequence, timestamp and validated payload. Sequence is ordering metadata, not a gap-free business identifier. Event types include `course.published.v1`, `order.paid.v1`, `refund.succeeded.v1`, `subscription.entitlements.changed.v1`, `enrollment.granted.v1`, `lesson.completed.v1`, `assessment.submitted.v1`, `assessment.graded.v1`, `assessment.result.changed.v1`, `course.completed.v1`, `certificate.issued.v1`.

Dispatcher leases rows with `FOR UPDATE SKIP LOCKED`, publishes stable BullMQ job IDs, then marks PUBLISHED. Crash between publish and marking can redeliver; all consumers transactionally insert EventReceipt(eventId, consumer) with their side effects. EventReceipt has a required event FK and must copy its exact nullable workspace scope; notification deliveries likewise copy their notification scope. Global auth messages can be queued durably before workspace creation, without fabricating a tenant. Do not treat queue job uniqueness as exactly-once processing. Retry transient failures with jitter, lease expiry and bounded attempts; DEAD rows retain error metadata and support audited replay. Failed independent consumers do not prevent other consumers' receipts. Schedule expiry/reminder jobs with stable business keys and backstop database scans; workers verify current state when executing stale delayed jobs.

AI hooks are opt-in event consumers and provider interfaces for draft question generation, content suggestions, feedback assistance, semantic search and tutoring. Store accepted output through existing authoring/assessment services and require human approval for published content or grades. No AI service receives raw password/token/payment data or unconsented learner submissions. AI is not in the synchronous authorization or grade-of-record path. Future adapter packages can add provider configuration, consent and provenance via reviewed migrations; no speculative generic EAV tables are required now.

## 8. Database invariants and migration requirements

The Prisma schema defines concrete models, composite tenant FKs, uniqueness, typed enums, indexes and delete behavior. Most relations use Restrict: archive aggregates instead of cascading business evidence. PostgreSQL indexes referenced by composite FKs are intentional even when UUID IDs are globally unique. Prisma referential actions map to database FK behavior ([Prisma documentation](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions)); generated migrations must be reviewed before deployment.

Prisma does not express every CHECK, expression or partial index. The single database/migration owner MUST add the following in the initial SQL migration before production acceptance. They are part of the data model, not optional future work:

| Constraint group | Required enforcement |
|---|---|
| Role scopes | User.platformRole IN (STUDENT,SUPER_ADMIN); WorkspaceMember/Invitation role != SUPER_ADMIN; service enforces staff-role suitability and active owner membership |
| Identity normalization | `CHECK (email = lower(btrim(email)))`; unique email already exists. Coupon code uppercase/trimmed; workspace/course/product slugs canonical lowercase |
| Numeric ranges | Nonnegative prices, line/payment/refund/tax/discount amounts; positive refund amount; quantity=1; scores/points nonnegative; percentages in 0..100; attempts/counts/time limits/intervalCount/capacity positive; offsets/durations/extraTime/extraAttempts nonnegative; file sizes positive and <= configured quota |
| Money equations | Order subtotal-discountTotal+taxTotal=grandTotal, discountTotal<=subtotal; OrderItem unitAmount*quantity-discountAmount+taxAmount=totalAmount; currency matches lowercase three-letter syntax |
| Temporal ranges | endsAt>startsAt; expiresAt>startsAt; enrollment/release/assessment/coupon windows ordered when both bounds exist; trial/period ends after starts; fixed refresh family expiry copied on child |
| Discriminated nullable columns | Coupon percent vs fixed fields XOR (fixed requires currency); Price interval null for one-time and nonnull for plans (cross-table validation in service); ReleaseType matching releaseAt/offset fields; source-specific EnrollmentGrant links XOR; MANUAL requires grantor/reason and SUBSCRIPTION requires a finite expiry; Payment at least one order/subscription |
| Self links | CoursePrerequisite.courseId != requiredCourseId; LessonPrerequisite.lessonId != requiredLessonId; refresh parentId != id |
| Attempt exclusivity | Partial unique index on `(assessmentId,enrollmentId)` WHERE status='IN_PROGRESS'; same-course composite links already exist |
| Published-version integrity | Partial unique index on AssessmentVersion(assessmentId) WHERE status='PUBLISHED'; currentPublishedVersion must resolve to that version, enforced in publish transaction |
| Global scope | NotificationPreference needs a unique `(userId,type,channel)` partial index WHERE workspaceId IS NULL; the existing tenant unique covers nonnull scopes. Services require notification/delivery/receipt scope equality and allow null event scope only for explicit identity/security types |
| Scheduled job throughput | Partial indexes on pending OutboxEvent availability and pending StripeWebhook; prune/partition ActivityEvent when volume merits it |

Example SQL (actual migration must cover the complete table above):

```sql
CREATE UNIQUE INDEX "one_open_attempt_per_assessment_enrollment"
ON "AssessmentAttempt" ("assessmentId", "enrollmentId")
WHERE "status" = 'IN_PROGRESS';
CREATE UNIQUE INDEX "one_published_assessment_version"
ON "AssessmentVersion" ("assessmentId") WHERE "status" = 'PUBLISHED';
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "grant_source_shape" CHECK (
  ("source" = 'ORDER_ITEM' AND "orderItemId" IS NOT NULL AND "subscriptionId" IS NULL)
  OR ("source" = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL AND "orderItemId" IS NULL)
  OR ("source" IN ('FREE','MANUAL') AND "orderItemId" IS NULL AND "subscriptionId" IS NULL)
);
```

Workspace suspension is a typed `Workspace.status` / `suspendedAt` policy, not an unvalidated settings key. Every access policy rejects SUSPENDED workspaces; ARCHIVED workspaces stop new business and preserve existing history under explicit staff policy.

Cross-row invariants belong to exported command services under a transaction with row locks or SERIALIZABLE isolation plus bounded serialization retries: graph acyclicity, owner membership, source order/subscription learner matching, cohort capacity, price/product type/currency matching, OrderItemCourse rows and entitlementSnapshot agreeing with product membership at checkout, item sums equaling order totals, refund allocations/cumulative limits, coupon usage, pool feasibility, answer point bounds, same-course certificate template/enrollment, template version immutability, active course staff and source provenance. Never assume zod alone enforces concurrent invariants. Integration tests must attempt tenant-crossing and concurrent violations. DB errors map to stable API conflict codes, never raw Prisma output.

## 9. Security, scaling and operations

- Validate every request and serialize responses with shared zod contracts; never expose Prisma records wholesale. Generate Swagger DTO metadata from these schemas or tested adapters; do not maintain divergent handwritten validators. OpenAPI generation uses Nest's Swagger integration ([NestJS documentation](https://docs.nestjs.com/openapi/introduction)).
- Enforce authentication, workspace role and resource ownership per endpoint AND in service commands used by jobs. Deny by default. Add negative authorization tests for every resource family.
- Apply Helmet, request/body limits, rate limiting for auth/signing/checkout/attempt APIs, safe rich-text rendering, CSP and HTTPS. Secrets live outside git; redact cookies, Authorization, signed URLs, Stripe secrets, tokens and answer keys from logs.
- Centralize request IDs, structured logs, metrics and tracing across outbox→queue→worker. Monitor queue lag, outbox age, webhook failures, auth reuse, signing errors, payment reconciliation mismatch and slow SQL.
- Readiness checks database/Redis dependencies; liveness avoids costly dependency checks. Shutdown stops accepting traffic, drains jobs and disconnects Prisma/Redis cleanly.
- Horizontal API scaling uses stateless JWT validation plus durable session revocation checks; no process-local authorization state. Use PostgreSQL connection pooling with explicit per-process budgets and bounded transactions. Redis is a cache/queue, never the only ledger.
- Cache only public catalog projections by workspace/version. Personalized progress, grades and signing endpoints use private/no-store. Authorization caches have short bounded TTLs plus invalidation; never cache grant validity past expiry.
- Use cursor pagination, selective composite indexes and explicit relation selection. Watch event-table growth; introduce time partitions and aggregate/read replicas based on measured load. Export analytics through jobs instead of large request-time joins.
- Back up Postgres with tested point-in-time recovery; retain/version private objects; exercise restoration and outbox replay. Deploy expand/backfill/contract migrations compatible with in-flight jobs and rolling releases.
- Initial retention defaults: one-time auth tokens 7 days after expiry, refresh evidence 7 days after family expiry, idempotency responses 24 hours, raw webhook payloads 90 days, client activity 180 days, delivery logs 90 days. Keep ledger/grade/certificate/audit retention configurable by deployment obligations; do not delete financial evidence on user deletion. Anonymization removes optional PII and hashes while preserving required accounting/grade provenance.

## 10. Definition of architectural completion

Implementation is ready only when shared contracts, OpenAPI and web usage agree; tenant-crossing and ownership tests pass; expired/revoked grants cannot sign content; refresh replay revokes a family; timed exams close under worker failure; manual grading and historical snapshots survive author edits; duplicate/unordered webhooks produce one financial effect and correct grants; partial refunds preserve unrelated access; and setup boots the API/web on the required ports. `WORK_PLAN.md` assigns ownership and verification gates for these outcomes.

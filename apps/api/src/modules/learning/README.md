# Learning module (P3-B-LEARNING)

Access evaluation, enrollment/grants, bounded progress and server-derived completion.

## AccessPolicy

`LearningAccessModule` (`@Global`, imported by `LearningModule`) provides `LearnerAccessPolicy` under
`Symbol.for('lms.learning.AccessPolicy')`. Content, media and assessments resolve that token optionally; once
`LearningModule` is imported anywhere in the app they stop returning their fail-closed 503. It is read-only and
depends only on persistence, so `AssessmentsModule` can consume it with no import cycle.

Decision order: enrollment ownership/tenant → user, workspace, course state → enrollment status (SUSPENDED/REVOKED)
→ grants (`startsAt <= at < expiresAt`, not revoked) → cohort end → (lesson) publication → course prerequisites →
release window (drip, UTC-day offsets via content's `releaseWindow`) → lesson prerequisites. Pure functions live in
`availability.ts` and are tested with explicit instants.

## Trusted commands for fulfillment (P4-B-FULFILL)

Inject `EnrollmentGrantService` (exported by `LearningModule`). None of these are reachable over HTTP.

```ts
// order.paid.v1 — one call per OrderItemCourse row (or grantManyFromCommerce for a bundle)
await grants.grantFromCommerce({
  workspaceId, userId, courseId,
  source: 'ORDER_ITEM', orderItemId,
  sourceKey: `order-item:${orderItemId}:course:${courseId}`,
  startsAt: order.paidAt, expiresAt: paidAt + accessDurationDays | null,
}, tx?);            // returns { enrollmentId, grantId, created, enrollmentCreated, cohortMismatch }

// subscription.entitlements.changed.v1
await grants.grantFromCommerce({ source: 'SUBSCRIPTION', subscriptionId, sourceKey: `subscription:${id}:course:${courseId}`, expiresAt: periodEnd, ... });
await grants.extendGrant({ workspaceId, subscriptionId }, newPeriodEnd, undefined, tx?);   // monotonic renewal
await grants.revokeGrants({ workspaceId, subscriptionId }, 'canceled', undefined, effectiveAt, tx?);

// refund.succeeded.v1 with revokeAccess=true for an item
await grants.revokeGrants({ workspaceId, orderItemId }, 'refund', undefined, undefined, tx?);
```

Guarantees: replays are no-ops (`created:false`, no extra event, a revoked grant is never resurrected, expiry never
moves backwards); provenance is verified (order item/subscription belongs to the learner and entitles the course);
cohort seats are taken under the cohort row lock, consuming the order's own reservation; an enrollment is reused
(re-enrollment extends grants); pass `tx` to commit with the caller's receipt/outbox writes.
Errors carry stable `code`s: `COHORT_FULL`, `COHORT_REQUIRED`, `COHORT_NOT_ALLOWED`, `ORDER_NOT_FULFILLABLE`,
`COURSE_NOT_ENTITLED`, `COHORT_MISMATCH`.

## Completion

Required lessons are frozen into `Enrollment.policySnapshot` on first activity. `lesson.completed.v1` and
`course.completed.v1` are emitted by compare-and-set exactly once; completion is never cleared by regrades.
ASSESSMENT_PASS / ATTENDANCE lessons are derived from `AssessmentResultReader.effectiveResult` / `Attendance` by
`LearningCompletionConsumer` (assessment events), `LearningCompletionBackstopTask` (5-minute scan) and on learner reads.

## Tests

`pnpm --filter @lms/api exec jest src/modules/learning` runs the unit/DI suites. The real-PostgreSQL suite is opt-in:
`LEARNING_TEST_DATABASE_URL=postgresql://<user>:<pw>@localhost:55432/postgres` (creates and drops its own database).

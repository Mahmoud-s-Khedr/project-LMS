# Analytics

`AnalyticsModule` provides the eight existing API routes, `AnalyticsReportsService`, two explicit worker tasks and an outbox consumer. Register HTTP and worker providers using `.orchestration/deps/P3-B-ANALYTICS-wiring.md`.

## Authorization and data provenance

The existing JWT guard authenticates every route. Course reports use PolicyService with current active workspace membership and assigned-course grade/roster/instructor capabilities. Assessment reports require grading capability; revenue requires workspace ADMIN. Cross-tenant and inaccessible resources return 404. Learners can only ingest events for their own currently accessible enrollment and published lesson, and only read their own progress totals. Reports and export signing are audited.

Client batches use the shared strict allowlist (viewed/playback/navigation), at most 100 events and 256 KiB. Timestamps must be within the last seven days or five minutes future, and cannot precede enrollment. Navigation destinations must be in the same course. Actor/tenant come from authentication and resource queries. A user-row lock serializes event dedupe and the actor-wide 1,000 new events/minute bound. Identical retries do not consume additional quota; altered reuse conflicts. Events never write grades, progress, payments or certificates.

Learning's existing progress service already writes ActivityEvent rows; reports reuse them directly. Do not post the same action to both APIs with different event IDs. Daily learningSeconds is engagement telemetry (elapsedSeconds), not authoritative completion credit. Student lifetime learningSeconds comes from bounded LessonProgress.watchedSeconds. Enrollment completion and assessment results come from their owning persisted tables; VOID attempts are excluded. No answer or question-bank content is selected.

## Report semantics

Ranges are `[from,to)` RFC3339 instants, defaulting to the last 30 UTC dates including today, with at most 366 intersected dates. Date filtering uses UTC boundaries regardless of DB/session timezone. Daily rows include zero dates. Enrollment totals count acquisitions in the window; completion totals count completions in the window. Completion rate is the completed fraction of the window's acquired enrollment population. Active learners are distinct users across the whole window, not the sum of daily distinct counts.

Learner rows include enrollments acquired before `to`, with current completion percent and activity/time restricted to the interval; pagination is `(createdAt DESC,id DESC)`, with cursor scope/date/cohort binding. Assessment attempt counts use startedAt, count non-VOID attempts, and average only GRADED percentages. SUBMITTED/GRADING form the pending grading count. Decimal percentages and BigInt counters serialize as strings.

Revenue counts SUCCEEDED payments by paidAt and SUCCEEDED refunds by completedAt independently; net can be negative for a refund-only interval. Currency buckets never merge. Product reports allocate order payments proportionally to frozen line totals, with floor-rounding residual assigned to the first line by UUID. Initial subscription payments with order+subscription count once; subsequent invoices use the subscription's product; itemless recurring refunds use the same product. RefundItem amounts allocate order refunds. Failed/pending payments and refunds do not count. SQL uses BigInt totals; unsafe or shared-contract-out-of-range sums return HTTP 400 instead of rounding. The frozen shared paid/refunded aggregate limit and requested correction are in the contracts note.

Student activity/streak is bounded to 366 UTC dates. A streak remains current if the last active day is today or yesterday. Own enrollment/history remains available after grant expiry. The shared contract caps per-course student results at 1,000 courses; exceeding this returns a clear 400.

## Aggregation and exports

Daily metrics use full-day replacement upserts under a course row lock. Repeating/concurrent recomputations cannot increment a total twice. The worker cycles 25 courses at a time over the eight dates covered by the ingestion window. Explicit historical backfills use `recompute(scope,{from,to})` with full UTC days and at most 366 dates. HTTP reports query current authoritative rows, independent of cached DailyCourseMetric freshness.

Export creation requires Idempotency-Key and atomically commits ReportExport, outbox, audit and idempotency response. At most five outstanding operations per requester/workspace. Normalized absolute intervals are persisted so retries/processing cannot shift the report at midnight. Owner-bound polling rechecks current course/admin authorization. A current workspace admin can poll another requester's export, within current report permissions.

The outbox consumer schedules an idempotent worker wakeup; the periodic database scan survives Redis loss. Workers atomically acquire ten-minute leases, renew between 100-row learner pages, check authorization again before upload, and fence final publication. CSV files use private 0600 temporary storage, escape values/formulas, and are capped at 100 MiB. Object keys are persisted as PENDING_UPLOAD Assets before upload; interrupted uploads remain tracked for the existing media cleanup task. Only an atomic Asset READY / ReportExport READY transition makes a download possible. Worker failures retain a sanitized error and transition to FAILED; request a new operation to retry. Stale PROCESSING leases are recovered automatically.

Artifacts expire after 24 hours. Polling returns EXPIRED without a URL; periodic cleanup deletes objects and tombstones assets. Signed URLs last at most five minutes and never exceed report expiry. Storage uses the existing StorageService/MediaStorageService; no new bucket, upload client or queue infrastructure exists here.

## Tests

Run `ANALYTICS_TEST_DATABASE_URL=<local LMS postgres URL> pnpm --filter @lms/api exec jest src/modules/analytics --runInBand`. The suite requires localhost:55432, creates a randomly named database, applies the existing SQL migrations there, and drops it in teardown. It never migrates or writes the dev database. Storage is a file-capturing test adapter; PostgreSQL, transactions, policies, access evaluation, controller validation and export state transitions are real. No Redis connection is required for these tests; the shared event infrastructure has its own queue tests.

# REST API contract

## 1. Base, contracts and conventions

Base URL: `http://localhost:4100/api/v1`. Web origin: `http://localhost:3100`. OpenAPI UI: `/api/docs`; machine-readable spec: `/api/docs-json`. All tables below are relative to `/api/v1`. Public endpoints are explicitly marked; all others require `Authorization: Bearer <accessToken>`, except refresh/logout which use the httpOnly refresh cookie. Use HTTPS in production.

`packages/shared` owns zod request, response, query, enum and event-envelope schemas. Nest controllers validate through these schemas and publish matching Swagger metadata; web clients import inferred types, not Prisma types or generated Nest classes. Resource paths use UUID IDs; catalog slugs are filters/lookups and never authorization keys. A `workspaceId` in the path establishes scope, not permission. Return 404 for another tenant's resource. Every nested resource must belong to its path parents.

### Role notation

| Code | Meaning |
|---|---|
| Public | No login; published/explicit public projection only |
| User | Any active authenticated user, acting on self unless otherwise stated |
| SA | Platform SUPER_ADMIN; explicit cross-workspace actions are audited |
| Admin | Active ADMIN of the path workspace, or SA |
| Instructor | Active assigned course INSTRUCTOR, or Admin; course creation requires workspace INSTRUCTOR/Admin |
| Editor | Instructor, or assigned TA with canEditContent, or Admin |
| Grader | Instructor, or assigned TA with canGrade, or Admin |
| Roster | Instructor, or assigned TA with canManageLearners, or Admin |
| Learner | User owns enrollment/attempt and passes effective access, scheduling and prerequisite checks |
| Owner | User owns the financial/history/notification resource; active learning access is not required |
| Bank author | Workspace Admin, or bank creator INSTRUCTOR; assigned editors may use referenced banks only within their course |

A privileged staff role does not authorize acting as a learner on somebody else's record. Staff previews have their own endpoints. Enrollment, signing, answer and financial services repeat ownership checks; do not rely only on controller guards.

### Request/response rules

- JSON uses camelCase and explicit allowlisted fields; unknown fields are rejected. `PATCH` distinguishes omitted from explicit null. UUIDs are strings; timestamps RFC 3339 UTC; dates `YYYY-MM-DD`; Decimal grades and BigInt sizes/counts are strings; currency lowercase ISO and monetary amounts integer minor units.
- Success: `{ "data": <resource> }`; collection: `{ "data": [...], "meta": { "nextCursor": "...", "hasMore": true, "limit": 20 } }`. DELETE with no representation returns 204. Create returns 201 and Location when immediately persisted. Accepted asynchronous work returns 202 with `{data:{operationId,status}}`; polling is through its owning resource (asset/refund/export/etc.).
- Cursor pagination is the default: `?cursor=<opaque>&limit=20`, range 1..100, deterministic `(createdAt DESC,id DESC)` unless documented. Cursor encodes sort keys and filter hash; reject mismatched filters/cursors. Catalog may sort by publishedAt/title with id tiebreaker. Offset pagination is allowed only for bounded admin tables: `?page=1&pageSize=20`, max 100; return meta `{page,pageSize,total,totalPages}`. Do not mix modes. Count is omitted from cursor lists.
- Filters are typed per endpoint: `search` (trimmed, <=200 chars), `status`, `courseId`, `cohortId`, `userId`, `workspaceId`, `from`, `to`, `sort`. Unsupported filters/sorts fail validation. Ranges use inclusive from/exclusive to. Never permit arbitrary SQL field names, nested ORM filters or unbounded include parameters.
- Authoring edits require body `version` where a model has a version field. Other mutable aggregate responses expose an ETag derived from updatedAt; require `If-Match` for conflicting administrative edits. Answer autosave uses `version`. Stale versions return 409 `VERSION_CONFLICT`; missing precondition returns 428. Reorders submit the complete sibling ID list atomically.
- `Idempotency-Key` (UUID or 16..128-character opaque key) is required on checkout, free/manual grants, attempt start/submit, refund, cancellation, certificate issuance and export requests. Store scoped user/workspace/route and normalized request hash for 24 hours; same key/body returns original status/body, different body returns 409 `IDEMPOTENCY_CONFLICT`. A pending key returns 409 `OPERATION_IN_PROGRESS` with Retry-After. Webhook dedupe is separately based on Stripe event ID. Owner-only auth mutations use refresh family locking instead of the tenant idempotency table.
- Rate-limited responses return 429 and Retry-After. Request ID is echoed as `X-Request-Id`. Content capabilities and personalized responses use private/no-store. Tokens, answer keys and raw signed URLs never appear in logs or generic list projections. Security notifications/events may use null workspace scope; ordinary business resources never do.

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is invalid.",
    "details": [{ "path": "items.0.priceId", "code": "invalid_uuid", "message": "Expected a UUID" }],
    "requestId": "bdb7cd30-7d74-4a72-bda7-688fcb9472d4"
  }
}
```

Use 400 for malformed/invalid input; 401 for absent/expired/revoked authentication; 403 for visible-but-forbidden actions; 404 for missing/inaccessible resources; 409 for concurrency/business conflicts; 410 for expired one-time public capabilities; 413 for size limits; 422 for valid input that fails a semantic rule; 428 for missing edit precondition; 429 for throttling; 500 for unexpected errors; 503 for required dependency unavailability. Never leak Prisma errors/SQL or Stripe secrets. Stable business codes include `ACCESS_EXPIRED`, `ENROLLMENT_REQUIRED`, `CONTENT_LOCKED`, `PREREQUISITE_UNMET`, `COHORT_FULL`, `ATTEMPT_LIMIT_REACHED`, `ATTEMPT_CLOSED`, `GRADE_NOT_RELEASED`, `ASSET_NOT_READY`, `COUPON_EXHAUSTED`, `REFUND_LIMIT_EXCEEDED`, `VERSION_CONFLICT`, `REFRESH_REUSED`. Lock responses may include a safe reason and `unlockAt`, never another learner's progress.

## 2. Auth and profile

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `/auth/csrf` | Public | Issue double-submit CSRF token/cookie; no session required |
| POST | `/auth/register` | Public + CSRF | Create STUDENT identity; optional personal instructor workspace through explicit requested onboarding mode; verification mail; no privileged role fields |
| POST | `/auth/login` | Public + CSRF | Verify password; set refresh cookie; return accessToken, expiresIn=600 and safe user projection |
| POST | `/auth/refresh` | Refresh cookie + CSRF | Atomically rotate refresh token; return new short access token; reuse revokes family |
| POST | `/auth/logout` | Refresh cookie + CSRF | Revoke current family, clear refresh cookie; idempotent 204 |
| POST | `/auth/logout-all` | User | Revoke all own sessions; clear cookie |
| POST | `/auth/verify-email` | Public | Consume hashed one-time token; no login required |
| POST | `/auth/resend-verification` | Public | Generic 202; rate-limited, does not reveal identity existence |
| POST | `/auth/forgot-password` | Public | Generic 202; email single-use short-lived reset token |
| POST | `/auth/reset-password` | Public | Consume token, replace Argon2id hash, revoke all refresh families |
| GET | `/me` | User | Own profile, platform role and safe workspace memberships |
| PATCH | `/me` | User | Name, locale, timezone; protected identity changes excluded |
| PUT | `/me/password` | User | Current password required; change password and revoke other sessions |
| GET | `/me/sessions` | User | Own families/devices, no token hashes |
| DELETE | `/me/sessions/:familyId` | Owner | Revoke own family and descendants |

Register/login/refresh/logout cookie-changing requests require allowlisted Origin plus `X-CSRF-Token`. Email/reset tokens are high-entropy opaque strings; links land on web forms which POST the token. Never put JWT refresh tokens in response JSON. Access token remains in browser memory. Web coordinates refresh across tabs with Web Locks/BroadcastChannel, has one in-flight refresh, retries a failed API call once, and preserves idempotency keys on retries. Refresh has a fixed 30-day family horizon; access JWT expiry is 10 minutes. Verify email before paid checkout or graded attempts. User suspension revokes sessions immediately.

## 3. Workspaces and staff

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `/me/workspaces` | User | Own active workspaces and scoped permissions |
| POST | `/workspaces` | User | Create PERSONAL/ACADEMY workspace; creator gets owner ADMIN membership |
| GET | `/workspaces/:workspaceId` | Member/Admin | Workspace settings safe for caller's role |
| PATCH | `/workspaces/:workspaceId` | Admin | Name, branding, timezone and allowlisted settings |
| POST | `/workspaces/:workspaceId/transfer-ownership` | Workspace owner/SA | Transfer to active ADMIN with reason and reauthentication |
| GET | `/workspaces/:workspaceId/members` | Admin | Filter active/suspended role/email; cursor list |
| PATCH | `/workspaces/:workspaceId/members/:memberId` | Admin | Change scoped role/status; protect last owner/admin |
| DELETE | `/workspaces/:workspaceId/members/:memberId` | Admin | Mark LEFT, invalidate staff access; no hard deletion |
| GET | `/workspaces/:workspaceId/invitations` | Admin | Pending/accepted/revoked invitation list |
| POST | `/workspaces/:workspaceId/invitations` | Admin | Invite email with tenant role, hash token, queue email |
| DELETE | `/workspaces/:workspaceId/invitations/:invitationId` | Admin | Revoke outstanding invitation |
| POST | `/invitations/accept` | User | Consume token; verified own email must match invitation |

## 4. Catalog and course authoring

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `/catalog/workspaces/:slug` | Public | Published workspace branding; no membership or settings disclosure |
| GET | `/catalog/courses` | Public | Published public courses; search, workspace slug, category, language, level, deliveryMode, sort |
| GET | `/catalog/courses/by-slug/:slug` | Public | Exact published public slug; optional workspace slug disambiguates tenants; ambiguous returns 404 |
| GET | `/catalog/courses/:courseId` | Public | Public/unlisted marketing, pricing, approved preview outline; private returns 404 |
| GET | `/catalog/courses/:courseId/preview-lessons/:lessonId` | Public | Approved preview content only; no assessment/meeting secrets |
| GET | `/workspaces/:workspaceId/categories` | Member/Admin | Workspace taxonomy |
| POST | `/workspaces/:workspaceId/categories` | Admin | Create category |
| PATCH | `/workspaces/:workspaceId/categories/:categoryId` | Admin | Rename/reorder metadata |
| DELETE | `/workspaces/:workspaceId/categories/:categoryId` | Admin | Archive category |
| GET | `/workspaces/:workspaceId/courses` | Instructor/Admin/TA | Courses caller manages; status/search/staff filters |
| POST | `/workspaces/:workspaceId/courses` | Workspace Instructor/Admin | Create draft and assign creator as instructor |
| GET | `/workspaces/:workspaceId/courses/:courseId` | Editor/Grader/Roster | Staff aggregate metadata and permitted outline |
| PATCH | `/workspaces/:workspaceId/courses/:courseId` | Instructor | Edit metadata, visibility, free/delivery/completion policies with version |
| DELETE | `/workspaces/:workspaceId/courses/:courseId` | Instructor | Soft-delete unused draft only; retained learners/history return 409; use archive action |
| POST | `/workspaces/:workspaceId/courses/:courseId/submit-review` | Instructor | DRAFT to IN_REVIEW |
| POST | `/workspaces/:workspaceId/courses/:courseId/publish` | Instructor | Validate all publish invariants and publish atomically |
| POST | `/workspaces/:workspaceId/courses/:courseId/archive` | Instructor | Stop new listings/sales; preserve existing learner delivery |
| GET | `/workspaces/:workspaceId/courses/:courseId/staff` | Instructor | Assigned staff with capability flags |
| PUT | `/workspaces/:workspaceId/courses/:courseId/staff/:userId` | Instructor | Assign active workspace staff; validate role/flags |
| DELETE | `/workspaces/:workspaceId/courses/:courseId/staff/:userId` | Instructor | Remove assignment, preserve historical attribution |
| PUT | `/workspaces/:workspaceId/courses/:courseId/categories` | Instructor | Replace category IDs; all same workspace |
| PUT | `/workspaces/:workspaceId/courses/:courseId/prerequisites` | Instructor | Replace prerequisite course IDs and minimumPercent; reject cycles |

## 5. Content, cohorts and live learning

In the following table `C` means `/workspaces/:workspaceId/courses/:courseId`. It is a path abbreviation only; generated OpenAPI must contain the fully expanded path.

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `C/sections` | Editor/Grader/Roster | Complete staff outline |
| POST | `C/sections` | Editor | Create ordered section |
| PATCH | `C/sections/:sectionId` | Editor | Rename section |
| DELETE | `C/sections/:sectionId` | Editor | Soft-delete unused section/descendants; reject retained references |
| PUT | `C/sections/order` | Editor | Atomic complete sibling reorder |
| POST | `C/sections/:sectionId/lessons` | Editor | Create discriminated lesson payload |
| GET | `C/lessons/:lessonId` | Editor/Grader/Roster | Staff lesson projection; role-limited secrets |
| PATCH | `C/lessons/:lessonId` | Editor | Edit body/type/release/completion policy with version |
| DELETE | `C/lessons/:lessonId` | Editor | Soft-delete unused lesson; reject retained attempts/completion |
| PUT | `C/sections/:sectionId/lessons/order` | Editor | Atomic lesson reorder |
| PUT | `C/lessons/:lessonId/prerequisites` | Editor | Replace same-course prerequisite lesson graph |
| POST | `C/lessons/:lessonId/assets` | Editor | Attach verified same-workspace asset with purpose/position |
| DELETE | `C/lessons/:lessonId/assets/:assetId` | Editor | Detach resource, preserving history |
| GET | `C/lessons/:lessonId/preview` | Editor/Grader/Roster | Explicit staff preview; no learner progress side effects |
| GET | `C/cohorts` | Editor/Roster | Staff cohorts including windows/capacity |
| POST | `C/cohorts` | Instructor | Create cohort for cohort-based course |
| PATCH | `C/cohorts/:cohortId` | Instructor | Edit windows/capacity; reject invalidating occupied seats |
| DELETE | `C/cohorts/:cohortId` | Instructor | Archive empty cohort or close new enrollment without erasing roster |
| PUT | `C/cohorts/:cohortId/releases/:lessonId` | Editor | Upsert absolute cohort override |
| DELETE | `C/cohorts/:cohortId/releases/:lessonId` | Editor | Remove override and use lesson default |
| GET | `C/cohorts/:cohortId/enrollments` | Roster | Paginated cohort roster/progress |
| GET | `/catalog/courses/:courseId/cohorts` | Public | Published enrollment windows and safe seat availability only |
| POST | `C/lessons/:lessonId/live-sessions` | Editor | Schedule session, encrypted provider host URL |
| PATCH | `C/live-sessions/:sessionId` | Editor | Reschedule/cancel; emit notifications |
| GET | `C/live-sessions/:sessionId/attendance` | Roster/Grader | Authorized attendance report |
| PUT | `C/live-sessions/:sessionId/attendance/:enrollmentId` | Roster | Verify/correct attendance with reason |
| POST | `/me/enrollments/:enrollmentId/live-sessions/:sessionId/join` | Learner | Validate release/access and return short-lived join capability |

## 6. Media and secure signing

| Method | Path | Role | Summary |
|---|---|---|---|
| POST | `/workspaces/:workspaceId/assets/uploads` | Editor/Admin or submitting Learner | Create purpose-bound pending asset; return upload URL, required headers, assetId and expiry |
| POST | `/workspaces/:workspaceId/assets/:assetId/complete` | Upload owner + resource permission | Verify actual metadata, enqueue malware scan/transcode; 202 |
| GET | `/workspaces/:workspaceId/assets/:assetId` | Upload owner/authorized staff | Poll safe asset status, size, MIME and rejection code |
| DELETE | `/workspaces/:workspaceId/assets/:assetId` | Authorized staff/upload owner | Archive only if usage policy permits; async object cleanup |
| POST | `/me/enrollments/:enrollmentId/lessons/:lessonId/assets/:assetId/download` | Learner | Check linked lesson, access, prerequisites, release and READY; return 60-second GET URL |
| POST | `C/lessons/:lessonId/assets/:assetId/preview-download` | Editor/Grader/Roster | Staff-purpose signing, audited; no progress |
| POST | `/catalog/courses/:courseId/preview-lessons/:lessonId/assets/:assetId/download` | Public | Sign only explicitly approved preview asset; rate-limited |
| POST | `/me/attempts/:attemptId/attachments/:assetId/download` | Owner | Read own submission file after confirming association |
| POST | `/workspaces/:workspaceId/attempts/:attemptId/attachments/:assetId/download` | Grader | Read submission file for assigned course, audit access |

There is no generic student `GET /assets/:id/download` bypass. Upload input includes purpose, parent resource ID, filename, declared MIME, digit-string size and checksum. Response: `{data:{assetId,url,method,headers,expiresAt}}`. Download response: `{data:{url,expiresAt}}`. All parent IDs are resolved server-side, assets must be READY, and no raw object keys are accepted. Signed response bodies are never cached.

## 7. Banks, authoring and grading

`W` means `/workspaces/:workspaceId`.

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `W/question-banks` | Bank author | Authorized banks; search and ownership filters |
| POST | `W/question-banks` | Workspace Instructor/Admin | Create owned bank |
| PATCH | `W/question-banks/:bankId` | Bank author | Rename/update metadata |
| DELETE | `W/question-banks/:bankId` | Bank author | Archive without deleting versions |
| GET | `W/question-banks/:bankId/questions` | Bank author | Search by tags/type/status; privileged author DTO |
| POST | `W/question-banks/:bankId/questions` | Bank author | Create question and immutable version 1 with typed answer key |
| GET | `W/questions/:questionId` | Bank author | Root metadata and latest version |
| PATCH | `W/questions/:questionId` | Bank author | Update tags/title; prompt/key edits create a new version |
| POST | `W/questions/:questionId/versions` | Bank author | Append validated question version/options |
| GET | `W/questions/:questionId/versions` | Bank author | Version history, never learner-accessible |
| DELETE | `W/questions/:questionId` | Bank author | Archive question; preserve referenced versions |
| POST | `C/lessons/:lessonId/assessment` | Editor | Create kind-matched assessment and draft version |
| GET | `C/assessments/:assessmentId` | Editor/Grader | Staff metadata and allowed grading policies |
| POST | `C/assessments/:assessmentId/versions` | Editor | Clone published config into a new draft |
| PATCH | `C/assessments/:assessmentId/versions/:versionId` | Editor | Draft instructions/timing/rubric/feedback/attempt policy |
| PUT | `C/assessments/:assessmentId/versions/:versionId/questions` | Editor | Replace fixed question-version IDs, points and order |
| PUT | `C/assessments/:assessmentId/versions/:versionId/pools` | Editor | Configure bank/type/tag selection/count/points |
| POST | `C/assessments/:assessmentId/versions/:versionId/publish` | Editor | Freeze pool memberships; validate feasible draw; retire prior published version |
| GET | `C/assessments/:assessmentId/attempts` | Grader | Queue filtered by status/cohort/learner/date |
| GET | `C/assessments/:assessmentId/attempts/:attemptId` | Grader | Full authorized submission/rubric, privileged key projection |
| PUT | `C/assessments/:assessmentId/accommodations/:enrollmentId` | Instructor | Extra time/attempts/hard cutoff with reason |
| POST | `C/assessments/:assessmentId/attempts/:attemptId/grades` | Grader | Atomic rubric/answer points and feedback; append GradeEvents; draft or final grading |
| POST | `C/assessments/:assessmentId/attempts/:attemptId/regrade` | Grader | Explicit reason, grade revision and result-changed event |
| POST | `C/assessments/:assessmentId/attempts/:attemptId/void` | Instructor | Preserve history, exclude attempt from limits/results |

Author DTOs containing keys are distinct shared schemas from learner delivery DTOs. Bulk question imports can be added later through a validated job; they are not implicit arbitrary JSON imports.

## 8. Enrollment, learning and attempts

| Method | Path | Role | Summary |
|---|---|---|---|
| POST | `/courses/:courseId/enroll` | User | Free self-enrollment only; cohort optional/required by mode; idempotent |
| GET | `/me/enrollments` | Owner | Own courses/progress/access state; filter status/course/cohort |
| GET | `/me/enrollments/:enrollmentId` | Owner | Own enrollment, effective access and safe grant summary |
| GET | `/me/enrollments/:enrollmentId/outline` | Owner | Lesson titles/lock reasons/completion; locked bodies excluded |
| GET | `/me/enrollments/:enrollmentId/lessons/:lessonId` | Learner | Authorized lesson body and resource metadata; signed links requested separately |
| PUT | `/me/enrollments/:enrollmentId/lessons/:lessonId/progress` | Learner | Acknowledge/read or bounded playback heartbeat with eventId; no grade/pass fields |
| GET | `/me/enrollments/:enrollmentId/results` | Owner | Released assessment results/effective grade; historical access allowed |
| GET | `C/enrollments` | Roster | Authorized roster, grant/status/cohort/date filters |
| POST | `C/enrollments/manual` | Roster | Create/reuse learner enrollment and MANUAL grant, reason/expiry required by policy |
| GET | `C/enrollments/:enrollmentId` | Roster | Learner progress and grant provenance; no unrelated financial data |
| PATCH | `C/enrollments/:enrollmentId` | Roster | Suspend/reactivate or move cohort with reason/ETag |
| POST | `C/enrollments/:enrollmentId/grants` | Roster | Add independent manual grant; cannot fabricate order/subscription source |
| POST | `C/enrollments/:enrollmentId/grants/:grantId/revoke` | Roster | Revoke allowed grant with reason; commerce sources require Admin |
| GET | `/me/enrollments/:enrollmentId/assessments/:assessmentId` | Learner | Current learner-safe instructions, availability, remaining attempts |
| POST | `/me/enrollments/:enrollmentId/assessments/:assessmentId/attempts` | Learner | Freeze randomized attempt, deadline and questions; idempotent |
| GET | `/me/attempts/:attemptId` | Owner | Own snapshot/saved responses/status; content delivery requires active access while open; released history remains available |
| PUT | `/me/attempts/:attemptId/answers/:attemptQuestionId` | Learner | Versioned autosave of discriminated response and clean attachment IDs |
| POST | `/me/attempts/:attemptId/submit` | Learner | Idempotent final submission; server deadline wins |
| GET | `/me/attempts/:attemptId/result` | Owner | Released score/feedback only; 409 GRADE_NOT_RELEASED before policy release |

Attempt start response includes `{attemptId,version,status,startedAt,deadlineAt,questions:[{attemptQuestionId,type,prompt,options,points,isRequired,position}]}`. It excludes seed, answer keys, explanations, correct option flags and rubric solutions. A response autosave has `{version,response,attachmentIds?}`; response is a question-type-discriminated shared schema. Submit returns current processing/finalized state without ignoring feedback release rules. Server deadline enforcement operates on every write even when workers are down.

## 9. Products, prices, coupons, orders and subscriptions

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `/catalog/products` | Public | Active products with public course projections, workspace/type filters |
| GET | `/catalog/products/:productId` | Public | Product detail/current prices; no unpublished/private course contents |
| GET | `W/products` | Admin | Workspace products including drafts |
| POST | `W/products` | Admin | Create COURSE/BUNDLE/SUBSCRIPTION_PLAN |
| GET | `W/products/:productId` | Admin | Tenant-scoped product detail and ETag for administrative editing |
| PATCH | `W/products/:productId` | Admin | Edit metadata/status; versioned membership policy |
| DELETE | `W/products/:productId` | Admin | Archive; preserve all sold snapshots |
| PUT | `W/products/:productId/courses` | Admin | Replace course membership; affects future sales, not snapshots |
| POST | `W/products/:productId/prices` | Admin | Create immutable price and matching Stripe price |
| PATCH | `W/products/:productId/prices/:priceId` | Admin | Toggle availability only; economic fields immutable |
| GET | `W/coupons` | Admin | Coupon rules/usage and validity filters |
| POST | `W/coupons` | Admin | Create normalized percent/fixed coupon |
| PATCH | `W/coupons/:couponId` | Admin | Update future validity/limits/active state, protect prior orders |
| PUT | `W/coupons/:couponId/products` | Admin | Replace eligible product set |
| DELETE | `W/coupons/:couponId` | Admin | Disable/archive coupon |
| POST | `W/checkout/quote` | User | Server-priced quote, coupon eligibility and cohort validation; no reservation |
| POST | `W/checkout/sessions` | User, verified email | Reserve coupon/seats, create order and Stripe Checkout session; idempotent |
| GET | `/me/orders` | Owner | Own receipts; status/workspace/date filters |
| GET | `/me/orders/:orderId` | Owner | Current persisted order/payment/refund/fulfillment summary |
| GET | `W/orders` | Admin | Workspace order list; status/user/date/currency filters |
| GET | `W/orders/:orderId` | Admin | Accounting projection including immutable item snapshots |
| POST | `W/orders/:orderId/cancel` | Admin or Owner | Cancel only pending order and expire Checkout/reservations |
| POST | `W/payments/:paymentId/refunds` | Admin | Amount, allocation/revoke policy, reason; idempotent; 202 until Stripe confirms |
| GET | `W/refunds/:refundId` | Admin | Poll confirmed refund and access-effect state |
| GET | `/me/subscriptions` | Owner | Own current/ended subscriptions and period bounds |
| GET | `/me/subscriptions/:subscriptionId` | Owner | Own plan snapshot, payment status, next cutoff |
| POST | `/me/subscriptions/:subscriptionId/cancel` | Owner | Cancel at period end, idempotent; preserve paid access |
| POST | `/me/subscriptions/:subscriptionId/resume` | Owner | Undo scheduled cancellation if Stripe state permits |
| POST | `W/subscriptions/:subscriptionId/cancel` | Admin | Explicit immediate/period-end cancellation, reason and audit |
| POST | `W/billing/portal-sessions` | User | Own customer Stripe Billing Portal session with allowlisted return URL |
| POST | `/webhooks/stripe` | Stripe signature | Raw-body verification, unique durable inbox insertion, fast 2xx; no browser CSRF |

Checkout input: `{items:[{priceId,cohorts?:[{courseId,cohortId}]}],couponCode?,successPath,cancelPath}`. Do not accept unit amounts, currency, arbitrary entitlement course IDs, stripeCustomerId or userId. Cohort selectors may name only resolved product courses; every cohort-mode course requires exactly one selection, and self-paced courses reject one. Persist one OrderItemCourse row per resolved course, including bundle members. Paths must be relative allowlisted application destinations. Checkout output: `{data:{orderId,checkoutUrl,expiresAt}}`; free zero-total completion returns `{data:{orderId,checkoutUrl:null,expiresAt:null}}`. The UI polls own order status after redirect; PAID does not imply asynchronous grants are already available, so response includes `fulfillmentStatus` derived from grants/receipts.

Refund input: `{amount,reason,revokeAccess,items?:[{orderItemId,amount,revokeAccess}]}`. One-time payment refunds require reconciled item allocations; renewal refunds use the subscription-level revoke policy without item allocations. Amount and currency come from the payment ledger. Webhook payload storage is restricted to operational admins, not exposed by ordinary order endpoints.

## 10. Certificates and notifications

| Method | Path | Role | Summary |
|---|---|---|---|
| GET | `C/certificate-templates` | Instructor | Versioned course certificate templates |
| POST | `C/certificate-templates` | Instructor | Create new version with layout/issuer/ready background |
| PATCH | `C/certificate-templates/:templateId` | Instructor | Toggle active; used layout edits require a new template version |
| GET | `/me/certificates` | Owner | Own earned/revoked certificates |
| GET | `/me/certificates/:certificateId` | Owner | Own certificate metadata/render status |
| POST | `/me/certificates/:certificateId/download` | Owner | Sign private generated file, no current enrollment access required |
| POST | `C/enrollments/:enrollmentId/certificate` | Instructor | Recheck eligibility and enqueue idempotent issuance |
| POST | `C/certificates/:certificateId/render` | Instructor | Audited rerender, Idempotency-Key required, 202 |
| POST | `C/certificates/:certificateId/revoke` | Instructor | Explicit reason, mark revoked, audit and notify |
| GET | `/certificates/verify/:verificationCode` | Public | Minimal verification, masked recipient and validity; rate-limited |
| GET | `/me/notifications` | Owner | Cursor list; unread/type/workspace filters |
| PATCH | `/me/notifications/:notificationId` | Owner | Mark read/unread only |
| POST | `/me/notifications/read-all` | Owner | Mark own notifications through supplied timestamp read |
| GET | `/me/notification-preferences` | Owner | Global security and per-workspace type/channel preferences |
| PUT | `/me/notification-preferences` | Owner | Replace allowlisted optional preferences; cannot suppress mandatory security mail |

## 11. Activity, analytics and administration

| Method | Path | Role | Summary |
|---|---|---|---|
| POST | `W/activity-events/batch` | User | <=100 allowlisted client events, <=256 KB total; actor derived, resource-authorized, deduped |
| GET | `/me/analytics/progress` | Owner | Own totals, learning streak/activity and per-course progress |
| GET | `C/analytics/overview` | Instructor/Grader/Roster | Authorized enrollment/completion/engagement metrics |
| GET | `C/analytics/learners` | Instructor/Grader/Roster | Paginated learner activity/progress, cohort/date filters |
| GET | `C/analytics/assessments` | Instructor/Grader | Attempt/pass/manual grading metrics; no unrelated bank contents |
| GET | `W/analytics/revenue` | Admin | Paid/refunded/net totals per currency, product/date filters |
| POST | `W/analytics/exports` | Admin or scoped Instructor | Authorized report export job; idempotent |
| GET | `W/analytics/exports/:operationId` | Request owner/Admin | Poll completion; short signed download URL only after authorization |
| GET | `W/audit-logs` | Admin | Redacted append-only audit list by actor/resource/action/date |
| GET | `W/operations/events` | Admin | Safe outbox/job failure projection, no secret payloads |
| POST | `W/operations/events/:eventId/replay` | Admin | Audited allowlisted failed event replay with receipts respected |
| GET | `/admin/workspaces` | SA | Platform tenant inventory/status |
| PATCH | `/admin/workspaces/:workspaceId` | SA | Change typed Workspace.status/suspendedAt with reason; all access evaluators honor suspension |
| GET | `/admin/users` | SA | User search/status, never hashes or tokens |
| PATCH | `/admin/users/:userId` | SA | Suspend/reactivate, platform role changes with audit and self-lockout protections |
| GET | `/admin/webhooks` | SA | Stripe inbox status/error metadata; sensitive payload omitted |
| POST | `/admin/webhooks/:webhookId/replay` | SA | Replay verified stored event, never accept a replacement payload |
| GET | `/health/live` | Public | Process liveness only |
| GET | `/health` | Public | Bounded readiness for database/Redis, no secrets/versions/connection strings |

Exports use a persisted `ReportExport` record; operationId is its ID. A transaction writes that record and `analytics.export.requested.v1` to the outbox. The worker leases the record, renders a private Asset, and stamps READY/FAILED. Polling returns `{data:{operationId,status,expiresAt,url?}}`, with url only when READY and authorized. Output artifacts expire after 24 hours, changing status to EXPIRED; a reconciler recovers stale PROCESSING leases. Tenant/requester checks and current report scope apply even for a guessed valid operationId. Queue/outbox publication is never treated as export completion.

## 12. Contract and security acceptance examples

- Course B's sectionId in Course A's lesson request: 404/422, never create a cross-parent link.
- TA with canGrade but not canEditContent: can grade assigned course, cannot publish, edit a bank or issue refunds.
- Student requesting another learner's attempt, attachment, receipt or notification: 404.
- Active subscription plus refunded standalone purchase: standalone source revoked, subscription source still authorizes learning.
- Enrollment expired: outline/history/certificate still visible; lesson body and asset-signing endpoints return an appropriate access error.
- Duplicate checkout/attempt/refund key with same body: original result; changed body: 409.
- Saved answer after deadline, including delayed worker processing: ATTEMPT_CLOSED; stored answers are finalized once.
- Out-of-order duplicate Stripe events: one payment/refund effect, correct current subscription/grant state, no duplicate email.
- Published question changed by author: old attempts still grade against the original immutable version.
- OpenAPI snapshots are compared to shared schemas and route authorization tests before integration acceptance.

## INT-2 additive authoring and multipart routes

The following routes use the same authenticated workspace/course ownership policies as their existing write counterparts. Version lists use cursor/limit pagination. Draft selections return `{data:{version,questions}}` or `{data:{version,pools}}`. Bank/question metadata writes and archive commands require `If-Match: "<id>:<updatedAt epoch milliseconds>"` (428 missing, 409 stale). Discover the initial draft with GET versions; create another draft only after publication.

| Method | Path | Result |
| --- | --- | --- |
| GET | `C/assessments/:assessmentId/versions` | assessmentVersionsResponseSchema |
| GET | `C/assessments/:assessmentId/versions/:versionId/questions` | assessmentQuestionSelectionResponseSchema |
| GET | `C/assessments/:assessmentId/versions/:versionId/pools` | assessmentPoolSelectionResponseSchema |
| POST | `W/assets/:assetId/parts` | downloadResponseSchema; PUT part capability (300 seconds) |
| POST | `W/assets/:assetId/multipart-complete` | 202 assetCompleteResponseSchema |

POST assets/uploads accepts `?multipart=true` only for MP4 and returns `{data:{assetId,uploadId,partSizeBytes:16777216,expiresAt}}`; ordinary uploads retain their existing response. Upload sessions expire in 24 hours. Parts are 1..10000 and completion requires contiguous ascending part numbers with ETags. The upload response contract is uploadStartResponseSchema.

`GET /api/v1/media/live-join?capability=<opaque>` redeems a signed 60-second capability with a 303 redirect after current access/schedule checks; invalid capabilities return 404. The response is no-store/no-referrer. This redirect is not a JSON response contract.

`content.live-session.changed.v1` is tenant-scoped with strict `{courseId,sessionId}` payload. Provider URLs are never included. The notification consumer remains owned by P3-B-ENGAGE.

Registration returns HTTP 201 `{data:{message:"Check your email for next steps."}}` for both new and existing email addresses and creates no session.

## INT-3 additive contracts

- `GET /api/v1/catalog/courses/by-slug/:slug?workspace=:workspaceSlug` is public and
  returns `catalogCourseResponseSchema`. Slugs use `slugSchema`; query uses
  `catalogCourseBySlugQuerySchema`. Only published PUBLIC, nondeleted courses in
  active nondeleted workspaces are eligible. Workspace is optional only when the
  eligible slug is unique across workspaces; absent/ambiguous matches return 404
  `COURSE_NOT_FOUND`. UUID detail remains available. No search fallback is used.
- Learner lesson responses include `assessmentId: UUID | null`; assessment player
  links must use it rather than the lesson ID. Public previews omit this field.
- Staff grade events additionally return `attemptQuestionId: UUID | null` derived
  from the stored answer relation, including legacy answer IDs.
- `certificate.revoked` is a mandatory transactional email notification category.
- `POST /api/v1/workspaces/:workspaceId/courses/:courseId/certificates/:certificateId/render`
  accepts `certificateRenderRequestSchema` (`{}`), requires `Idempotency-Key`, and
  returns 202 `certificateIssueResponseSchema`; the audited existing command
  preserves certificate identity/code and records prior render evidence.
- Analytics revenue paid/refunded aggregates support nonnegative safe integers;
  individual payment limits are unchanged.

Server deployment environment: `API_INTERNAL_ORIGIN` is the web server's reachable
API origin without a path suffix (local `http://localhost:4100`). See README for
scanner mode and `CERTIFICATE_CHROMIUM_PATH` runtime configuration.

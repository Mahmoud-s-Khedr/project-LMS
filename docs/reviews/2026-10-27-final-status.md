# LMS — final status (overnight run, 2026-10-26 → 27)

Final status at 01:20, 2026-10-27. The last package (P5-JOURNEY) is finished, and I verified it myself.

## Summary

All 24 packages in `docs/WORK_PLAN.md` are built and integrated:

| Phase | Packages |
| --- | --- |
| 0 | Scaffold |
| 1 | Contracts, database, identity, tenancy, events/audit, web shell |
| 2 | Content/catalog/media, assessments, commerce, plus their frontends |
| 3 | Learning access/progress, certificates/notifications, analytics, plus their frontends |
| 4 | Purchase→access fulfillment, administration, QA suites |
| 5 | Final integration, README, `docs/DEPLOYMENT.md`, CI workflow |

## Verification I ran myself, after the last package (P5-JOURNEY)

| Check | Result |
| --- | --- |
| `pnpm -r typecheck` | 0 errors |
| `pnpm lint` | Pass |
| `pnpm build` | Pass |
| `node scripts/test-postgres.mjs` (API tests against real Postgres; every module's test database set) | API: 42 suites, **442 passed, 0 skipped**. Shared: 56 passed. Web: 60 files, 395 passed. |
| `pnpm test:security` (starts and stops its own API) | **29 passed, 0 skipped**, including the 3 Stripe webhook tests (missing signature, forged signature, duplicate delivery), which use a local test-only secret |
| `pnpm test:e2e --workers=1` (Chromium; starts and stops its own API, worker and web) | 8 passed, 1 skipped. The skipped test is the paid checkout journey, which needs real Stripe test keys. |
| `pnpm check:api-paths` against a live API | 175 web→API operations, 0 mismatches, 0 unresolved |
| Cleanup | Ports 3100 and 4100 free; no leftover API, worker or web processes |

### What P5-JOURNEY added

- **Free-course browser test** (`tests/e2e/free-learner-journey.spec.ts`). It runs against the real stack: an instructor publishes a course; a new student registers, enrolls free, completes a lesson, takes a timed quiz and uploads an assignment; the instructor grades it with a rubric. The student then gets exactly one certificate and downloads a real PDF. An anonymous visitor verifies it on the public page, which shows no personal data, and exactly one certificate email arrives in Mailpit.
- **Two real bugs found and fixed:**
  - The quiz screen broke right after starting a quiz because the saved answers were missing.
  - Instructors could not submit rubric grades because the grading screen never received the rubric. The rubric is now sent only to staff with grading permission.
- **Self-contained test runs** (`scripts/test-http.mjs`). `test:security` and `test:e2e` start fresh servers with `NODE_ENV=test` and stop them by PID, so back-to-back runs no longer hit 429s. Webhook tests now fail rather than skip when the webhook endpoint is unavailable. Limits outside `NODE_ENV=test` are unchanged.
- **Paid-journey message:** the paid test now names the exact Stripe keys and the `stripe listen` command it needs. README documents this.

## Fix I made during final review

`apps/api/src/modules/learning/enrollment-grant.service.ts`: the final integrator let a REFUNDED order grant course access again. That was meant to support late "paid" events after a refund that keeps access, but it did not check whether the refund had revoked access. The same gap already existed for partially refunded orders.

- **Fix:** grants are now refused for an order item with a succeeded refund whose `revokeAccess` is true.
- **Test:** I added a regression test in `fulfillment.postgres.spec.ts` ("a late paid event cannot restore access that a succeeded refund revoked"). I confirmed that it fails without the fix and passes with it.

## Agent-report accuracy

The final integration and some frontend packages ran on Gemini Flash after codex and agy's Claude quota ran out. Their reports overstated results in places:

- P5-I said the full paid learner journey "ran"; it was skipped.
- P5-I printed "Release gate: PASS" while the webhook tests were skipped.
- One frontend report listed endpoints that do not exist. The code itself was correct.

Every number in this file comes from my own runs, not from agent reports.

## Known gaps / what needs you

1. **Paid checkout end to end.** Needs your Stripe test-mode keys (`STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET` from `stripe listen`). Everything after payment is covered by backend Postgres tests: grants, refunds, subscriptions, out-of-order webhooks. The free-course journey is covered end to end in the browser.
2. **Virus scanning.** Production needs a ClamAV daemon. Locally, uploads are rejected unless `MEDIA_SCANNER_MODE=development-bypass` is set; that mode is refused when `NODE_ENV=production`.
3. **Rate limits.** Login/register allow 5 per minute (1000 only when `NODE_ENV=test`). The test runners now start a fresh API for each suite, so you no longer need to restart it between suites by hand.
4. **Not done:** production deployment, backup-restore drill, load testing at scale, and durable `identity.*` security events (identity still sends mail directly). `docs/DEPLOYMENT.md` describes the procedures, but none was performed.

## Model usage

- **codex `gpt-6.1-sol` medium:** all backend packages except learning; INT-3; P5-JOURNEY.
- **Claude Code Sonnet 5.5 medium:** P3-B-LEARNING. This used about 44% of the Claude plan limit, so it was not used again.
- **agy Claude Sonnet medium:** part of INT-2.
- **agy Gemini Flash medium:** all frontend work, the rest of INT-2, and P5-I.

Snapshots taken before each integration gate are in the session scratchpad.

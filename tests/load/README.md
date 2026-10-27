# LMS Load & Performance Test Suite

This directory contains k6 and Node.js benchmark scenarios to validate API performance, concurrency, and database row locking under load.

## Scenarios

1. **`catalog-browse.js`**:
   - Tests public catalog browsing, search keyword filtering, and pagination under 50 concurrent virtual users.
   - Thresholds: p95 < 200ms, error rate < 1%.
   - Run: `k6 run tests/load/catalog-browse.js`

2. **`lesson-heartbeat.js`**:
   - Simulates 100 concurrent active learners sending 15-second lesson watch heartbeats.
   - Thresholds: p95 < 150ms.
   - Run: `k6 run tests/load/lesson-heartbeat.js`

3. **`quiz-submission.js`**:
   - Simulates synchronized assessment attempt start, autosave, and submission spike at deadline.
   - Run: `k6 run tests/load/quiz-submission.js`

4. **`checkout-contention.js`**:
   - Stress-tests database row locks and contention during high-velocity coupon redemptions and scarce cohort seat reservations.
   - Run: `k6 run tests/load/checkout-contention.js`

5. **`autocannon-benchmarks.js`**:
   - Zero-dependency Node.js benchmark measuring baseline throughput (requests/second) and latency percentiles (p50, p95, p99) against core API endpoints (`/health`, `/auth/csrf`).
   - Run: `node tests/load/autocannon-benchmarks.js`

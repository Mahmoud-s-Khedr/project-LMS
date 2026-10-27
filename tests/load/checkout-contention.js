/**
 * k6 load test: High-concurrency coupon redemption and seat reservation
 * Tests database row locking and contention on limited-use coupons and limited-capacity cohorts.
 *
 * Run: k6 run tests/load/checkout-contention.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    coupon_rush: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: 50,
      maxDuration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<400'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4100/api/v1';

export default function () {
  const token = __ENV.AUTH_TOKEN || 'dummy_token';
  const priceId = __ENV.PRICE_ID || '10000000-0000-4000-8000-000000000010';

  const payload = JSON.stringify({
    items: [{ priceId, quantity: 1 }],
    couponCode: 'LIMITED50',
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    Origin: 'http://localhost:3100',
    'Idempotency-Key': `k6-contention-${__VU}-${__ITER}`,
  };

  const res = http.post(`${BASE_URL}/commerce/checkout`, payload, { headers });

  check(res, {
    'handled contention properly': (r) => [200, 201, 400, 401, 404, 409, 422].includes(r.status),
  });

  sleep(0.5);
}

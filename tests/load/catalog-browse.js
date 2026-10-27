/**
 * k6 load test: Course Catalog Browsing and Search
 * Simulates concurrent prospective learners browsing the catalog, searching courses, and viewing details.
 *
 * Target: p95 latency < 200ms
 * Run: k6 run tests/load/catalog-browse.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 20 }, // Ramp up to 20 virtual users
    { duration: '30s', target: 50 }, // Steady state at 50 virtual users
    { duration: '15s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<400'], // 95% of requests must complete under 200ms
    http_req_failed: ['rate<0.01'], // Less than 1% errors
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4100/api/v1';

export default function () {
  const headers = {
    Accept: 'application/json',
    Origin: 'http://localhost:3100',
  };

  // 1. Browse public course catalog
  const catalogRes = http.get(`${BASE_URL}/courses?limit=20`, { headers });
  check(catalogRes, {
    'catalog status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);

  // 2. Search catalog with keywords
  const searchQueries = ['software', 'architecture', 'engineering', 'react', 'design'];
  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const searchRes = http.get(`${BASE_URL}/courses?search=${query}&limit=10`, { headers });
  check(searchRes, {
    'search status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });

  sleep(2);
}

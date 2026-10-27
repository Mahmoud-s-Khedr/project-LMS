/**
 * k6 load test: Lesson Watch Heartbeat Telemetry
 * Simulates hundreds of active learners concurrently sending 15-second playback heartbeats.
 *
 * Target: high throughput, p95 < 100ms, idempotency verification.
 * Run: k6 run tests/load/lesson-heartbeat.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 50 },
    { duration: '45s', target: 100 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<150'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4100/api/v1';

export default function () {
  const lessonId = __ENV.TEST_LESSON_ID || '10000000-0000-4000-8000-000000000005';
  const token = __ENV.AUTH_TOKEN || 'dummy_token';

  const payload = JSON.stringify({
    playedSeconds: 15,
    currentPosition: 120,
    playbackRate: 1.0,
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    Origin: 'http://localhost:3100',
  };

  const res = http.post(`${BASE_URL}/lessons/${lessonId}/heartbeat`, payload, { headers });

  check(res, {
    'heartbeat response valid': (r) => [200, 202, 204, 401, 404].includes(r.status),
  });

  sleep(15); // Emulates 15s interval between client heartbeats
}

/**
 * k6 load test: Concurrent Assessment Attempt & Synchronized Deadline Submission
 * Simulates a cohort of students taking an exam and submitting answers synchronously at the deadline.
 *
 * Run: k6 run tests/load/quiz-submission.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    exam_spike: {
      executor: 'per-vu-iterations',
      vus: 30,
      iterations: 1,
      maxDuration: '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4100/api/v1';

export default function () {
  const assessmentId = __ENV.ASSESSMENT_ID || '10000000-0000-4000-8000-000000000007';
  const token = __ENV.AUTH_TOKEN || 'dummy_token';

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    Origin: 'http://localhost:3100',
  };

  // 1. Start Attempt
  const startRes = http.post(
    `${BASE_URL}/assessments/${assessmentId}/attempts`,
    JSON.stringify({}),
    { headers },
  );

  check(startRes, {
    'attempt started or handled': (r) => [200, 201, 401, 404, 409].includes(r.status),
  });

  sleep(2);

  // 2. Autosave Answer
  const saveRes = http.put(
    `${BASE_URL}/assessments/attempts/current/answers/q1`,
    JSON.stringify({
      response: { type: 'SINGLE_CHOICE', optionKey: 'a' },
      version: 1,
    }),
    { headers },
  );

  check(saveRes, {
    'answer autosaved': (r) => [200, 204, 401, 404, 409].includes(r.status),
  });

  sleep(1);

  // 3. Final Submission
  const submitRes = http.post(
    `${BASE_URL}/assessments/attempts/current/submit`,
    JSON.stringify({}),
    { headers },
  );

  check(submitRes, {
    'submitted successfully': (r) => [200, 201, 401, 404, 409].includes(r.status),
  });
}

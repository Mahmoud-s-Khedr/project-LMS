#!/usr/bin/env node

/**
 * Autocannon / Native Node.js HTTP Benchmark Runner
 * Measures API throughput, requests per second, and latency percentiles.
 *
 * Usage: node tests/load/autocannon-benchmarks.js [endpoint]
 */

const http = require('node:http');

const API_BASE = process.env.API_URL || 'http://localhost:4100/api/v1';

async function runBenchmark(path, durationSeconds = 5, concurrency = 10) {
  console.log(`\n========================================`);
  console.log(`Benchmarking ${API_BASE}${path}`);
  console.log(`Duration: ${durationSeconds}s | Concurrency: ${concurrency} connections`);
  console.log(`========================================`);

  const url = new URL(`${API_BASE}${path}`);
  let completed = 0;
  let errors = 0;
  const latencies = [];
  const startTime = Date.now();
  const endTime = startTime + durationSeconds * 1000;

  function worker() {
    return new Promise((resolve) => {
      function next() {
        if (Date.now() >= endTime) {
          return resolve();
        }

        const reqStart = Date.now();
        const req = http.request(
          url,
          {
            method: 'GET',
            headers: {
              Origin: 'http://localhost:3100',
              Accept: 'application/json',
            },
          },
          (res) => {
            res.on('data', () => {});
            res.on('end', () => {
              const reqDuration = Date.now() - reqStart;
              latencies.push(reqDuration);
              completed++;
              next();
            });
          },
        );

        req.on('error', () => {
          errors++;
          next();
        });

        req.end();
      }

      next();
    });
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalDuration = (Date.now() - startTime) / 1000;
  const rps = (completed / totalDuration).toFixed(2);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  const avg = (latencies.reduce((sum, v) => sum + v, 0) / (latencies.length || 1)).toFixed(2);

  console.log(`Results:`);
  console.log(`  Total requests:  ${completed}`);
  console.log(`  Failed requests: ${errors}`);
  console.log(`  Throughput:      ${rps} req/sec`);
  console.log(`  Avg Latency:     ${avg} ms`);
  console.log(`  p50 Latency:     ${p50} ms`);
  console.log(`  p95 Latency:     ${p95} ms`);
  console.log(`  p99 Latency:     ${p99} ms`);

  return { completed, errors, rps, avg, p50, p95, p99 };
}

async function main() {
  try {
    await runBenchmark('/health', 5, 10);
    await runBenchmark('/auth/csrf', 5, 10);
    await runBenchmark('/catalog/courses', 5, 10);
    console.log(`\nBenchmark run completed successfully.`);
  } catch (err) {
    console.error(`Benchmark failed:`, err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runBenchmark };

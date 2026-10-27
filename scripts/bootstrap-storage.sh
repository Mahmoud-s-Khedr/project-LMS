#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# MinIO implements CORS at server level rather than PutBucketCors.
docker compose exec -T minio sh -ec 'mc --config-dir /tmp/lms-bootstrap alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; mc --config-dir /tmp/lms-bootstrap admin config set local api cors_allow_origin=http://localhost:3100'
pnpm --filter @lms/api exec tsx bootstrap-storage.ts

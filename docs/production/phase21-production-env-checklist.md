# Phase 21 Production Environment Checklist

Generated: 2026-07-03

Document variable names only. Values must be configured in the Cloudflare dashboard, Wrangler secret storage, or secure CI/CD secret storage. Do not commit values to the repository.

## Frontend URL

- `HRM_PROD_FRONTEND_URL`

Expected production frontend URL: `https://hr.cafeasiana.com.mv`

## API URL

- `HRM_PROD_API_URL`

Expected production API URL: `https://hr.api.cafeasiana.com.mv`

## D1 Database Binding/Name

- Worker binding: `DB`
- Database name: `hrm-v2`
- Wrangler config path: `worker/wrangler.toml`

Do not commit Cloudflare account tokens or API tokens.

## R2 Binding/Bucket Label

- Worker binding: `DOCUMENTS_BUCKET`
- Bucket label/name: `hrm-v2-documents`

Do not expose R2 object keys or credentials to the frontend.

## Direct R2 Upload Config Names

- `HRM_DOCUMENT_UPLOAD_MODE`
- `HRM_DIRECT_R2_UPLOAD_PUBLIC_BASE_URL`
- `HRM_DIRECT_R2_UPLOAD_MAX_BYTES`
- `HRM_DIRECT_R2_UPLOAD_EXPIRES_SECONDS`
- `HRM_R2_CORS_ALLOWED_ORIGIN`

Direct upload secrets or signing credentials must remain server-side.

## Queue Mode Config Names

- `HRM_BACKGROUND_PROCESSING_MODE`
- `HRM_QUEUE_ENABLED`
- `HRM_QUEUE_NAME`
- `HRM_QUEUE_CONSUMER_ENABLED`
- Queue binding name configured in Worker environment, if enabled

D1 fallback mode must remain available when Queue binding is not configured.

## Live Event/SSE Config Names

- `HRM_LIVE_EVENTS_MODE`
- `HRM_LIVE_EVENTS_STREAM_ENABLED`
- `HRM_LIVE_EVENTS_HEARTBEAT_SECONDS`
- `HRM_LIVE_EVENTS_MAX_DURATION_SECONDS`
- `HRM_LIVE_EVENTS_POLL_INTERVAL_MS`

Tokens must be sent in headers, never query strings.

## Performance/Metrics Config Names

- `HRM_PERFORMANCE_METRICS_ENABLED`
- `HRM_PERFORMANCE_METRICS_SAMPLE_RATE`
- `HRM_PERFORMANCE_RETENTION_DAYS`
- `HRM_FRONTEND_METRICS_ENABLED`

Authenticated metrics endpoints must remain permission-protected and `private, no-store`.

## Backup/Restore Script Env Names

- `HRM_BACKUP_LIVE`
- `HRM_BACKUP_CONFIRM`
- `HRM_D1_BACKUP_OUTPUT_DIR`
- `HRM_R2_BACKUP_LIVE`
- `HRM_R2_BACKUP_CONFIRM`
- `HRM_R2_INVENTORY_OUTPUT_DIR`
- `HRM_RESTORE_DRY_RUN`
- `HRM_RESTORE_CONFIRM`

Backup dumps and R2 downloaded files must never be included in final ZIPs.

## Smoke/Load/E2E Test Env Names

- `HRM_TEST_AUTH_TOKEN`
- `HRM_ADMIN_TEST_AUTH_TOKEN`
- `HRM_PHASE21_TIMEOUT_MS`
- `HRM_PHASE21_STRICT_LIVE`
- `HRM_LOADTEST_CONCURRENCY`
- `HRM_LOADTEST_DURATION_SECONDS`
- `HRM_LOADTEST_MAX_REQUESTS`
- `HRM_PHASE21_ENABLE_UPLOAD_WRITE_TEST`
- `HRM_PHASE21_TEST_CASE_ID`
- `HRM_PHASE21_TEST_DOCUMENT_TYPE_ID`
- `HRM_PHASE21_ENABLE_TEST_JOB`

Production write tests are disabled by default. Enable write tests only with explicit Phase 21 flags and safe test records.

## Repository Safety

Do not commit:

- `.env`
- `.env.local`
- `.dev.vars`
- credential files
- backup dump files
- R2 downloaded files
- production report artifacts containing sensitive data

Allowed placeholder file:

- `.dev.vars.example`, only if values are placeholders.


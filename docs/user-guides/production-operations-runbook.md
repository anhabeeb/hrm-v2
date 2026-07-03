# Production Operations Runbook

## Deployment Checklist

1. Run typecheck, build, verifiers, smoke checks, local schema apply, and local seed apply.
2. Review ZIP cleanup and forward-slash paths.
3. Confirm D1 binding DB and R2 binding DOCUMENTS_BUCKET.
4. Confirm PBKDF2 remains 100000.

## Worker Deployment

Deploy the Worker only after local and remote schema readiness checks pass. Do not deploy code that references missing remote columns.

## Frontend Deployment

Deploy the frontend with index.html no-cache and hashed assets immutable. Purge stale cache if assets return text/html.

## Remote D1 Schema Audit and Additive Repair

Use: audit remote schema, generate repair, review generated SQL, apply generated repair, verify readiness, then apply schema/seed only when safe. Do not drop production tables or run destructive SQL.

## R2 Bucket Checks

Confirm DOCUMENTS_BUCKET exists, private storage is used, and raw R2 keys/private URLs are not exposed.

## Phase 18 Direct R2 Upload Checks

Direct browser uploads are optional. If enabled, confirm the environment has the Phase 18 presign settings configured in Cloudflare secrets/config, not in source. Run:

```bash
npm run verify:direct-r2-uploads-phase18
npm run verify:r2-cors-direct-upload-phase18
```

The Backup & Retention admin page shows the requested upload mode, active mode, whether direct upload is configured, fallback state, CORS check status, and TTL/max-size settings without showing secrets or presigned URLs. If CORS is not ready, leave `HRM_DOCUMENT_UPLOAD_MODE` as `auto` or `worker_proxy`.

## Phase 19 Live Event Stream Checks

Live app-event delivery is optional and controlled by `HRM_LIVE_EVENTS_ENABLED` and `HRM_LIVE_EVENTS_MODE`. The browser uses a fetch stream with Authorization headers, not tokenized URLs. Keep `/api/v1/app-events/since` polling fallback available.

Run:

```bash
npm run verify:sse-live-events-phase19
```

The Performance Observability page shows stream mode, stream endpoint availability, heartbeat and reconnect configuration, recent event count, D1 event backlog count, and cleanup status. If a proxy or browser blocks streaming, verify fallback polling is active before investigating deeper network issues.

## Backup and Rollback Reference

Keep deployment and data backup procedures outside source control. Roll back application deployment first; repair data only through reviewed additive scripts.

## Performance and E2E Checks

Use performance smoke checks, load test scripts, and E2E workflow scripts in safe source-validation or configured production mode.

## D1 Query Audit Operations

Run the D1 query audit before production deployment and after large backend changes:

```bash
npm run audit:d1-query-performance
npm run verify:d1-query-payload-optimization
npm run verify:d1-deferred-audit-remediation-phase20
```

Interpretation:

- HIGH means a priority route still needs source review for broad reads or unbounded lists.
- MEDIUM means a bounded, single-row, admin, or index-review finding still deserves follow-up.
- LOW is setup/internal review work.

Use `docs/performance/d1-query-audit-phase4.md` for the original audit model and `docs/performance/d1-deferred-audit-remediation-phase20.md` for the latest deferred cleanup status. Do not weaken the audit to make counts disappear. Document remaining HIGH findings with a source reason and future action.

## Cleanup Operations

Review metrics retention cleanup, background job cleanup, app event cleanup, report artifact expiry cleanup, and stale pending upload cleanup.

## Emergency Actions

For login/CORS, schema, or static asset emergencies, prefer targeted config or additive repair. Do not run git reset, destructive SQL, broad deletes, or secret-revealing commands in production.

## Phase 16 Backup, Restore, And Retention Operations

Use these commands in dry-run/source-validation mode before production operations:

```bash
npm run backup:create-manifest-phase16
npm run backup:d1-phase16
npm run restore:d1-dry-run-phase16
npm run backup:r2-inventory-phase16
npm run verify:r2-restore-readiness-phase16
```

Live D1 backup requires explicit environment confirmation and must write outside the source tree. Live restore is not a one-command browser action; restore into staging first, apply schema and seed, run smoke/E2E checks, then obtain operator approval.

The Backup & Retention admin page is available at `/settings/admin/backup-retention`. It shows backup readiness, policy status, dry-run cleanup results, recent cleanup jobs, and runbook links. Cleanup defaults to dry-run. Real cleanup requires the protected confirmation value `RUN_RETENTION_CLEANUP`.

Never auto-delete employee records, payroll records, audit/security logs, or active employee documents. Only temporary/performance/report artifact data should be eligible under Phase 16 policies.

## Phase 17 Background Processing and Queues

Cloudflare Queues are optional. D1 remains the source of truth for background jobs and the app falls back to the D1 runner if the Queue binding or feature flags are not configured. Review `docs/performance/cloudflare-queues-phase17.md` before enabling `BACKGROUND_JOB_QUEUE`.

Use:

```bash
npm run verify:cloudflare-queues-phase17
npm run verify:queue-readiness-phase17
npm run smoke:background-processing-phase17
npm run jobs:run-local-phase17
```

The Backup & Retention admin page shows Phase 17 queue/runner health. Queue messages contain safe job identifiers only; never send raw payloads, secrets, document numbers, payroll values, or private R2 object data.

## Phase 21 Live Deployment Verification

Use this order for final production verification:

```bash
npm run verify:phase21-remote-d1-live
npm run repair:phase21-generate-remote-d1
npm run smoke:phase21-production-live
npm run verify:phase21-frontend-deployment
npm run verify:phase21-r2-upload-live
npm run verify:phase21-background-processing-live
npm run verify:phase21-live-events-live
npm run verify:phase21-security-live
npm run loadtest:phase21-production-readonly
npm run report:phase21-go-no-go
```

Safe environment names are listed in `docs/production/phase21-production-env-checklist.md`. Values must be configured in Cloudflare or secure CI secret storage, not committed.

If live env vars are missing, Phase 21 scripts report `SOURCE READY / LIVE NOT VERIFIED`. Treat that as a warning, not a production GO.

If CORS fails, check `x-request-id`, `authorization`, `content-type`, `Vary: Origin`, and the production origin `https://hr.cafeasiana.com.mv`.

If remote D1 is blocked, verify Wrangler auth and Cloudflare D1 access, then rerun the remote schema verifier. Apply only reviewed additive repair SQL after a D1 backup.

If R2 upload fails, use worker-proxy fallback while direct R2 CORS/config is corrected.

If Queue mode is unavailable, verify D1 fallback mode.

If SSE stream fails, keep polling fallback active.

Do not create company records, seed production data, or run write tests unless an explicit safe Phase 21 test flag is set for a non-real test record.

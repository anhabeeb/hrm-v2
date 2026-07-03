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

## Backup and Rollback Reference

Keep deployment and data backup procedures outside source control. Roll back application deployment first; repair data only through reviewed additive scripts.

## Performance and E2E Checks

Use performance smoke checks, load test scripts, and E2E workflow scripts in safe source-validation or configured production mode.

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

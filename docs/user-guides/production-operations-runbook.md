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


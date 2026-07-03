# Phase 12 Backup and Rollback Runbook

This runbook documents safe production recovery steps. It does not include secrets, tokens, private keys, or account-specific credentials.

## D1 Backup / Export

1. From a trusted admin machine, confirm Wrangler authentication.
2. Export the remote D1 database before schema changes:

   ```bash
   npx wrangler d1 export hrm-v2 --remote --config worker/wrangler.toml --output backups/hrm-v2-YYYYMMDD.sql
   ```

3. Store backups in an approved secure location outside the repository.
4. Do not commit backup files to source control.

## D1 Schema Repair Safety

- Use `npm run audit:remote-schema` and `npm run verify:production-remote-schema-phase12` before repair.
- Generated repair SQL must be additive only.
- Safe repair statements are limited to `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and safe `ALTER TABLE ADD COLUMN`.
- Do not run repair files that contain `DROP`, destructive `DELETE`, or production data rewrites.
- Do not roll back expanded schema by dropping columns/tables after application code has used them.

## R2 Document Backup / Export Notes

- R2 document files are private and should be exported only from trusted tooling.
- Do not expose raw R2 keys or signed URLs in tickets, chat, or logs.
- Verify a sample non-sensitive object can be listed and read before maintenance.

## Runtime Data Cleanup Notes

- Report artifacts should expire through application retention logic.
- Performance metrics should be retained according to the Phase 11 retention settings.
- Background job and app event cleanup must be idempotent and must not delete business records.

## Worker Rollback

1. Inspect recent Worker deployments:

   ```bash
   npx wrangler deployments list --config worker/wrangler.toml
   ```

2. Roll back only code/runtime behavior. Do not roll back schema expansion by deleting D1 structures.
3. After rollback, run production smoke checks and inspect login/CORS behavior.

## Frontend Pages Rollback

1. Roll back to the previous known-good Pages deployment in Cloudflare.
2. Purge or bypass stale `index.html` cache if users still receive old asset references.
3. Verify `/assets/*` and `/brand/*` remain immutable and `/index.html` remains no-cache.

## Emergency CORS/Login Troubleshooting

- Confirm frontend origin is `https://hr.cafeasiana.com.mv`.
- Confirm API origin is `https://hr.api.cafeasiana.com.mv`.
- Confirm `Access-Control-Allow-Headers` includes `x-request-id` and `X-Request-Id`.
- Confirm OPTIONS preflight is answered before authentication.
- Confirm authenticated API responses remain `private, no-store`.

## Emergency Remote D1 Repair Checklist

- Run read-only audit first.
- Review generated SQL manually.
- Confirm repair is additive only.
- Apply from trusted CLI only.
- Re-run remote schema readiness verification.
- Re-run production smoke checks.

## Phase 16 Backup/Restore Expansion

- Generate a sanitized manifest with `npm run backup:create-manifest-phase16` before high-risk maintenance.
- Run `npm run backup:d1-phase16` in dry-run mode first, then use the documented confirmation variables only from a trusted admin machine.
- Run `npm run restore:d1-dry-run-phase16` before any live restore discussion. Do not restore live D1 from the browser or from the app UI.
- Run `npm run backup:r2-inventory-phase16` and `npm run verify:r2-restore-readiness-phase16` to validate R2 document backup readiness without downloading private files into the repository.
- The `/settings/admin/backup-retention` page is for readiness, dry-run cleanup, and retention policy visibility. It is not a live restore tool.

## Phase 16 Retention Guardrails

- Never auto-delete active employee documents, employee document versions, payroll periods, payroll runs, payroll results, leave requests, attendance records, roster assignments, employee master records, audit logs, or security logs.
- Safe cleanup targets are limited to operational data such as performance metrics, app events, stale background job events, expired report export artifacts, pending/failed upload sessions, and dashboard snapshots.
- Real cleanup requires the explicit `RUN_RETENTION_CLEANUP` confirmation and must be preceded by dry-run review.
- If a cleanup job fails, inspect the background job log and rerun dry-run before retrying real cleanup.

## Phase 21 Rollback Decision Points

- If CORS/login/bootstrap fails, roll back Worker or correct CORS allow headers before continuing.
- If remote D1 schema is blocked, do not deploy code that depends on missing schema.
- If additive repair is available, back up D1 and review the generated additive SQL before applying.
- If R2 upload fails, leave worker-proxy fallback enabled and disable direct R2 mode until configuration is corrected.
- If Queue mode is unavailable, keep D1 fallback mode active.
- If SSE streaming fails, keep polling fallback active.
- If frontend static assets return HTML or wrong MIME, roll back Pages deployment and purge stale index/cache.
- Do not seed production data as part of rollback or Phase 21 deployment verification.

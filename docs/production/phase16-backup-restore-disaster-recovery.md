# Phase 16 Backup, Restore, Disaster Recovery, and Retention Runbook

## Backup Goals

OmniCore - HR must be recoverable without exposing employee, payroll, document, or audit data unnecessarily. Backup tooling is safe by default, dry-run first, and CLI-controlled. The browser admin page is for readiness, policy visibility, dry-run cleanup, and background job tracking.

## What Data Must Be Protected

- D1 business data: employees, contracts, leave, attendance, roster, payroll, final settlement, approvals, documents metadata, audit logs, security logs, settings, users, roles, permissions, and access scopes.
- R2 files: employee official documents, profile photos, upload artifacts that are linked to active document records, and report artifacts that have not expired.
- Operational metadata: app events, background jobs, performance metrics, report export artifacts, upload sessions, and dashboard snapshots.

## D1 Database Backup Plan

Use `npm run backup:d1-phase16`.

Default behavior is dry-run/source validation. Live backup requires:

- `HRM_BACKUP_LIVE=true`
- `HRM_BACKUP_CONFIRM=BACKUP_D1`
- `HRM_BACKUP_ENV`
- `HRM_D1_DATABASE_NAME`
- `HRM_D1_BACKUP_OUTPUT_DIR`

Backup output should be outside the source tree and must not be placed in the clean ZIP.

## R2 Document/File Backup Plan

Use `npm run backup:r2-inventory-phase16`.

Default behavior is dry-run/source validation. Live inventory requires:

- `HRM_R2_BACKUP_LIVE=true`
- `HRM_R2_BACKUP_CONFIRM=BACKUP_R2_INVENTORY`
- `HRM_R2_BUCKET_NAME`

The script creates an inventory without downloading file contents. Object keys are hashed/redacted where practical.

## Report Artifact Retention

Report/export artifacts are generated files and can expire after the configured policy window. Cleanup marks expired artifacts and removes storage references from metadata where supported. Active HR records and official employee documents are not report artifacts.

## Performance Metrics Retention

Detailed API, frontend, and job metrics default to 30 days. These records are operational telemetry and can be cleaned safely after the retention window.

## Background Job Retention

Background job events default to 90 days. Terminal background jobs default to 180 days. Active queued/running jobs are never cleaned by the retention job.

Phase 17 may hand safe job identifiers to Cloudflare Queues, but D1 remains the source of truth. Retention cleanup jobs must still use the Phase 16 guarded cleanup utility, dry-run defaults, protected confirmation, and the D1 fallback runner if the Queue binding is unavailable.

## App Event Retention

Realtime/cache invalidation app events default to 30 days or their explicit expiry. These records are not business records.

## Upload Session Cleanup

Pending, failed, expired, or abandoned upload sessions default to 7 days. Cleanup updates stale session state and must never delete active employee document records or active document versions.

Phase 18 direct R2 browser uploads also use `document_upload_sessions`. Direct-uploaded objects without completed D1 document/version records are orphan candidates only after the upload session expires or fails. Compare `document_upload_sessions.upload_mode`, `document_upload_sessions.r2_key`, and `employee_document_versions.r2_key` during restore readiness; never delete active employee document objects automatically.

## Snapshot/Cache Cleanup

Dashboard summary snapshots default to 30 days when stale or expired. Attendance/payroll summary snapshots are disabled by default because they are business-adjacent summaries.

## Backup Frequency Recommendations

- Daily D1 backup before production use or payroll processing.
- Weekly R2 inventory at minimum.
- Before any schema repair, deployment, payroll close, or major import.
- Before and after large data migration.

## Restore Testing Procedure

1. Run `npm run restore:d1-dry-run-phase16`.
2. Restore into staging first.
3. Apply `database/schema.sql`.
4. Apply `database/seed.sql`.
5. Run remote schema readiness against staging.
6. Run production readiness smoke checks.
7. Verify Super Admin login, employee search, Employee 360, documents, payroll, self-service, reports, and notifications.
8. Verify R2 object references with `npm run verify:r2-restore-readiness-phase16`.

## Emergency Restore Procedure

1. Freeze production writes if possible.
2. Create a fresh backup of the current state.
3. Confirm incident scope and rollback-vs-restore choice.
4. Restore backup into staging.
5. Validate staging using the restore testing procedure.
6. Obtain operator approval.
7. Restore production using Cloudflare trusted CLI/operator process.
8. Apply schema and seed.
9. Run smoke checks and document the result.

## Rollback vs Restore Difference

Rollback means returning Worker/frontend deployment code to a previous version. Restore means replacing or rebuilding data from a backup. A deployment rollback does not restore deleted or corrupted D1/R2 data.

## What Must Never Be Deleted Automatically

- Employees and employee history.
- Payroll, bank loan, pension, final settlement, payslip, and payment records.
- Leave, attendance, roster, contracts, approvals, and document metadata.
- Active employee documents and document versions.
- Audit logs and security logs unless a specific admin policy is enabled and reviewed.

## What Can Be Cleaned Safely

- Expired report/export artifacts.
- Expired app events.
- Old performance metrics.
- Old background job events.
- Terminal background jobs after retention.
- Stale pending/failed document upload sessions.
- Expired dashboard summary snapshots.
- Temporary import preview rows if a future policy explicitly targets them.

## Production Safety Rules

- Dry-run first.
- No browser-based live D1 restore.
- No destructive SQL by default.
- No production file deletion by default.
- No secrets in docs, ZIPs, manifests, or logs.
- No public caching of authenticated HR data.
- Keep D1 binding `DB` and R2 binding `DOCUMENTS_BUCKET`.

## Required Environment Variables By Name Only

- `HRM_BACKUP_ENV`
- `HRM_D1_DATABASE_NAME`
- `HRM_D1_BACKUP_OUTPUT_DIR`
- `HRM_BACKUP_LIVE`
- `HRM_BACKUP_CONFIRM`
- `HRM_D1_RESTORE_BACKUP_FILE`
- `HRM_D1_RESTORE_MANIFEST_FILE`
- `HRM_R2_BUCKET_NAME`
- `HRM_R2_BACKUP_LIVE`
- `HRM_R2_BACKUP_CONFIRM`
- `HRM_DOCUMENT_UPLOAD_MODE`
- `HRM_R2_DIRECT_UPLOAD_ENABLED`
- `HRM_R2_PRESIGN_ENDPOINT`
- `HRM_R2_PRESIGN_ACCESS_KEY_ID`
- `HRM_R2_PRESIGN_SECRET_ACCESS_KEY`
- `HRM_R2_PRESIGN_BUCKET`
- `HRM_R2_PRESIGN_REGION`
- `HRM_R2_PRESIGN_URL_TTL_SECONDS`
- `HRM_R2_DIRECT_UPLOAD_MAX_BYTES`

## Dry-Run Mode

Run:

```bash
npm run backup:create-manifest-phase16
npm run backup:d1-phase16
npm run restore:d1-dry-run-phase16
npm run backup:r2-inventory-phase16
npm run verify:r2-restore-readiness-phase16
```

These commands must pass without Cloudflare credentials in source-validation mode.

## Staging Before Production

Always test restore and retention cleanup in staging. Production cleanup must use `confirm: "RUN_RETENTION_CLEANUP"` from the admin API and should be reviewed before running.

## Verify a Restored Environment

- Confirm schema readiness.
- Confirm seed compatibility.
- Confirm Owner/Super Admin login.
- Confirm R2 document download for authorized user.
- Confirm payroll and final settlement sensitive values remain permission-gated.
- Confirm self-service users can only access their own records.
- Confirm audit/security logs remain private.
- Run smoke and E2E workflow checks.

## Known Deferred Items

- Automated scheduled live backups are not enabled in Phase 16.
- Cloudflare Queue-based backup orchestration is deferred.
- R2 object copy/download automation is deferred to trusted operator tooling.
- Live production restore remains a manual Cloudflare/operator process.

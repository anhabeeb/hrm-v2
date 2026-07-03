# Phase 12 Production Readiness Checklist

Use this checklist before each production release of OmniCore - HR.

## Remote Data Readiness

- [ ] Remote D1 schema audit completed.
- [ ] Additive repair SQL reviewed if generated.
- [ ] Additive repair SQL applied only from a trusted CLI when needed.
- [ ] `database/schema.sql` applied after any schema expansion.
- [ ] `database/seed.sql` applied after permission/settings additions.
- [ ] R2 bucket `hrm-v2-documents` is available.
- [ ] R2 upload flow tested with a non-sensitive test document.

## Access, Security, and Modules

- [ ] CORS preflight verified with `x-request-id`.
- [ ] Login and bootstrap verified.
- [ ] Role permissions verified for Super Admin, HR/Admin, manager, and employee users.
- [ ] Module toggles verified in Settings.
- [ ] Disabled modules are hidden from navigation and direct routes are blocked.
- [ ] No authenticated HR API response is public cached.
- [ ] No env files, secrets, logs, build folders, or nested ZIPs are included in release ZIPs.

## Core HRM Workflows

- [ ] Onboarding workflow verified.
- [ ] Batch document upload verified.
- [ ] Payroll Cash/Bank Transfer validation verified.
- [ ] Background job drawer verified.
- [ ] App events/live invalidation verified.
- [ ] Reports/import/export verified.
- [ ] Performance dashboard verified.

## Deployment

- [ ] Frontend Pages deploy verified.
- [ ] Worker deploy verified.
- [ ] Frontend root and login page assets load.
- [ ] API health endpoint returns safe no-store readiness.
- [ ] Static assets return correct MIME and immutable cache headers.
- [ ] SPA fallback does not capture API/static asset paths.

## Backup and Rollback

- [ ] D1 backup/export completed before risky changes.
- [ ] R2 backup/export process verified.
- [ ] Worker rollback steps reviewed.
- [ ] Pages rollback steps reviewed.
- [ ] Emergency CORS/login checklist reviewed.

## Phase 16 Backup, Restore, and Retention

- [ ] Phase 16 backup manifest generated and reviewed.
- [ ] D1 backup script dry-run completed successfully.
- [ ] D1 restore dry-run report completed and reviewed before any restore procedure.
- [ ] R2 restore readiness and inventory dry-run completed without exposing private object keys.
- [ ] Retention cleanup dry-run reviewed from `/settings/admin/backup-retention`.
- [ ] Any real retention cleanup uses `RUN_RETENTION_CLEANUP` confirmation and is approved by an authorized admin.
- [ ] No backup dump, R2 downloaded object, env file, secret, log, or nested ZIP is included in the release ZIP.
- [ ] Active employee documents, payroll results, audit logs, and employee master records are confirmed excluded from automated cleanup targets.

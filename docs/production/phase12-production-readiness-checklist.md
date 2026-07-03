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

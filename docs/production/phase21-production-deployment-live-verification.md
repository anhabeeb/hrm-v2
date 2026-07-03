# Phase 21 Production Deployment and Live Verification

Generated: 2026-07-03

## Phase 21 Purpose

Phase 21 prepares OmniCore - HR for live production deployment on Cloudflare by adding safe live verification scripts, deployment documentation, and final go/no-go reporting.

This phase does not add HRM business features. It verifies deployment readiness, live environment behavior, schema readiness, and production safety.

## Accepted Baseline

Accepted source baseline: `HRM-v2-d1-deferred-audit-remediation-phase20-clean.zip`.

The company already exists, and production/reference data is already seeded. Do not create a company setup phase and do not seed production data during Phase 21.

There is no native mobile app scope in Phase 21. Only responsive web/mobile-browser behavior is verified.

## Deployment Targets

- Production frontend domain: `https://hr.cafeasiana.com.mv`
- Production API domain: `https://hr.api.cafeasiana.com.mv`
- Frontend platform: Cloudflare Pages or equivalent static frontend deployment
- API platform: Cloudflare Worker
- Database: Cloudflare D1 binding `DB`
- Documents bucket: Cloudflare R2 binding `DOCUMENTS_BUCKET`
- Background processing: Queue, D1 fallback, or hybrid mode depending on production configuration
- Live events: SSE/fetch-stream when enabled, polling fallback otherwise

## Pre-Deployment Checklist

- Confirm latest accepted source is used.
- Confirm `.env`, `.env.local`, `.dev.vars`, credentials, backup dumps, and downloaded R2 files are not included in ZIPs.
- Run local build/typecheck/verifiers.
- Run local D1 schema and seed apply.
- Confirm D1 and R2 binding names are unchanged.
- Confirm PBKDF2 remains 100000.
- Confirm no browser `alert()`, `confirm()`, or `prompt()` was added.
- Confirm authenticated HR API responses remain `private, no-store`.
- Confirm production/reference data already exists and no production seeding is planned.

## Remote D1 Schema Verification

Run:

```bash
npm run verify:phase21-remote-d1-live
```

The script compares local `database/schema.sql` with remote D1 in read-only mode. It writes:

- `docs/production/phase21-remote-d1-live-report.md`
- `docs/production/phase21-remote-d1-live-report.json`

Statuses:

- `PASS`: remote schema matches local expectations.
- `PASS WITH ADDITIVE REPAIR AVAILABLE`: missing tables, columns, or indexes were detected and additive repair SQL was generated.
- `BLOCKED`: Cloudflare/Wrangler credentials or remote access were unavailable, or remote schema could not be safely inspected.

## Safe Additive Repair Process

Generate repair SQL:

```bash
npm run repair:phase21-generate-remote-d1
```

Outputs:

- `docs/production/phase21-remote-d1-additive-repair.sql`
- `docs/production/phase21-remote-d1-repair-notes.md`

Safety rules:

- Back up D1 before repair.
- Run in staging first when possible.
- Review generated SQL before applying.
- Additive only: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and safe `ALTER TABLE ADD COLUMN`.
- Never drop, delete, rewrite, or seed production data.

## Worker/API Deployment Verification

After deploying the Worker, run:

```bash
npm run smoke:phase21-production-live
npm run verify:phase21-security-live
```

Checks include health, bootstrap, CORS preflight, protected route rejection, no-store headers, admin route protection, and authenticated read-only endpoints when tokens are provided.

## Frontend/Pages Deployment Verification

Run:

```bash
npm run verify:phase21-frontend-deployment
```

Checks include frontend root, login route, direct SPA route reloads, favicon/brand asset MIME, missing asset behavior, no-cache index HTML, and responsive web/mobile-browser route availability.

## CORS/Login/Bootstrap Live Checks

Run:

```bash
npm run smoke:phase21-production-live
```

The smoke script verifies preflight support for `x-request-id`, `authorization`, and `content-type`. It also checks bootstrap/status and protected route behavior.

If CORS fails:

- Verify `Access-Control-Allow-Headers` includes `x-request-id` and `X-Request-Id`.
- Verify `https://hr.cafeasiana.com.mv` is allowed.
- Verify `Vary: Origin` is set.
- Do not use wildcard origin with credentials.

## R2 Upload Live Checks

Run:

```bash
npm run verify:phase21-r2-upload-live
```

The default mode is safe and does not upload production documents. It verifies unauthenticated rejection, permission requirements, arbitrary key rejection, worker fallback availability, and direct R2 mode source readiness.

Live upload write testing requires:

- `HRM_PHASE21_ENABLE_UPLOAD_WRITE_TEST=true`
- `HRM_PHASE21_TEST_CASE_ID`
- `HRM_PHASE21_TEST_DOCUMENT_TYPE_ID`
- `HRM_TEST_AUTH_TOKEN`

Do not upload real employee documents during Phase 21 verification.

## Queue/D1 Fallback Live Checks

Run:

```bash
npm run verify:phase21-background-processing-live
```

The script verifies protected job endpoints, admin-safe read behavior, and D1/Queue/hybrid source readiness. It does not create production jobs by default.

If Queue mode is unavailable, confirm D1 fallback mode remains active and no secrets are exposed by status responses.

## SSE/Polling Fallback Live Checks

Run:

```bash
npm run verify:phase21-live-events-live
```

The script verifies `/api/v1/app-events/since`, `/api/v1/app-events/stream`, no query-string token use, no-store headers, and polling fallback. If streaming cannot be tested in the environment, the report marks it as skipped instead of false PASS.

## Smoke Test Execution

Run:

```bash
npm run smoke:phase21-production-live
```

Without auth tokens, only safe public and unauthenticated checks run. With `HRM_TEST_AUTH_TOKEN`, authenticated read-only checks run. With `HRM_ADMIN_TEST_AUTH_TOKEN`, admin-safe checks can be included.

## Read-Only Load Test Execution

Run:

```bash
npm run loadtest:phase21-production-readonly
```

Default behavior is low-concurrency read-only. It must not create, update, delete, upload, import, export, or seed production data.

Recommended thresholds:

- common read p95 under 750ms
- critical p95 under 2000ms
- error rate under 1%
- no CORS failures
- no 500s on normal read paths

## Security/Admin Live Verification

Run:

```bash
npm run verify:phase21-security-live
```

The script verifies protected route rejection, admin/normal token behavior when provided, private/no-store headers, no wildcard origin with credentials, and request-id CORS support.

## Backup/Restore Readiness Confirmation

Before final go/no-go:

```bash
npm run backup:create-manifest-phase16
npm run backup:d1-phase16
npm run restore:d1-dry-run-phase16
npm run backup:r2-inventory-phase16
npm run verify:r2-restore-readiness-phase16
```

These remain dry-run/source-safe unless explicit production backup environment variables are configured.

## Rollback Procedure

1. Keep the previous Worker deployment available.
2. Keep the previous frontend Pages deployment available.
3. If API deployment fails, roll back Worker first.
4. If frontend asset/MIME issues appear, roll back Pages deployment and purge stale index/cache as needed.
5. If remote D1 schema is blocked, do not apply app code that requires missing schema.
6. If additive repair is needed, back up D1 first and apply only reviewed additive SQL.
7. If R2 upload fails, use worker-proxy fallback and disable direct mode until CORS/config is corrected.
8. If Queue mode fails, use D1 fallback mode.
9. If SSE stream fails, use polling fallback.

## Go/No-Go Checklist

Run:

```bash
npm run report:phase21-go-no-go
```

Decision meanings:

- `GO`: all live reports pass.
- `GO WITH WARNINGS`: live checks are source-ready but some live env values were missing, skipped, or additive repair is available.
- `NO-GO`: required reports are missing, blocked, or have failures.

## Post-Deployment Monitoring

- Watch Worker logs for 500s, D1 errors, R2 upload failures, Queue errors, and stream fallback events.
- Watch frontend console for chunk/MIME/cache errors.
- Monitor health, bootstrap, auth/session, Command Center, notifications, onboarding workspace, documents, and payroll read paths.
- Review performance and background job dashboards.
- Confirm no unexpected public cache headers on authenticated API responses.

## Final Sign-Off Checklist

- Remote D1 schema verified or documented as blocked.
- Additive repair reviewed and applied only if needed.
- Worker/API deployed and smoke checks passed.
- Frontend deployment verified.
- CORS/login/bootstrap verified.
- R2 upload mode verified.
- Queue/D1 fallback verified.
- SSE/polling fallback verified.
- Security/admin checks passed.
- Read-only load test completed.
- Backup/restore readiness confirmed.
- Go/no-go report generated.
- No production seeding performed.
- No native mobile app work added.


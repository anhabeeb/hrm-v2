# Troubleshooting Guide

## Login or CORS Issue

Check allowed production origin, credentials behavior, and allowed headers. The x-request-id preflight header must be allowed by CORS.

## Static Assets Returning HTML

Ensure index.html is no-cache and hashed assets are immutable. Purge or refresh deployment cache if a stale index references deleted CSS/JS.

## Disabled Module Not Visible

Check main module toggle, submodule toggle, permission, and direct route blocking. Settings may remain visible for authorized users.

## Search Missing Optional Records

Global search and optional sections filter disabled modules and permissions. Enable the module or grant permission if the record should be visible.

## Attendance Disabled and Payroll

Payroll must not use Attendance data while Attendance is disabled. Use manual payroll adjustments or imports if deductions are required.

## Document Upload Failed

Review row-level status, metadata, file type, file size, document type rule, local/foreign eligibility, and Retry. Do not re-upload repeatedly without checking duplicate rules.

## Background Job Stuck

Check job drawer, retry count, last error, and performance dashboard. Retry only if safe.

## Report Export Not Ready

Large exports run in background. Wait for the artifact status or retry if the job failed.

## Import Validation Errors

Open validation preview, fix row-level errors, upload a corrected file, and apply only valid rows.

## Remote D1 Schema Mismatch

Run remote schema audit/generate/review/apply flow. Use additive repairs only. Do not run destructive SQL or drop production tables from the browser.

## Missing D1 Table, Column, or Index

Generate additive repair SQL after audit confirms the missing object. Review before applying remotely.

## R2 Upload or Object Issue

Check R2 bucket binding, upload status, object existence, and cleanup logs. Do not expose raw R2 keys or private object URLs.

## Direct R2 Upload CORS Issue

If direct document upload rows fail immediately with a browser CORS or network error, confirm the app can fall back to Worker proxy mode, then run `npm run verify:r2-cors-direct-upload-phase18`. The R2 bucket CORS policy must allow the production origin `https://hr.cafeasiana.com.mv`, method `PUT`, header `content-type`, any signed checksum headers in use, and should expose `ETag`. Do not paste presigned URLs, signed headers, or R2 keys into support tickets.

## Expired Direct Upload URL

Direct upload URLs are short-lived. Use the row Retry action so the app prepares a new upload session and URL. Do not retry an old URL manually.

## No Notifications

Check Notification module, rules, routing scope, receive permissions, and alert severity permissions.

## Live Events or Background Refresh Delayed

Check Performance Observability > Live event stream health. If the stream is blocked by auth, CORS, proxy buffering, or browser support, the app should show fallback polling and continue refreshing. Do not put auth tokens in event stream URLs. Confirm CORS allows `Authorization`, `Accept`, `X-Request-ID`, and `Last-Event-ID`.

## Self-Service Account Not Linked

Link the user to an active employee profile and confirm self-service permissions.

## Role or Permission Denied

Review role permissions, role mapping, access scopes, protected Super Admin rules, and module disabled state.

## Popup or Layout Overflow

Use supported browsers, refresh stale assets, and report the page/modal where overflow occurs.

## Phase 21 Live Verification Troubleshooting

### CORS fails on login/bootstrap

- Confirm `Access-Control-Allow-Headers` includes `x-request-id`, `X-Request-Id`, `authorization`, and `content-type`.
- Confirm `https://hr.cafeasiana.com.mv` is allowed.
- Confirm `Vary: Origin` is set.
- Do not use wildcard origin with credentials.
- Run `npm run smoke:phase21-production-live`.

### Remote D1 schema verification is blocked

- Confirm Wrangler is authenticated.
- Confirm the D1 binding/name still points to `hrm-v2`.
- Run `npm run verify:phase21-remote-d1-live`.
- If additive repair is available, review `docs/production/phase21-remote-d1-additive-repair.sql` and back up D1 before applying.

### R2 upload verification fails

- Confirm the `DOCUMENTS_BUCKET` binding is present.
- Confirm direct R2 mode config only if direct uploads are enabled.
- Keep worker-proxy fallback available.
- Do not upload real employee documents for Phase 21 testing.

### Queue mode is unavailable

- Confirm background processing mode.
- Verify D1 fallback remains active.
- Run `npm run verify:phase21-background-processing-live`.

### SSE stream fails

- Confirm `/api/v1/app-events/since` polling fallback works.
- Confirm tokens are sent in Authorization headers, not query strings.
- Run `npm run verify:phase21-live-events-live`.

### Frontend assets return HTML

- Confirm Pages headers keep index HTML no-cache.
- Confirm hashed assets use immutable cache.
- Roll back or redeploy frontend and purge stale cache if needed.

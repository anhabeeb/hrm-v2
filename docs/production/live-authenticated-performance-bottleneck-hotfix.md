# Live Authenticated Performance Bottleneck Hotfix

Generated: 2026-07-05

## Baseline Live Timings

| Endpoint | Baseline | Target | Status before hotfix |
| --- | ---: | ---: | --- |
| Login API | 4.5s | <2s | Warning |
| Current user/session | 3.5s | <1.5s | Warning |
| Bootstrap/status | 0.6s | <2s | Pass |
| Command Center summary | 4.2s | <2s | Warning |
| Employee list first page | >15s timeout | <2s | Fail |
| Onboarding case list first page | 5.0s | <2s | Warning |
| Notification unread-count | 3.9s | <1s | Warning |
| App-events since | 4.0s | <1s | Warning |
| App-events stream status | 3.0s | <1s | Warning |
| Payment institutions optional 403 | 9.9s | <500ms | Warning |
| Pension schemes optional 403 | 9.4s | <500ms | Warning |
| App-events CORS preflight | 21ms | <1s | Pass |
| App-events stream connection | 3.6s | <1s | Warning |

## Root Causes

- Employee list was using a broad employee row select and extra list-time joins, making the first paginated page behave more like a detail payload than a list payload.
- Onboarding case list was still selecting all case columns even though the list only needs summary fields.
- Optional payroll foundation endpoints checked module/submodule settings before denying users that lacked route permissions, so a 403 still paid the module/settings query cost.
- Login/session work blocked on non-critical audit/session-touch writes and serial session enrichment.
- Notification unread-count loaded notification rows and filtered them instead of using a direct unread count query.
- App-events polling repeated module-enabled checks per event row.

## Changes Made

- Employee list now uses server pagination, selected list columns only, and explicit D1 timing marker `employees.list.lightweight`.
- Onboarding case list now uses selected summary columns only and D1 timing marker `onboarding.cases.list.lightweight`.
- Payroll payment institution and pension scheme routes now short-circuit unauthorized requests before submodule/settings checks.
- Login audit logging and session last-seen updates are deferred with `executionCtx.waitUntil`.
- Session role/permission/linked employee enrichment is parallelized before module visibility is derived.
- Notification unread-count now uses direct `COUNT(*)` queries and the schema includes `idx_notifications_read_created` for the admin unread path.
- App-events polling batches module visibility checks per response batch.
- Endpoint timing now includes grouped `Server-Timing` stages for auth, permission, D1, optional work, serialization, and session where used.
- Live authenticated verifier now reports previous timing, current timing, delta, and a `Production Bottlenecks Remaining` section.

## Deferred Items

- Command Center semantics were not rewritten in this hotfix. It already uses dashboard snapshots and stale-background refresh where snapshots exist; first-run cache misses can still require live summary generation.
- No production schema repair or seed was run by this hotfix. The additive unread-count index is represented in `database/schema.sql` and will be detected by the remote schema audit/generator.
- No production write/save verification is enabled by default.

## How To Rerun

Use environment variables only. Do not hardcode credentials:

```bash
HRM_PROD_FRONTEND_URL=https://hr.cafeasiana.com.mv \
HRM_PROD_API_URL=https://hr.api.cafeasiana.com.mv \
HRM_LIVE_LOGIN_EMAIL=... \
HRM_LIVE_LOGIN_PASSWORD=... \
npm run verify:live-authenticated-performance
```

Optional onboarding detail read check:

```bash
HRM_LIVE_TEST_CASE_ID=onboarding_case_... npm run verify:live-authenticated-performance
```

Production writes remain disabled unless `HRM_LIVE_ENABLE_SAVE_TEST=true` and the explicit write confirmation environment variable is provided.

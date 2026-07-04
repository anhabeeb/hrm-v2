# Live Authenticated Performance Report

Generated: 2026-07-04T23:48:26.334Z

Frontend URL: https://hr.cafeasiana.com.mv

API URL: https://hr.api.cafeasiana.com.mv

Overall status: **WARNING**

Credentials: provided through environment variables

Save test: SKIPPED - `HRM_LIVE_ENABLE_SAVE_TEST` is not true.

No password, bearer token, session token, response body, or sensitive HR/payroll/document data is written to this report.

## Live Measurements

| Status | Check | HTTP | Duration ms | Threshold ms | Previous ms | Delta ms | Detail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WARNING | Login API | 200 | 2653 | 2000 | 4500 | -1847 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=2424, d1;dur=0, d1-count;desc="0" |
| PASS | Current user/session | 200 | 687 | 1500 | 3500 | -2813 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=652, d1;dur=0, d1-count;desc="0", auth;dur=315, session;dur=337 |
| PASS | Bootstrap/status | 200 | 625 | 2000 | 600 | 25 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=598, d1;dur=0, d1-count;desc="0" |
| PASS | Command Center summary | 200 | 985 | 2000 | 4200 | -3215 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=931, d1;dur=624, d1-count;desc="1", auth;dur=307, session;dur=0 |
| WARNING | Employee list | 200 | 2507 | 2000 | 15000 | -12493 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=2471, d1;dur=315, d1-count;desc="1", auth;dur=2156, session;dur=0, permission;dur=0, serialization;dur=0 |
| PASS | Onboarding case list | 200 | 1294 | 2000 | 5000 | -3706 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=1266, d1;dur=347, d1-count;desc="1", auth;dur=315, session;dur=0, permission;dur=0 |
| PASS | Notification unread-count | 200 | 988 | 1000 | 3900 | -2912 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=955, d1;dur=305, d1-count;desc="1", auth;dur=313, session;dur=337 |
| PASS | App events since | 200 | 675 | 1000 | 4000 | -3325 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=620, d1;dur=0, d1-count;desc="0", auth;dur=305, session;dur=0 |
| PASS | App events stream status | 200 | 340 | 1000 | 3000 | -2660 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=312, d1;dur=0, d1-count;desc="0", auth;dur=312, session;dur=0 |
| WARNING | Payment institutions optional direct endpoint | 403 | 3386 | 500 | 9900 | -6514 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=3357, d1;dur=0, d1-count;desc="0", auth;dur=607, session;dur=0 |
| WARNING | Pension schemes optional direct endpoint | 403 | 3753 | 500 | 9400 | -5647 | cache=private, no-store type=application/json request-id=present server-timing=app;dur=3723, d1;dur=0, d1-count;desc="0", auth;dur=614, session;dur=350 |
| PASS | App events stream CORS preflight | 204 | 21 | 1000 | 21 | 0 | cors-origin=https://hr.cafeasiana.com.mv allow-headers=present cache=none server-timing=none |
| PASS | App events stream connection attempt | 200 | 352 | 1000 | 3600 | -3248 | cors-origin=https://hr.cafeasiana.com.mv allow-headers=present cache=private, no-store server-timing=app;dur=300, d1;dur=0, d1-count;desc="0", auth;dur=300, session;dur=0 |
| WARNING | Onboarding workspace open | 200 | 6021 | 3000 | - | - | cache=private, no-store type=application/json request-id=present server-timing=app;dur=5965, d1;dur=1366, d1-count;desc="6", auth;dur=308, session;dur=0 |
| PASS | Onboarding workspace core employee/case payload | - | 6021 | 3000 | - | - | Checks case/employee objects in workspace payload. |
| PASS | Onboarding workspace documents section payload | - | 6021 | 3000 | - | - | Checks documents/document checklist slice availability. |
| WARNING | Onboarding workspace payroll/payment section payload | - | 6021 | 3000 | - | - | Checks payroll/payment/pension slice availability. |
| PASS | Onboarding workspace readiness payload | - | 6021 | 3000 | - | - | Checks readiness slice availability. |
| PASS | Onboarding workspace does not depend on optional sections for core payload | - | 6021 | 3000 | - | - | Core payload presence is treated as display-first signal. |
| PASS | Onboarding readiness status | 200 | 2878 | 3000 | - | - | cache=private, no-store type=application/json request-id=present server-timing=app;dur=2842, d1;dur=0, d1-count;desc="0", auth;dur=301, session;dur=1253 |
| WARNING | Onboarding save-status endpoint | 200 | 2837 | 2000 | - | - | cache=private, no-store type=application/json request-id=present server-timing=app;dur=2810, d1;dur=0, d1-count;desc="0", auth;dur=305, session;dur=0 |
| PASS | Authenticated API cache safety | - | - | - | - | - | No public cache marker was observed in measured authenticated API rows. |

## Production Bottlenecks Remaining

- Login API: WARNING at 2653ms (target 2000ms, delta -1847ms).
- Employee list: WARNING at 2507ms (target 2000ms, delta -12493ms).
- Payment institutions optional direct endpoint: WARNING at 3386ms (target 500ms, delta -6514ms).
- Pension schemes optional direct endpoint: WARNING at 3753ms (target 500ms, delta -5647ms).

## Source Safeguards

| Status | Check | HTTP | Duration ms | Threshold ms | Previous ms | Delta ms | Detail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PASS | Save-status reconciliation path exists | - | - | - | - | - | Frontend API and Worker endpoint markers checked. |
| PASS | Save timeout reconciliation UI path exists | - | - | - | - | - | Timeout handling checks save-status before asking user to retry. |
| PASS | Readiness terminal and transitional states are represented | - | - | - | - | - | Ready, blocked, refreshing, stale, and failed state markers checked. |
| PASS | Optional onboarding sections expose retry/state handling | - | - | - | - | - | Optional section state and retry markers checked. |
| PASS | Payment institutions preload is permission/module gated | - | - | - | - | - | Preload guard prevents unauthorized optional preload spam. |
| PASS | Request id header is preserved for app-events/CORS | - | - | - | - | - | Frontend stream client and Worker CORS allow-list checked. |
| PASS | No browser alert/confirm/prompt in touched verification areas | - | - | - | - | - | Static source scan. |
| PASS | No dark mode markers introduced | - | - | - | - | - | Static source scan. |

## Notes

- Live write/save checks are disabled unless `HRM_LIVE_ENABLE_SAVE_TEST=true` is set.
- When save testing is enabled, use a dedicated test onboarding case only.
- Thresholds: login and Command Center under 2 seconds; current session under 1.5 seconds; employee/onboarding first pages under 2 seconds; unread/app-events under 1 second; optional 403 responses under 500ms; workspace core under 3 seconds.

# Live Authenticated Performance Report

Generated: 2026-07-04T23:02:44.017Z

Frontend URL: https://hr.cafeasiana.com.mv

API URL: https://hr.api.cafeasiana.com.mv

Overall status: **FAIL**

Credentials: provided through environment variables

Save test: SKIPPED - `HRM_LIVE_ENABLE_SAVE_TEST` is not true.

No password, bearer token, session token, response body, or sensitive HR/payroll/document data is written to this report.

## Live Measurements

| Status | Check | HTTP | Duration ms | Threshold ms | Detail |
| --- | --- | --- | --- | --- | --- |
| WARNING | Login API | 200 | 4526 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | Current user/session | 200 | 3520 | 2000 | cache=private, no-store type=application/json request-id=present |
| PASS | Bootstrap/status | 200 | 637 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | Command Center summary | 200 | 4226 | 2000 | cache=private, no-store type=application/json request-id=present |
| FAIL | Employee list | ERR | 15016 | 2000 | This operation was aborted |
| WARNING | Onboarding case list | 200 | 4997 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | Notification unread-count | 200 | 3941 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | App events since | 200 | 3980 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | App events stream status | 200 | 3012 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | Payment institutions optional direct endpoint | 403 | 9889 | 2000 | cache=private, no-store type=application/json request-id=present |
| WARNING | Pension schemes optional direct endpoint | 403 | 9424 | 2000 | cache=private, no-store type=application/json request-id=present |
| PASS | App events stream CORS preflight | 204 | 21 | 2000 | cors-origin=https://hr.cafeasiana.com.mv allow-headers=present cache=none |
| WARNING | App events stream connection attempt | 200 | 3648 | 2000 | cors-origin=https://hr.cafeasiana.com.mv allow-headers=present cache=private, no-store |
| SKIPPED | Onboarding workspace detail | - | - | - | `HRM_LIVE_TEST_CASE_ID` was not provided. |
| PASS | Authenticated API cache safety | - | - | - | No public cache marker was observed in measured authenticated API rows. |

## Source Safeguards

| Status | Check | HTTP | Duration ms | Threshold ms | Detail |
| --- | --- | --- | --- | --- | --- |
| PASS | Save-status reconciliation path exists | - | - | - | Frontend API and Worker endpoint markers checked. |
| PASS | Save timeout reconciliation UI path exists | - | - | - | Timeout handling checks save-status before asking user to retry. |
| PASS | Readiness terminal and transitional states are represented | - | - | - | Ready, blocked, refreshing, stale, and failed state markers checked. |
| PASS | Optional onboarding sections expose retry/state handling | - | - | - | Optional section state and retry markers checked. |
| PASS | Payment institutions preload is permission/module gated | - | - | - | Preload guard prevents unauthorized optional preload spam. |
| PASS | Request id header is preserved for app-events/CORS | - | - | - | Frontend stream client and Worker CORS allow-list checked. |
| PASS | No browser alert/confirm/prompt in touched verification areas | - | - | - | Static source scan. |
| PASS | No dark mode markers introduced | - | - | - | Static source scan. |

## Notes

- Live write/save checks are disabled unless `HRM_LIVE_ENABLE_SAVE_TEST=true` is set.
- When save testing is enabled, use a dedicated test onboarding case only.
- Thresholds: login, command center, employee list, and onboarding case list under 2 seconds; workspace core under 3 seconds.

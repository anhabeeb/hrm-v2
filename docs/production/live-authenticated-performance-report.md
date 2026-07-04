# Live Authenticated Performance Report

Generated: 2026-07-04T22:16:40.475Z

Frontend URL: https://hr.cafeasiana.com.mv

API URL: https://hr.api.cafeasiana.com.mv

Overall status: **SKIPPED**

Credentials: not provided; live authenticated checks skipped

Save test: SKIPPED - live credentials were not provided.

No password, bearer token, session token, response body, or sensitive HR/payroll/document data is written to this report.

## Live Measurements

| Status | Check | HTTP | Duration ms | Threshold ms | Detail |
| --- | --- | --- | --- | --- | --- |
| SKIPPED | Authenticated live verification | - | - | - | Missing environment variables: HRM_PROD_FRONTEND_URL, HRM_PROD_API_URL, HRM_LIVE_LOGIN_EMAIL, HRM_LIVE_LOGIN_PASSWORD |

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

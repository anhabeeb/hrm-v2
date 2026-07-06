# Live Employee 360 Setup Rollout Report

Status: WARNING
Generated: 2026-07-06T08:44:35.586Z

| Status | Check | HTTP | Duration ms | Detail |
| --- | --- | --- | --- | --- |
| SKIPPED | Live environment | - | - | Set HRM_PROD_FRONTEND_URL, HRM_PROD_API_URL, HRM_LIVE_LOGIN_EMAIL, and HRM_LIVE_LOGIN_sensitive value to run live verification. |

Safety notes:

- Credentials are read from environment variables only.
- Passwords and tokens are never printed.
- no production activation is attempted by this verifier.
- Final verification is not run unless HRM_LIVE_ENABLE_FINAL_VERIFICATION_WRITE=true.
- Activation is never called by this verifier.

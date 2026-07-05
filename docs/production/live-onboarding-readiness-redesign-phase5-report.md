# Onboarding Readiness Redesign Phase 5 Live Verification Report

Generated: 2026-07-05T19:14:05.468Z

Frontend URL: https://hr.cafeasiana.com.mv

API URL: https://hr.api.cafeasiana.com.mv

Case ID: onboarding_case_25a0b51e-fa39-426a-a07b-ab11b1b56dfc

Overall status: **WARNING**

Live checks: **WARNING**

Source/schema safeguards: **PASS**

No passwords, bearer tokens, session tokens, raw response bodies, document numbers, payroll values, bank account numbers, or SQL details are written to this report.

## Live Verification

| Status | Check | HTTP | Duration ms | Detail |
| --- | --- | --- | --- | --- |
| SKIPPED | Authenticated live onboarding readiness verification | - | - | Missing env: HRM_PROD_FRONTEND_URL, HRM_PROD_API_URL, HRM_LIVE_LOGIN_EMAIL, HRM_LIVE_LOGIN_sensitive value, HRM_LIVE_TEST_CASE_ID. No live login, write, or activation checks were run. |

## Source And Schema Safeguards

| Status | Check | HTTP | Duration ms | Detail |
| --- | --- | --- | --- | --- |
| PASS | Phase 5 package script registered | - | - | package.json script marker checked. |
| PASS | Section-status additive schema present in schema.sql | - | - | missing columns=none missing indexes=none |
| PASS | Fast section-readiness endpoints exist | - | - | section-readiness, readiness-status, and refresh-readiness route markers checked. |
| PASS | Final verification supports read-only dry-run | - | - | dry_run=1 route marker checked. |
| PASS | Dry-run verifier is read-only | - | - | Dry-run helper avoids schema creation and status writes. |
| PASS | Activation cannot bypass final verifier | - | - | Activation/submission path checks final verification, not candidate readiness. |
| PASS | Readiness status avoids full workspace reload | - | - | readiness-status source marker checked. |
| PASS | Old readiness jobs recover from stale running state | - | - | Background job stale recovery markers checked. |
| PASS | Frontend final verification API helper remains present | - | - | API helper marker checked. |
| PASS | D1/R2 bindings unchanged | - | - | wrangler.toml binding markers checked. |
| PASS | PBKDF2 remains 100000 | - | - | sensitive value helper marker checked. |
| PASS | No browser prompts or dark mode introduced | - | - | Source markers checked. |

## Notes

- No additional notes.

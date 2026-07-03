# Phase 13 E2E HRM Workflow Run Results

Generated: 2026-07-03T16:13:49.269Z

Environment:
- API URL provided: no
- Frontend URL provided: no
- Auth token provided: no
- Company id provided: no
- Mode: READ-ONLY
- Test prefix: E2E-P13

Summary:
- Passed: 17
- Failed: 0
- Warnings: 0
- Skipped: 2

| Status | Scenario / Check | Detail |
| --- | --- | --- |
| PASS | Phase 13 runner loaded | End-to-end HRM workflow validation script is available. |
| PASS | Read-only mode default confirmed | Writes are disabled by default. |
| PASS | Scenario guide exists |  |
| PASS | Manual UI checklist exists |  |
| SKIP | Write scenarios | Read-only mode is the default. Set HRM_E2E_ENABLE_WRITES=true to run write scenarios in a safe test tenant. |
| PASS | Local employee onboarding scenario exists | Validates configured Any/Local document rules without hardcoding requirements. |
| PASS | Foreign employee onboarding scenario exists | Validates foreign-only Visa/Work Permit behavior and common Any-scope rules. |
| PASS | Document batch upload scenario exists | Covers onboarding batch upload, row-level progress, retry, and readiness refresh. |
| PASS | Payroll Cash and Bank Transfer scenario exists | Validates Cash without bank details and Bank Transfer with active institution/account validation. |
| PASS | Activation, user account linking, and self-service scenario exists | Covers readiness-gated activation, linking/provisioning, and active employee self-service enforcement. |
| PASS | Attendance, leave, and payroll integrated scenario exists | Covers attendance-enabled and attendance-disabled operational behavior. |
| PASS | Offboarding scenario exists | Covers optional disabled module clearance and server-side finalization validation. |
| PASS | Disabled-module scenario exists | Covers sidebar, direct route, backend API, onboarding/offboarding, search, reports, notifications, and Settings behavior. |
| PASS | Permission/security scenario exists | Covers role-gated admin pages, scoped app events/jobs/artifacts, and sensitive payroll/report access. |
| PASS | Reports, import, and export scenario exists | Covers background report/export/import jobs, artifact permissions, and targeted invalidation. |
| PASS | Performance systems scenario exists | Covers cache, workspace page-load reduction, app events, upload progress, background jobs, and safe metrics. |
| PASS | Authenticated HR API responses remain private/no-store | Preserves Phase 12 no-store behavior for authenticated data. |
| PASS | Frontend avoids browser alert/confirm/prompt | Global popup alerts remain the workflow notification path. |
| SKIP | Live target checks | No HRM_E2E_API_URL or HRM_E2E_FRONTEND_URL was provided; running dry-run/source validation only. |

Notes:
- Read-only/source validation mode is the default.
- Write scenarios are skipped unless `HRM_E2E_ENABLE_WRITES=true`.
- Production writes additionally require `HRM_E2E_ALLOW_PRODUCTION_WRITES=true`.
- No credentials, tokens, document numbers, salary values, or sensitive response bodies are written to this report.

# One-Case Onboarding to Employee 360 Verification

Status: WARNING
Generated: 2026-07-06T08:44:35.576Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Package script registered | verify:one-case-onboarding-to-employee360 |
| PASS | Migration supports one case or one employee | script markers checked |
| PASS | Employee setup queue endpoint exists | /api/v1/employees/setup |
| PASS | Legacy onboarding route redirects to Employee 360 setup | frontend route markers checked |
| PASS | Sidebar points to Employee 360 setup | old onboarding nav item hidden |
| PASS | Employee rows open Employee 360 setup | employeePrimaryRoute checked |
| PASS | Legacy onboarding history and Employee 360 status schema preserved | schema checked |
| PASS | D1 binding unchanged | wrangler checked |
| PASS | R2 binding unchanged | wrangler checked |
| PASS | PBKDF2 unchanged | password helper checked |
| SKIPPED | Optional live one-case verification | Set API URL, token, and HRM_MIGRATE_CASE_ID or HRM_MIGRATE_EMPLOYEE_ID to verify a live case. |

This verifier never prints passwords or bearer tokens. Live one-case verification is skipped unless API URL, token, and HRM_MIGRATE_CASE_ID or HRM_MIGRATE_EMPLOYEE_ID are provided.

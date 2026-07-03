# Phase 13 E2E Workflow Validation

This guide describes the end-to-end OmniCore - HR workflow validation added in Phase 13. It verifies accepted HRM behavior after the performance and production readiness phases without adding large new business features.

## Test Environment Requirements

- Local/source validation works without live URLs.
- Remote read-only validation uses `HRM_E2E_API_URL` and optionally `HRM_E2E_FRONTEND_URL`.
- Authenticated read-only validation uses `HRM_E2E_AUTH_TOKEN`.
- Company-scoped tests may set `HRM_E2E_TEST_COMPANY_ID`.
- Write scenarios require `HRM_E2E_ENABLE_WRITES=true`.
- Production write scenarios additionally require `HRM_E2E_ALLOW_PRODUCTION_WRITES=true`.
- Test-created records must use `HRM_E2E_TEST_PREFIX`, default `E2E-P13`.

Do not place credentials, secrets, document numbers, payroll values, or personal data in source files or reports.

## Read-Only Test Behavior

Read-only mode is the default. When no live target is configured, `npm run e2e:hrm-workflows-phase13` runs dry-run/source validation and writes `docs/production/phase13-e2e-run-results.md`.

Read-only live checks may call health, bootstrap, auth/session, background jobs, app events, and performance endpoints only to verify status codes, cache headers, permissions, and no-store behavior. Response bodies are not stored.

## Write-Test Safety Rules

Write tests must not run by default. They require:

- `HRM_E2E_ENABLE_WRITES=true`
- A test tenant or safe staging target
- `HRM_E2E_AUTH_TOKEN`
- A clear `HRM_E2E_TEST_PREFIX`
- `HRM_E2E_ALLOW_PRODUCTION_WRITES=true` for production targets

Never delete real production employees, payroll runs, documents, or offboarding cases. Cleanup should archive or mark test records where supported. Unsafe cleanup must be reported as a manual follow-up.

## Local Employee Onboarding Scenario

The local employee onboarding scenario validates that Local employee document rules use configured Any and Local rules. Visa and Work Permit must not be required unless configured in a non-local rule by mistake. The scenario covers batch upload readiness for ID Card, Driving License, Medical Certificate, and Insurance where those document types and rules exist.

If no required document rules exist, the scenario reports "No required document rules configured" instead of failing incorrectly.

## Foreign Employee Onboarding Scenario

The foreign employee onboarding scenario validates that Foreign employee document rules use configured Any and Foreign rules. Passport, Visa, Work Permit, Medical Certificate, and Insurance are covered. Visa and Work Permit are foreign-only by default and should block activation only when configured as required.

Activation must remain server-enforced.

## Payroll Payment Scenario

Cash payment behavior:

- Bank/payment institution is not required.
- Account name and account number are not required.
- Stale bank fields are cleared or not submitted.
- Onboarding payment readiness can complete when Cash is saved correctly.

Bank Transfer behavior:

- Active bank selector appears.
- Active institutions such as BML, MIB, SBI, BOC, MCB, HBL, and CBM can appear when configured.
- Inactive, archived, or cash-location institutions are not accepted.
- Account name and account number are required.
- Field-level validation must appear before save.

## Activation And User Account Scenario

The activation scenario validates that the activation button remains disabled until readiness allows activation, and that the activation API validates readiness server-side. Override activation requires authorized permission. User account creation/linking must respect accepted create-login, link-user, suggested role/scope, and active employee self-service rules.

Super Admin-only users must not be treated as employee-linked unless linked and must not require an employee profile picture.

## Self-Service Scenario

Self-service access requires a user account, a linked active employee, module visibility, permissions, and access scope. Inactive or unlinked employee accounts must be blocked cleanly without leaking data.

## Attendance, Leave, And Payroll Scenario

Attendance enabled:

- Attendance records can be created/read where permission allows.
- Attendance summaries and snapshots refresh.
- Attendance list/calendar remains paginated and performance-safe.
- Payroll uses attendance-derived values only when enabled and configured.

Attendance disabled:

- Attendance UI and APIs are hidden or blocked.
- Payroll remains usable with payroll-native/manual inputs.
- Leave and Roster remain usable when their modules are enabled.
- Attendance-disabled Payroll isolation is verified.

Leave remains available when enabled and should not require Attendance if Attendance is disabled.

Payroll profile, payment method, paginated run/review lists, summaries, and sensitive action behavior remain verified.

## Offboarding Scenario

The offboarding scenario validates that cases can be created/read where permission allows. Disabled optional modules are Not Required and do not block finalization. Assets disabled means asset clearance is Not Required. Documents disabled means document clearance is Not Required. Payroll/final settlement blocks only when enabled and required. Finalization remains server-validated.

## Disabled-Module Scenario

Disabled modules must disappear from operational UI, sidebar, Command Center KPIs, onboarding blockers, offboarding blockers, employee profile panels, reports/import/export, global search, notifications, direct routes, and backend operational APIs. Settings access remains for authorized users so modules can be re-enabled. Parent module disabled makes submodules inactive and greyed out.

## Permission And Security Scenario

Covered roles include Super Admin, Admin/HR Manager, HR staff, department manager, employee/self-service user, and unauthorized/no-permission user where available.

Validation checks:

- Admin-only pages are blocked for normal users.
- Performance dashboard is admin-only.
- Background jobs are permission-scoped.
- App events are user/company scoped.
- Report artifacts are permission-scoped.
- Import/export permissions are enforced.
- Payroll sensitive data is permission-protected.
- Cross-tenant/company data does not leak.
- Authenticated HR API responses remain private/no-store.
- Raw job payloads and sensitive event payloads are not exposed.

## Reports, Import, And Export Scenario

Reports:

- Small preview may load.
- Large export queues a background job.
- Job drawer shows progress.
- Artifact becomes ready and is permission checked.
- Artifact expires safely.

Import:

- Large validation and apply flows run in background.
- Preview/error rows are paginated.
- Apply is idempotent.
- Failed rows are reported safely.
- Successful import invalidates targeted queries only.

Export:

- Export does not block the UI.
- Permissions and disabled modules are respected.
- Sensitive storage keys are never exposed.

## Performance Systems Scenario

This scenario protects accepted performance work:

- TanStack Query cache prevents blank reloads.
- Workspace page-load reduction works.
- D1 timing/performance headers remain.
- Document upload row-level progress works.
- Background job drawer updates.
- App events/live invalidation update jobs, notifications, and workspaces.
- Cross-tab logout/invalidation works.
- Performance metrics dashboard records safe metrics.
- Route lazy loading remains intact.
- No excessive polling after app events.
- No sensitive metrics/logging.

## Known Deferred Manual Checks

- Full write-enabled onboarding creation in production should only run in an approved test tenant.
- Real document files should use benign test files only.
- Payroll runs and final settlement writes should be performed only in staging or isolated payroll periods.
- Cross-role UI verification should be repeated with real role accounts before major releases.

## How To Run Safely

Dry-run/source validation:

```bash
npm run verify:e2e-workflows-phase13
npm run e2e:hrm-workflows-phase13
```

Remote read-only validation:

```bash
set HRM_E2E_API_URL=https://hr.api.cafeasiana.com.mv
set HRM_E2E_FRONTEND_URL=https://hr.cafeasiana.com.mv
npm run e2e:hrm-workflows-phase13
```

Authenticated read-only validation:

```bash
set HRM_E2E_AUTH_TOKEN=<token from a safe test account>
npm run e2e:hrm-workflows-phase13
```

Write-enabled staging validation:

```bash
set HRM_E2E_ENABLE_WRITES=true
set HRM_E2E_TEST_PREFIX=E2E-P13
npm run e2e:hrm-workflows-phase13
```

## Interpreting Results

`PASS` means the source or endpoint check satisfied the scenario guard. `SKIP` means the scenario was intentionally not run because safe live prerequisites were not provided. `WARN` means a manual follow-up is needed. `FAIL` means the scenario guard found a regression or unsafe configuration.

# Reports, Imports, and Snapshot Caches - Phase 8

## Scope

Phase 8 moves heavy report/export and import validation/apply work onto the accepted Phase 7 background job foundation and adds D1-backed summary snapshots for expensive repeat calculations.

## Snapshot Tables

- `attendance_summary_snapshots` stores employee daily/monthly attendance summary values such as present days, absent days, late count, missed punches, overtime minutes, leave days, stale state, and source version.
- `payroll_summary_snapshots` stores employee payroll period/run summary values such as gross salary, allowances, deductions, net salary, payment method, row status, stale state, and source version. Payroll access checks must still protect payroll values before they reach users.
- `dashboard_summary_snapshots` stores short-lived user-scope Command Center summary payloads. Payloads are scoped by user and permission shape and expire quickly.
- `report_export_artifacts` tracks generated export artifacts without exposing R2 storage keys to the frontend.

All snapshot tables use idempotent upserts where possible and safe non-unique indexes for employee/date/period/stale lookups.

## Report Artifact Flow

1. The report export request validates module state, permissions, access scope, and report configuration.
2. The Worker enqueues a `REPORT_EXPORT_GENERATION` job.
3. A `report_export_artifacts` row is created as `PENDING`.
4. The job generates the export body in the background and writes it to the existing private `DOCUMENTS_BUCKET`.
5. The artifact row moves to `READY` with a short expiry.
6. Download uses `/api/v1/reports/artifacts/:artifactId/download`, rechecks ownership or export-history permissions, reads the object server-side, and returns `Cache-Control: private, no-store`.

R2 object keys and storage metadata are never returned to the browser.

## Data Export Flow

The Data Export Center `run` action now queues `DATA_EXPORT_GENERATION` and stores the generated file as a report artifact. The older direct `/download` endpoint remains as a compatibility fallback for existing UI/API callers.

## Import Validation and Apply Flow

Import batch upload remains compatible. Validation and apply now enqueue:

- `IMPORT_VALIDATION`
- `IMPORT_APPLY`

The request returns quickly with job metadata. Row previews, errors, and results are served from staged import rows with pagination instead of rendering every row at once. Apply remains idempotent through the existing import row status and duplicate-key checks.

## Attendance Snapshot Invalidation

Attendance record create/update marks the affected employee/month snapshot stale. The existing attendance refresh job recalculates both daily records and attendance summary snapshots for affected periods. If Attendance is disabled, the accepted module enforcement continues to prevent attendance routes from calculating summaries, preserving Attendance-disabled Payroll isolation.

## Payroll Snapshot Invalidation

Payroll calculation writes to `payroll_employee_results` and refreshes employee payroll snapshots for the current period/run. Payroll run transitions and employee result status changes mark affected payroll snapshots stale. Finalization and activation actions still validate against live payroll state, not stale snapshots.

## Command Center Snapshot Strategy

Command Center summaries use `dashboard_summary_snapshots` when fresh. If a stale user-scoped snapshot exists, the API can return it with `snapshot_cache.refreshing = true` while a safe `waitUntil` refresh updates the snapshot. Disabled module KPI groups remain hidden and are not queried.

## Employee 360 Summary Strategy

Employee 360 remains summary-first: the initial profile workspace loads employee identity, limited contacts, onboarding tasks, and a small audit slice. Heavy histories stay lazy-loaded and paginated through module panels. Phase 8 snapshot utilities are available for module summaries when those panels adopt cached summary rows.

## Stale Snapshot Behavior

Stale snapshots can be shown as previews with a refreshing indicator. They must not be used to finalize payroll, activation, approvals, or other sensitive workflows without server-side validation against live state.

## Security and Privacy

- Authenticated HR API responses remain private/no-store.
- Report artifacts are permission-scoped and expire.
- Payroll amounts remain protected by existing payroll/report permissions.
- Import job payloads and logs sanitize raw row/file/account/salary/document-number fields.
- Snapshot payloads must not contain passwords, tokens, secrets, raw files, bank account numbers, or raw import rows.
- CORS request-id and performance instrumentation remain in place.

## Deferred Items

- Generic background job retry cannot fully regenerate report artifacts without the original request context; users should queue the export again if an artifact job fails.
- More Employee 360 module panels can progressively adopt snapshot rows where that reduces page-open cost without weakening permissions.

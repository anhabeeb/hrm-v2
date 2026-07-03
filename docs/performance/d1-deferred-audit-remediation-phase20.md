# D1 Deferred Audit Remediation Phase 20

Generated for post-production performance Phase 20. This report contains source-level route and query findings only. It does not include employee, payroll, document, authentication, backup, or production data.

## Current Audit Snapshot

Command:

```bash
npm run audit:d1-query-performance
```

Result after Phase 20 source changes:

| Metric | Count |
| --- | ---: |
| Route files scanned | 37 |
| SELECT * findings | 444 |
| Potential unbounded ordered lists | 193 |
| Potential unindexed filters | 198 |
| Potential N+1 candidates | 1 |
| Current HIGH findings count | 57 |
| Current MEDIUM findings count | 778 |
| Current LOW findings count | 1 |

The audit remains intentionally noisy. HIGH means a priority route group still has a broad or unbounded pattern that needs source review. Some remaining HIGH findings are safe bounded/reference reads that the heuristic cannot classify, and those are documented below rather than hidden.

## Findings Fixed In Phase 20

- Document compliance generator batching:
  - `refreshAllDocumentComplianceSnapshots` now pages employee IDs and processes employee chunks.
  - Required document rules are loaded once per refresh and matched in memory.
  - Active employee documents are bulk-loaded per employee chunk with bounded `IN (...)` queries.
  - Active document waivers are bulk-loaded per employee chunk with bounded `IN (...)` queries.
  - Compliance snapshots are written idempotently with `ON CONFLICT(employee_id, snapshot_date)`.
  - `getEmployeeMissingRequiredDocuments` no longer queries active documents once per required rule.

- Document compliance dashboards and operational lists:
  - Compliance dashboard now reads latest snapshots instead of recalculating every scoped employee synchronously.
  - Renewal case and waiver list endpoints now use pagination metadata and bounded reads.
  - Required document rule and document version lists now use narrower selected columns and hard caps.

- Missing/required document reports:
  - Document registry now accepts pagination with default and max limits.
  - Missing document list remains paginated.
  - Document dashboard and report summary now use aggregate counts instead of loading full registry and missing-row arrays.
  - Dashboard recent document rows are capped to a small sample.

- Payroll report and remittance cleanup:
  - Payroll run and payroll period summary reports no longer use per-row correlated sums for pension, bank loan, and custom deduction totals.
  - Aggregate subqueries are joined once by `payroll_employee_result_id`.
  - New non-unique indexes support result-based remittance lookups:
    - `idx_phase20_bank_loan_payments_result`
    - `idx_phase20_pension_contributions_result`

- Event/job/performance list safety:
  - Background job detail events are capped at 50 and no longer expose raw `metadata_json` to the frontend.
  - App event polling now uses an explicit column list while preserving sanitized payload delivery.
  - Performance dashboard lists remain paginated and capped.

## Endpoints Changed

- `GET /api/v1/document-compliance/compliance/dashboard`
- `POST /api/v1/document-compliance/compliance/refresh`
- `GET /api/v1/document-compliance/renewal-cases`
- `GET /api/v1/document-compliance/waivers`
- `GET /api/v1/documents/registry`
- `GET /api/v1/documents/expiring`
- `GET /api/v1/documents/reports`
- `GET /api/v1/documents/dashboard`
- `GET /api/v1/documents/required-rules`
- `GET /api/v1/employees/:employeeId/documents/:documentId/versions`
- `GET /api/v1/background-jobs/:jobId`
- App event polling utility used by live events and polling fallback
- Payroll report keys backed by payroll run and period summary queries

## New Indexes Added

Only safe non-unique indexes were added:

```sql
CREATE INDEX IF NOT EXISTS idx_phase20_bank_loan_payments_result
  ON employee_bank_loan_payments(payroll_employee_result_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_phase20_pension_contributions_result
  ON payroll_pension_contributions(payroll_employee_result_id, contribution_status);
```

No tables, columns, or existing indexes were dropped.

## Remaining HIGH Findings And Deferrals

Remaining HIGH findings are intentionally not hidden. The items below are intentionally deferred with reason and future action where they are not fixed in this pass:

- Employee access and assignment reference reads:
  - Role, permission, access-scope, assignment-option, and reporting-manager reference reads are permission-protected and currently used to build employee access/edit forms.
  - Future action: add route-level caps to assignment/access reference lists where UX can tolerate pagination.

- Onboarding workspace reference data:
  - Several contract type, role, organization, payment institution, and setup reference reads are optional workspace data.
  - The workspace already skips disabled/unauthorized modules and has optional-section no-permission handling from previous phases.
  - Future action: split large reference payloads into narrow search endpoints if real production volume requires it.

- Document compliance dynamic-pagination false positives:
  - Some queries are reported as unbounded because the audit replaces template interpolations and cannot see dynamic `LIMIT ? OFFSET ?` fragments.
  - Source review confirms renewal cases, waivers, registry, missing documents, and dashboard samples are bounded.
  - Future action: move more dynamic SQL to explicit query builder helpers so the audit can classify it more accurately.

- Admin/setup/detail endpoints:
  - Some `SELECT *` reads are singleton settings, audit snapshots, or admin-only edit/detail flows.
  - These are not high-traffic public list endpoints and remain permission protected.
  - Future action: gradually add selected-column constants for admin edit pages without changing forms.

No remaining HIGH finding is known to be an uncapped public high-traffic list that returns sensitive raw payloads.

## Safe Single-Row/Admin Reads

The following classes are considered safe after Phase 20:

- ID-based detail lookups that call `.first()`.
- Admin-only singleton settings reads used for edit forms.
- Audit old/new snapshots used to preserve before/after change history.
- Internal worker calculations that sanitize the returned API object before response.

These should still be reviewed over time, but they are not production blockers.

## Disabled Module Query Skipping

Existing disabled-module behavior remains in place:

- Documents disabled: document compliance routes are guarded by `requireOperationalModuleMiddleware("documents")`.
- Payroll disabled: payroll report and payroll route guards remain unchanged.
- Attendance disabled: payroll isolation behavior from earlier phases remains untouched.
- Assets & Uniforms disabled: accepted sidebar/backend visibility behavior remains untouched.
- Settings remain available to authorized users.

## Remaining Risk Level After Phase 20

Risk is reduced for the deferred Phase 4 hotspots:

- Document compliance refresh now uses chunked bulk reads instead of employee/rule N+1 patterns.
- Missing/required document UI report paths are bounded.
- Payroll summary/remittance reports avoid per-row correlated totals.
- Job/event/performance operational lists are capped and safer.

Overall remaining risk is MEDIUM because the audit still reports broad reference/admin patterns and some heuristic false positives. There are no known unresolved high-risk public report endpoints that return all rows by default in the areas changed by Phase 20.

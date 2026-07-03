# D1 Query Audit Phase 4

Generated for the post-production performance Phase 4 pass. This report contains route/file patterns only; no employee, payroll, document, or authentication data is included.

## Audit Snapshot

| Metric | Starting audit | After Phase 4 |
| --- | ---: | ---: |
| SELECT * findings | 466 | 442 |
| Potential unbounded ordered lists | 231 | 203 |
| Potential unindexed filters | 191 | 191 |
| N+1 risk candidates | 1 | 1 |
| HIGH priority findings | Not ranked | 65 |
| MEDIUM priority findings | Not ranked | 771 |
| LOW priority findings | Not ranked | 1 |

The audit now ranks findings by route priority. HIGH means a priority route still has a broad or unbounded read pattern. MEDIUM includes bounded/single-row compatibility reads or index-review candidates. LOW is setup-only/internal review work.

## Fixed in Phase 4

- Employees / Employee 360:
  - Employee 360 overview onboarding tasks now use `EMPLOYEE_ONBOARDING_TASK_COLUMNS` with `LIMIT 100`.
  - Employee 360 overview contacts now use `EMPLOYEE_CONTACT_COLUMNS` with `LIMIT 25`.
  - Employee 360 audit preview now uses `EMPLOYEE_OVERVIEW_AUDIT_COLUMNS` and keeps the existing `LIMIT 8`.
  - Employee contact and onboarding list endpoints now use selected columns and safe caps.
  - Employee status reference list now uses `EMPLOYEE_STATUS_COLUMNS` with `LIMIT 100`.

- Onboarding workspace:
  - Workspace contacts and addresses now use `LIFECYCLE_CONTACT_COLUMNS` / `LIFECYCLE_ADDRESS_COLUMNS` and caps.
  - Onboarding/offboarding checklist reads now use selected task columns and `LIMIT 200`.
  - Lifecycle summary task reads are capped at `LIMIT 100`.
  - Onboarding dashboard task batching is capped at `LIMIT 500`.
  - Reporting manager candidate list is capped at `LIMIT 250`.

- Attendance records / corrections:
  - Attendance daily list endpoints now use explicit `recordColumns()` instead of `adr.*`.
  - Attendance correction list endpoints now use explicit `correctionColumns()` instead of `acr.*`.
  - Attendance records, daily records, correction lists, employee record history, and employee calendar reads now clamp user-provided limits.
  - Attendance devices list now uses explicit device columns and `LIMIT 200`.
  - Leave calendar overlay and one-day punch reconciliation reads now have hard caps.

- Documents / Document Compliance / Missing Documents:
  - Document categories list now uses `DOCUMENT_CATEGORY_COLUMNS` and `LIMIT 200`.
  - Document types list now uses `DOCUMENT_TYPE_LIST_COLUMNS` and `LIMIT 500`.
  - Document compliance type list now uses `DOCUMENT_TYPE_COMPLIANCE_COLUMNS` and `LIMIT 500`.
  - Renewal case event endpoints now use `DOCUMENT_RENEWAL_EVENT_COLUMNS` and `LIMIT 100`.

- Payroll foundations / payment methods / payroll profile:
  - Payment institutions list now uses `PAYMENT_INSTITUTION_COLUMNS` and a clamped limit.
  - Pension schemes list now uses `PENSION_SCHEME_COLUMNS` and a clamped limit.
  - Custom deduction templates now use `CUSTOM_DEDUCTION_TEMPLATE_LIST_COLUMNS` and a clamped limit.
  - Bank loan shortfall report now uses explicit columns and a clamped limit.
  - Payroll periods and payroll runs list endpoints now use selected-column list constants and bounded limits.

- Notifications:
  - Notification preferences now use `NOTIFICATION_PREFERENCE_COLUMNS` with `LIMIT 100`.
  - Notification list behavior from Phase 3 remains selected-column and bounded.

- Global search and Command Center:
  - Existing Phase 3 protections were preserved: global search remains bounded and module-aware; Command Center remains count/KPI based and does not use `SELECT *`.

## Top Remaining SELECT * Routes

These are the main remaining classes from the audit:

- Single-row settings, policy, or edit snapshots, such as payroll settings, onboarding/offboarding settings, and device/edit rows.
- Audit/business workflow snapshots that intentionally capture old/new values for permissioned update flows.
- Document compliance generator internals that currently reuse broad row types during employee compliance calculation.
- Payroll foundation calculation internals where broad snapshots are used as payroll calculation inputs or audit payloads.

## Top Remaining Unbounded List Risks

- `worker/src/routes/document-compliance.ts`: employee compliance generation currently queries matching employees, required rules, employee documents, active waivers, renewal cases, and waiver reports without route-level paging. These are service/generator style reads and need a dedicated batching/cursor pass.
- `worker/src/routes/documents.ts`: required-rule and missing-document settings/report paths still use broader reads. These should be redesigned with paging/filter-first behavior in a document reporting pass.
- `worker/src/routes/payroll-foundations.ts`: deeper remittance/report pages still contain broad historical report reads. The high-traffic setup lists were fixed in this pass; historical report optimization is deferred.

## Top Unindexed Filter Risks

The audit still reports 191 possible filter/index findings. Many are false positives from aliases, subqueries, and dynamic scope clauses. Existing Phase 3 indexes already cover the main hot paths for employees, onboarding cases, document requirements, employee documents, attendance daily records/corrections, roster assignments, payroll runs/results/adjustments, and assets/uniform assignments.

No new Phase 4 indexes were added because the targeted route fixes were safer as payload/limit changes and existing indexes already support the edited filters/orderings.

## N+1 Risk Candidates

One existing candidate remains in the audit output. It is not part of the Phase 4 hot endpoints changed here and should be reviewed with the module owner before batching behavior is changed.

## Deferred HIGH Findings

- Document compliance generator queries are deferred to a dedicated document-compliance batching phase. They should be converted to cursor/paged batches, with explicit columns for employee documents, waiver summaries, and renewal case rows.
- Document missing/required reports are deferred to a report pagination pass so exports and on-screen lists can keep different limits.
- Payroll remittance and deeper payroll report reads are deferred to a reporting/export optimization phase. This Phase 4 pass fixed the operational payroll foundation list endpoints.
- Single-row settings/edit/audit snapshot reads are intentionally not treated as Phase 4 blockers. They remain candidates for future cleanup only if payload logging shows real pressure.

## Regression Notes

- Authenticated HR API responses remain private/no-store.
- No static or public cache behavior was added to HR API data.
- D1/R2 bindings and PBKDF2 configuration were not changed.
- No frontend localStorage persistence for sensitive employee/payroll data was introduced.

## Phase 20 Follow-Up

Phase 20 completed the first deferred cleanup pass for the main Phase 4 hotspots. See `docs/performance/d1-deferred-audit-remediation-phase20.md`.

Highlights:

- Document compliance snapshot refresh now uses paged employee IDs, chunked bulk document/waiver loading, and idempotent snapshot upserts.
- Missing/required document list and dashboard paths are bounded or aggregate-based.
- Payroll run/period report summaries use aggregate joins for pension, bank loan, and custom deduction totals.
- Background job event details and app event polling use safer selected payloads.

The audit is still intentionally noisy and should not be weakened. Remaining HIGH findings must stay documented with a reason and future action until the source pattern is fixed.

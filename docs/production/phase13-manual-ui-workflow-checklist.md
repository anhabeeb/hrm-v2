# Phase 13 Manual UI Workflow Checklist

Use this checklist for final browser-based production scenario review. It complements `npm run e2e:hrm-workflows-phase13`.

## Login

- Login page branding loads without stale CSS/JS assets.
- Invalid credentials show global popup alerts without raw stacks.
- Session/bootstrap requests are not blocked by CORS.
- Authenticated responses remain private/no-store.

## Command Center

- Welcome message shows user name and title/designation.
- Priority KPI icons, hover popup, glow state, and click navigation work.
- Disabled modules do not appear in KPI groups.
- KPI accordions remain single-open and visually stable.

## Employee List

- Employee table identity/avatar column renders.
- Search/filter/date controls use compact standardized controls.
- Large lists remain paginated or virtualized.
- Assets & Uniforms disabled does not block core employee access.

## Onboarding Popup

- Employee information appears on the right-side layout.
- Checklist/Approval Timeline remains removed from the simplified popup.
- Sidebar navigation shows section completion ticks.
- Activation stays disabled until readiness permits activation.
- Global popup alerts auto-dismiss; no inline raw error stacks.
- Local employee flow does not require Visa or Work Permit by default.
- Foreign employee flow applies foreign and Any document rules.

## Documents Upload

- Batch document rows show Pending, Preparing, Uploading, Processing, Uploaded, Failed, and Retry states.
- Failed rows can be retried safely.
- Upload success refreshes documents, checklist, readiness, and employee document summary only.
- Missing configured required documents block activation server-side.

## Payroll Payment

- Cash does not require bank, account name, or account number.
- Bank Transfer requires active bank, account name, and account number.
- BML, MIB, SBI, BOC, MCB, HBL, and CBM appear only when active/configured.
- Inactive/archived/cash-location institutions are not accepted.

## Activation

- Activation button remains grey/disabled until readiness is complete.
- Activation with override requires authorized permission.
- Activated employees unlock Employee 360 views where permitted.

## Employee Profile

- Employee 360 panels respect module visibility.
- Documents, contracts, payroll, notes, assets, attendance, leave, and roster panels handle disabled modules cleanly.
- Sensitive payroll/document data is masked unless permission allows.

## Self-Service Login

- Linked active employee users can access permitted self-service modules.
- Inactive/unlinked employee users are blocked cleanly.
- Super Admin-only accounts are not treated as employee-linked unless explicitly linked.

## Attendance

- Attendance enabled: records, calendar, corrections, devices, and reports load with paginated/performance-safe views.
- Attendance disabled: UI/sidebar/routes/API are hidden or blocked.
- Attendance disabled does not disable Leave, Roster, or Payroll by itself.

## Leave

- Leave request form shows configured day counting and approval preview/timeline where accepted.
- Leave remains usable when Attendance is disabled.
- Approval/rejection/cancel actions show global popup alerts.

## Payroll

- Payroll profile/payment setup is valid.
- Payroll runs and result tables are paginated.
- Sensitive values require sensitive payroll permission.
- Attendance-disabled Payroll isolation works.
- No payment/final settlement legacy Prompt 10-excluded actions reappear.

## Reports, Import, And Export

- Report preview loads small results.
- Large report/export queues a background job.
- Artifact download is permission checked and does not expose storage keys.
- Import validation and apply workflows show background progress and paginated errors.
- Disabled modules are not exposed through import/export.

## Background Jobs

- Job drawer opens and updates.
- Job progress is live or refreshed without excessive polling.
- Job details do not expose raw sensitive payloads.
- Failed jobs show safe messages and retry/requeue only when permitted.

## Performance Dashboard

- Dashboard is admin/performance permission gated.
- API/frontend/job/build metrics show safe aggregate values only.
- No sensitive employee/payroll/document values are logged or displayed.

## Module Disabled/Enabled

- Disabled modules disappear from sidebar, Command Center, employee profile panels, global search, reports, notifications, direct routes, and operational APIs.
- Settings remains available to authorized users for re-enable.
- Parent-disabled submodules are greyed out.
- Onboarding and offboarding treat disabled optional modules as Not Required.

## Mobile And Tablet Visual Checks

- App shell/sidebar/header do not overflow.
- Onboarding popup remains usable.
- Tables scroll internally instead of breaking page width.
- Module navigation tabs stay clean and usable.

## Visual Quality

- No horizontal overflow or clutter on key screens.
- No browser `alert()`, `confirm()`, or `prompt()` dialogs appear.
- Global popup alerts are used for success, warning, and error summaries.

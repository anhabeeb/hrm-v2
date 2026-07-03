# Phase 14 Final UI/UX Consistency Sweep

Phase 14 is a UI-only polish pass over the accepted HRM v2 production source. It keeps backend routes, business rules, schemas, bindings, and performance foundations unchanged while tightening shared presentation behavior.

## Scope

- Shared display labels now centralize enum, module, role, payment, and status text so raw technical values such as `DOCUMENT_COMPLIANCE`, `PAYMENT_METHODS`, `READY_FOR_REVIEW`, and `NOT_APPLICABLE` render as readable labels.
- Status badges use the shared formatter while preserving the original raw value in `title` metadata for support/debugging.
- Shared table wrappers and table primitives keep wide data inside horizontal scroll containers instead of creating page-level overflow.
- Shared dialog and drawer surfaces cap viewport height and put long content in internal scroll areas.
- Page action rows keep their existing behavior while using safer wrapping and alignment rules.

## Non-Goals

- No workflow logic was rewritten.
- No database schema or seed behavior changed.
- No route, permission, payroll, leave, attendance, roster, onboarding, document, reporting, realtime, cache, or performance behavior changed.
- No authenticated HR API response was made public-cacheable.
- No dark mode, browser `alert()`, `confirm()`, or `prompt()` usage was added.

## Shared Patterns

### Display labels

Use `humanizeTechnicalLabel` and the exported format helpers from `frontend/src/lib/displayLabels.ts` when user-facing UI needs to show status, module, role, payment method, or other system-code values.

### Tables

Use `DataTableFrame`, `DataTableShell`, `PerformanceDataTable`, or `ResponsiveTableWrapper` for lists that can overflow horizontally. Shared table headers are non-wrapping; cell content remains controlled by each page when it needs truncation or wrapping.

### Dialogs

Dialogs and drawers should keep headers and footers fixed inside the modal surface while allowing the body to scroll internally. Large content should not push the dialog beyond the viewport.

### Headers and actions

Page-level actions should stay in `PageHeader` or an `ActionBar`, with filters and sub-tabs below the header. Action rows can wrap on smaller screens without overlapping the title or description.

## Regression Guard

`npm run verify:final-uiux-consistency-phase14` checks the shared formatter, table overflow protections, dialog viewport protections, accepted onboarding/layout verifiers, core post-production verifiers, bindings, PBKDF2, no dark mode, no browser prompts, and clean ZIP rules when the Phase 14 ZIP is present.

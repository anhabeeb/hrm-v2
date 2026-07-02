# Phase 6 Large List and Table Performance

Phase 6 standardizes how OmniCore - HR loads and renders high-volume lists. The goal is to keep tables responsive while data changes, reduce unnecessary DOM work, and avoid loading all rows just to paginate in the browser.

## Shared Frontend Foundation

The shared table foundation lives in:

- `frontend/src/components/table/PerformanceDataTable.tsx`
- `frontend/src/components/table/TablePaginationBar.tsx`
- `frontend/src/components/table/TableLoadingOverlay.tsx`
- `frontend/src/hooks/usePaginatedQuery.ts`
- `frontend/src/hooks/useDebouncedTableFilters.ts`
- `frontend/src/lib/tableQueryKeys.ts`
- `frontend/src/lib/tablePerformance.ts`

`PerformanceDataTable` wraps high-volume tables in a constrained responsive container, keeps horizontal overflow inside the table wrapper, shows first-load skeletons only on true initial load, and displays a small table-level refresh overlay during background updates.

`usePaginatedQuery` builds on the accepted TanStack Query API wrapper, so table data keeps previous results during page, filter, and refresh changes. Query keys include user scope, table name, page, page size, filters, search, and sort markers.

`useDebouncedTableFilters` keeps noisy search/filter text from firing a request on every keypress. The shared API request layer still supplies `AbortSignal`, request dedupe, and request-id instrumentation.

## Backend Pagination Foundation

The Worker helper `worker/src/utils/pagination.ts` provides:

- `parsePaginationParams`
- `parseSortParams`
- `buildSafeLimitOffset`
- `safeOrderByFromAllowList`
- `paginationMeta`

List endpoints clamp page sizes, use safe `LIMIT ? OFFSET ?` bindings, and return pagination metadata with `limit`, `offset`, and `has_more`.

## Migrated High-Impact Screens

The first Phase 6 migration covers:

- Employees list
- Onboarding/offboarding case list
- Missing documents list
- Attendance records
- Attendance corrections
- Payroll run employee review rows
- Notifications

These screens now use server pagination, debounced filters where applicable, table-level refresh indicators, and targeted query keys.

## Compatibility Notes

Existing array response names are preserved so older callers can keep using `employees`, `cases`, `missing`, `records`, `corrections`, `notifications`, and payroll row arrays. New callers can read `pagination` metadata when they need table controls.

Export flows remain explicit actions. They are not replaced by page-limited table queries.

## Virtualization and DOM Safety

The shared table component exposes a virtualization threshold marker through `data-virtualization-threshold`. Server page caps keep normal table pages below heavy DOM counts. Import previews, report previews, and audit-heavy tables can adopt the same component and virtual row rendering as future incremental migrations.

## Security and Data Handling

This phase does not persist sensitive employee, payroll, attendance, or document data to `localStorage`. Authenticated API data remains behind the existing private/no-store Worker behavior. D1 and R2 bindings are unchanged.

## Deferred Work

Some lower-volume or workflow-specific tables still use their existing loaders. They should migrate opportunistically to the shared table path when touched:

- Audit log deep views
- Import preview/error rows
- Report preview tables
- Payroll submodule admin lists
- Document compliance renewal/waiver detail tables

The verifier `scripts/verify-large-list-table-performance.mjs` protects the shared foundation and the migrated high-impact screens.

# Background Jobs Phase 7

Phase 7 adds a D1-backed background job foundation for heavy OmniCore - HR workflows that should not keep the user waiting on a single request/response cycle.

## Schema

The job system uses:

- `background_jobs` for job status, ownership, dedupe, safe payload metadata, progress, attempts, and timestamps.
- `background_job_events` for capped safe timeline messages.

Payloads are sanitized before storage. Passwords, tokens, document numbers, file contents, account numbers, salary/amount fields, raw import rows, and other sensitive values are redacted or omitted.

## Statuses

- `QUEUED`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`
- `RETRYING`

Queued and retrying jobs can be cancelled. Failed and cancelled jobs can be retried while attempts remain. Running jobs are not force-cancelled because D1 writes must remain consistent.

## Enqueue and Runner Flow

1. A route validates permissions, module state, access scope, and input.
2. The route calls `enqueueJob` with a `dedupe_key`.
3. If an active matching job exists, the route returns that existing job.
4. Otherwise the route returns `202` with `job_id`.
5. Short follow-up work runs through `executionCtx.waitUntil`.
6. Longer or deferred work can be picked up by:
   - `POST /api/v1/background-jobs/:id/run`
   - `POST /api/v1/background-jobs/run-next`

No Cloudflare Queue binding is required in this phase. Queues remain a future upgrade path for higher throughput, retries, and cross-worker fanout.

## User-Facing Job UX

The app header includes a Background Jobs indicator. It opens a drawer with recent jobs, progress, terminal status, retry, and cancel actions. TanStack Query polls only while active jobs exist and stops when visible jobs are terminal.

Job completion invalidates only targeted query families:

- onboarding readiness jobs refresh onboarding workspace/readiness/document slices.
- document compliance jobs refresh document-related query keys.
- attendance jobs refresh attendance query keys.
- report/import jobs have module-scoped keys reserved for future artifact status endpoints.

## Migrated Workflows

Implemented in this phase:

- Document compliance recalculation now queues `DOCUMENT_COMPLIANCE_RECALCULATION`.
- Document expiry alert refresh now queues `DOCUMENT_EXPIRY_ALERT_GENERATION`.
- Employee document compliance refresh now queues `DOCUMENT_COMPLIANCE_RECALCULATION`.
- Onboarding document upload completion now queues `ONBOARDING_READINESS_RECALCULATION` and refreshes document compliance in the background.
- Attendance daily refresh now queues `ATTENDANCE_SUMMARY_RECALCULATION`.

## Deferred Workflows

Report generation/export preparation and import validation/apply can become heavy, but they also require durable artifact/result handling. This phase does not fake a completed export/import. The job schema, status API, runner endpoints, and frontend job center are ready for a follow-up migration that adds report/import artifact records and resumable result downloads.

Payroll finalization, employee activation, and other sensitive final actions remain synchronous/server-confirmed. They must not show success until the server validates and commits the final state.

## Dedupe Strategy

Current dedupe keys include:

- `documents:compliance:refresh:<user>:<employee-count>`
- `documents:alerts:refresh:<user>:<employee-count>`
- `documents:employee-compliance:<employee-id>`
- `onboarding:readiness:<case-id>`
- `attendance:daily-refresh:<employee-id>:<from>:<to>`

Active queued/running/retrying jobs are reused to avoid duplicate recalculation work.

## Security and Privacy

- Job payloads are never exposed directly to the frontend.
- API responses use safe job summaries.
- Events store safe summaries only.
- Authenticated job APIs set `Cache-Control: private, no-store`.
- Users can view their own jobs. Admin/system permissions are required for all-job visibility and runner endpoints.
- CORS request-id behavior and performance instrumentation remain unchanged.

## Future Cloudflare Queues Upgrade

If high-volume background work grows beyond `waitUntil` and D1 runner endpoints, a Queue producer/consumer can pick up `background_jobs` IDs. The D1 schema and job runner functions are designed so a future queue consumer can call `runJobByType` without changing user-facing APIs.

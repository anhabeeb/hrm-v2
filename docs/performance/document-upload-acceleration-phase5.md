# Document Upload Acceleration Phase 5

## Flow

Phase 5 adds a prepare/upload/complete flow for onboarding document uploads.

1. The browser calls `POST /api/v1/onboarding/cases/:caseId/documents/uploads/prepare` with row metadata.
2. The Worker validates permissions, employee scope, module state, document type rules, file metadata, local/foreign employee compatibility, size, MIME, dates, and duplicate active document restrictions before any file bytes are sent.
3. The Worker creates expiring `document_upload_sessions` rows and returns one upload target per row.
4. The browser uploads each row independently and shows `Pending`, `Preparing`, `Uploading`, `Processing`, `Uploaded`, or `Failed` with retry.
5. The browser calls `POST /api/v1/onboarding/cases/:caseId/documents/uploads/complete` for uploaded rows.
6. The Worker revalidates metadata and object existence, creates official `employee_documents` and `employee_document_versions`, audits the upload, and schedules readiness/compliance recalculation in the background.

The accepted legacy endpoint, `POST /api/v1/onboarding/cases/:caseId/documents/batch`, remains available as a compatibility fallback.

## Upload Modes

The active implementation uses `worker_proxy` mode. Files are sent to a Worker upload endpoint and stored through the existing `DOCUMENTS_BUCKET` binding. This keeps R2 credentials private and does not require new Cloudflare bindings.

`direct_r2` is intentionally guarded and deferred until a server-side signing configuration is available. A future direct mode must use short-lived, method-scoped, object-scoped upload URLs and must not expose R2 credentials to frontend code.

## R2 CORS Requirements For Future Direct Mode

If direct browser uploads are enabled later, R2 CORS must allow the production frontend origin:

- `https://hr.cafeasiana.com.mv`

Allowed methods should be limited to the required upload method. Upload URLs must expire quickly and must be scoped to one object key.

## Failure And Retry Behavior

Each row uploads independently. A failed row remains visible with a retry action. Successful rows can continue to completion even when another row fails.

If prepare fails because the accelerated flow is unavailable or validation returns an operational error, the frontend can fall back to the legacy batch endpoint. Validation failures remain field-level and are shown on the row.

## Orphan Cleanup

Pending upload sessions expire. The Worker cleanup helper marks stale sessions as cleaned and deletes uploaded R2 objects only for pending/failed upload sessions. It does not delete active accepted employee document versions.

If DB commit fails after an object upload, the Worker attempts to remove that object. Cleanup warnings log only upload/request identifiers and never file contents or sensitive document metadata.

## Background Recalculation

After accelerated completion, onboarding document task status and readiness/compliance recalculation are scheduled with `executionCtx.waitUntil` where available. The UI reports "Saved. Updating readiness..." and keeps activation disabled until the readiness state refreshes.

Activation remains server-authoritative. Even if the UI cache is stale, activation endpoints still validate readiness on the Worker before changing employee status.

## Deferred

- Presigned direct R2 browser upload mode.
- A dedicated Cloudflare Queue binding for upload follow-up jobs.
- Cross-module use of accelerated upload outside onboarding, beyond reusable frontend/backend utilities.

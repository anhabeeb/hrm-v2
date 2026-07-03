# Phase 18 Direct R2 Uploads

## Purpose

Phase 18 upgrades the accelerated document upload flow with optional direct browser-to-R2 uploads. Worker-proxy upload remains the compatibility fallback and is always available when direct signing or R2 CORS is not configured.

## Direct Upload Architecture

The upload flow has three server-controlled stages:

1. Prepare: the Worker validates permission, employee scope, onboarding case, document type, metadata, file size, MIME type, duplicate rules, and local/foreign document rules. It creates a `document_upload_sessions` row and generates the storage key server-side.
2. Upload: the browser uploads each file row independently. If direct mode is configured, the browser uses a short-lived presigned R2 `PUT` URL. Otherwise it posts to the Worker proxy endpoint.
3. Complete: the Worker verifies the upload session, expiry, document rules, and R2 object metadata before creating employee document records. Readiness and compliance recalculation run in the background.

The frontend never chooses object keys and never sends object keys back during completion.

## Upload Modes

- `worker_proxy`: browser uploads file data to the Worker, and the Worker writes to R2.
- `direct_r2`: browser uploads directly to R2 using a short-lived presigned URL.
- `auto`: use direct mode only when all direct upload settings are present and the file is within configured direct-upload limits; otherwise use Worker proxy.

## Configuration Names

Set these only in the Cloudflare environment or secret manager. Do not commit values.

- `HRM_DOCUMENT_UPLOAD_MODE`
- `HRM_R2_DIRECT_UPLOAD_ENABLED`
- `HRM_R2_PRESIGN_ENDPOINT`
- `HRM_R2_PRESIGN_ACCESS_KEY_ID`
- `HRM_R2_PRESIGN_SECRET_ACCESS_KEY`
- `HRM_R2_PRESIGN_BUCKET`
- `HRM_R2_PRESIGN_REGION`
- `HRM_R2_PRESIGN_URL_TTL_SECONDS`
- `HRM_R2_DIRECT_UPLOAD_MAX_BYTES`

If any required direct upload value is missing, the app falls back to `worker_proxy`.

## R2 CORS Policy Example

Use placeholders and replace only in Cloudflare Dashboard or trusted operator tooling.

```json
[
  {
    "AllowedOrigins": ["https://hr.cafeasiana.com.mv", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["content-type", "x-amz-content-sha256"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

The allowed origins should match the deployed frontend origins. Do not use wildcard origins with credentialed HR API requests.

## Object Key Safety

Object keys are generated in the Worker. They include safe identifiers such as employee id, document type id, document id, upload id, version, and a random suffix. They do not include employee names, document numbers, bank details, or user-entered notes.

## Expiry and Integrity

Direct upload URLs are short-lived and scoped to one `PUT` operation for one object key. The complete endpoint rejects expired sessions. The minimum integrity checks are expected file size and MIME type stored in `document_upload_sessions` and verified against R2 object metadata where available. SHA-256 checksum support is accepted from clients when supplied, but mandatory browser-side hashing for large files is deferred to avoid slowing uploads.

## Orphan Cleanup

Expired pending direct upload sessions are cleanup candidates. Direct objects without completed D1 document records are treated as orphan candidates and are deleted only by safe cleanup paths that never target active employee document versions. Live R2 inventory remains redacted and dry-run by default.

## Troubleshooting

- CORS error: run `npm run verify:r2-cors-direct-upload-phase18`, confirm the R2 bucket CORS policy allows the frontend origin, `PUT`, and required upload headers.
- Expired URL: retry the failed row. Retry prepares a fresh upload session and URL.
- Complete failed: the Worker could not verify the session, document rules, or R2 object metadata. Retry the row or use Worker fallback.
- Object missing: the direct upload did not reach R2 or was cleaned up after expiry.
- Fallback used: direct mode is disabled, not configured, or the file exceeds `HRM_R2_DIRECT_UPLOAD_MAX_BYTES`.

## Security and Privacy

- Do not expose R2 secret/access keys to frontend code.
- Do not log presigned URLs, signed headers, file contents, document numbers, or sensitive employee/payroll data.
- Authenticated HR API responses remain `private, no-store`.
- Direct upload is optional; source verification passes without live R2 credentials.

## Deferred

- Mandatory SHA-256 verification for very large browser uploads.
- Direct multipart uploads.
- Automated live R2 CORS mutation. Operators must configure bucket CORS manually or through trusted Cloudflare tooling.

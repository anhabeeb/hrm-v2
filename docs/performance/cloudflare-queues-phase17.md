# Cloudflare Queues Phase 17

Phase 17 adds an optional Cloudflare Queues handoff around the existing HRM background job system. D1 source of truth remains the rule for every job. The Queue message contains only a safe identifier envelope and never includes raw `payload_json`, document metadata, payroll values, employee sensitive fields, credentials, or secrets.

## Processing Modes

- `d1`: default mode. Jobs are inserted into `background_jobs` and processed by the protected D1 runner or scheduled fallback.
- `queue`: sends safe job identifiers to Cloudflare Queues when the binding and feature flag are configured.
- `hybrid`: same Queue producer path, with D1 fallback always available.

Queue mode is disabled unless all of these are intentionally configured:

- `BACKGROUND_JOB_QUEUE` binding exists.
- `HRM_QUEUE_ENABLED=true`.
- `HRM_BACKGROUND_JOB_MODE=queue` or `HRM_BACKGROUND_JOB_MODE=hybrid`.
- `HRM_QUEUE_CONSUMER_ENABLED` is not set to `false`.

## Optional Wrangler Binding

Do not add this binding until the Cloudflare Queue has been created and reviewed by an operator.

```toml
[[queues.producers]]
binding = "BACKGROUND_JOB_QUEUE"
queue = "hrm-v2-background-jobs"

[[queues.consumers]]
queue = "hrm-v2-background-jobs"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 5
dead_letter_queue = "hrm-v2-background-jobs-dlq"
```

The current production `wrangler.toml` intentionally does not enable the Queue binding by default. That keeps Phase 17 safe to deploy before Cloudflare Queue provisioning is complete.

## Safe Queue Envelope

Messages sent to the Queue use these fields only:

- `job_id`
- `job_type`
- `module_key`
- `entity_type`
- `entity_id`
- `request_id`
- `correlation_id`
- `enqueued_at`
- `source`

No raw payload_json, file contents, document numbers, payroll amounts, account values, credentials, or private URLs are sent to Queue messages or logs.

## Failure and Fallback Behavior

1. The Worker creates the `background_jobs` row first.
2. If Queue producer mode is enabled, the Worker sends the safe envelope to Cloudflare Queues.
3. If Queue send fails, the event `queue_send_failed_d1_fallback` is recorded and the D1 job remains queued.
4. The D1 fallback runner can still process the job through the protected `/api/v1/background-jobs/run-next` route or the scheduled handler.
5. Queue consumer failures use bounded backoff. Jobs move to `DEAD_LETTERED` after retry exhaustion.

## Scheduled Fallback Runner

The Worker exports a `scheduled` handler that claims ready `QUEUED` or `RETRYING` jobs from D1. It is safe to leave this handler inert until a cron trigger is explicitly configured by operations. Set `HRM_SCHEDULED_JOB_RUNNER_ENABLED=false` to disable it.

## Job Types Covered

Phase 17 supports the queue/fallback pattern for high-latency operational jobs, including:

- `DATA_RETENTION_CLEANUP`
- `REPORT_EXPORT`
- `REPORT_SNAPSHOT_REFRESH`
- `DATA_IMPORT_VALIDATION`
- `DATA_IMPORT_APPLY`
- `DOCUMENT_COMPLIANCE_RECALCULATION`
- `DOCUMENT_EXPIRY_ALERT_GENERATION`
- `ONBOARDING_READINESS_RECALCULATION`
- `ATTENDANCE_SUMMARY_RECALCULATION`
- `DOCUMENT_UPLOAD_FOLLOW_UP`

Phase 16 retention cleanup still uses the guarded data-retention utility. Dry-run remains the default. Real cleanup still requires explicit confirmation and permission.

## Admin Status

The Backup & Retention admin workspace displays background processing status:

- current mode
- Queue producer/consumer state
- scheduled runner state
- job counts by status
- recent failed/dead-letter jobs

The endpoint is `GET /api/v1/admin/background-processing/status` and returns `Cache-Control: private, no-store`.

## Operational Notes

- Do not send secrets to Queue messages; no secrets belong in docs, Queue payloads, logs, or source control.
- Do not public-cache authenticated HR API responses.
- Do not enable destructive cleanup jobs without the Phase 16 confirmation flow.
- Use `npm run verify:cloudflare-queues-phase17`, `npm run verify:queue-readiness-phase17`, and `npm run smoke:background-processing-phase17` before deployment.
- Use `npm run jobs:run-local-phase17` only as a source-readiness dry-run. It does not mutate D1.

## Deferred

- Dedicated DLQ browser review UI beyond recent dead-letter status.
- Queue metrics API integration beyond configured/binding status.
- Production Queue provisioning; this remains an operator action outside source control.

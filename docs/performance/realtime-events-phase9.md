# Real-Time App Events Phase 9

Phase 9 adds a lightweight D1-backed app-event outbox so OmniCore - HR can refresh affected workspaces after background jobs, uploads, reports, imports, notifications, settings changes, and summary snapshot recalculations without relying only on repeated polling.

## App Event Schema

Events are stored in `app_events` with:

- Event identity: `id`, `event_type`, `module_key`, `entity_type`, `entity_id`
- Scope: `company_scope_id`, `user_scope_id`, `role_scope_key`, `visibility`
- Safe payload: `payload_json`, `query_keys_json`, `is_sensitive`
- Lifecycle: `dedupe_key`, `created_by_user_id`, `created_at`, `expires_at`, `delivered_at`

Indexes cover company/time, user/time, module/time, entity/time, dedupe, and expiry cleanup.

## Event Types

Core emitted events include:

- `background_job.queued`, `background_job.updated`, `background_job.completed`, `background_job.failed`
- `notification.created`, `notification.read`
- `document.uploaded`, `document.compliance.updated`
- `onboarding.readiness.updated`
- `employee.updated`
- `payroll.payment_method.updated`
- `attendance.summary.updated`, `payroll.summary.updated`
- `report.artifact.ready`
- `import.validation.completed`, `import.apply.completed`
- `dashboard.summary.updated`
- `module.visibility.updated`

The event payload is intentionally small. Sensitive data such as passwords, tokens, raw files, storage keys, document numbers, bank details, and payroll values is redacted or omitted.

## Scope And Visibility

Visibility modes are:

- `USER`: delivered only to the scoped user.
- `ROLE`: delivered only to matching role users.
- `COMPANY`: delivered only after module visibility, permission, and employee access-scope checks pass.
- `SYSTEM`: delivered to authorized system/admin users after the same safety checks where applicable.

The event service uses module toggles and access scopes before returning events. Employee-related events include only safe identifiers and are filtered through existing employee access-scope enforcement.

## Delivery Mode

The accepted deployment uses the authenticated polling fallback endpoint:

- `GET /api/v1/app-events/since?cursor=...`

The response includes sanitized events, `next_cursor`, `delivery_mode`, `poll_interval_ms`, and timing metadata. SSE is intentionally deferred because this phase cannot require new Durable Object or Queue bindings. The route remains available as `/api/v1/app-events/stream` and reports the fallback mode.

Authenticated event responses remain `private, no-store` and preserve the existing CORS request-id hotfix.

## Frontend Event Client

The frontend adds:

- `appEventsApi`
- `useAppEvents`
- `LiveQueryInvalidationBridge`
- `queryInvalidationRouter`
- `crossTabSync`
- `liveEventStatus`

The bridge mounts after login/session restore and stops on logout. Polling slows when the tab is hidden and resumes quickly when visible. Debug-only timing logs record delivery mode, processed event count, invalidation count, and cross-tab broadcasts.

## Query Invalidation Router

Events map to targeted TanStack Query invalidation:

- Notification events refresh notification count/list only.
- Onboarding readiness events refresh that case workspace/readiness slices only.
- Document events refresh onboarding documents/checklist/employee document summary.
- Report/import events refresh report/import/export/job lists.
- Background job events refresh job list/detail.
- Module visibility events refresh module visibility/current user/sidebar/search/dashboard related keys.
- Dashboard events refresh Command Center summary.

The router does not invalidate the entire scoped app cache for every event.

## Cross-Tab Coordination

Tabs use `BroadcastChannel` when available, with a storage-event fallback. Cross-tab payloads contain only:

- event id
- event type
- module key
- entity type/id
- query families
- timestamp

Sensitive event payloads are not written to localStorage. Logout and scope-change messages clear session-aware caches across tabs.

## Polling Reduction

Background job polling remains as a fallback. When app events are healthy, active job polling is reduced from the aggressive fallback cadence to a slower cadence. Terminal job states still stop polling.

Other pages continue to use TanStack Query cache and targeted invalidation rather than full refreshes.

## Security And Privacy

- Event endpoints require authentication.
- Payloads are sanitized server-side before storage and again before delivery.
- Disabled module events are hidden from operational UI.
- User and role visibility is enforced.
- Employee events are access-scope checked.
- No R2 keys, raw report storage keys, document numbers, bank details, payroll amounts, tokens, or passwords are exposed.
- Authenticated HR API responses stay private/no-store.

## Deferred Items

- True SSE or WebSocket fan-out is deferred until a binding-backed coordination layer is approved.
- Per-user delivery tracking with `delivered_at` is available in schema but not required for the polling fallback.
- Advanced event replay beyond the short recent-window first connect is intentionally deferred to avoid replaying stale HR events into fresh sessions.

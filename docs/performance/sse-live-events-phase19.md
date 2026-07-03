# Phase 19 SSE Live Events

## Phase 9 Recap

Phase 9 introduced `app_events` as the D1 source of truth for application invalidation events. Events are emitted after committed writes, sanitized before storage/delivery, and delivered through the authenticated `/api/v1/app-events/since` polling fallback.

## Delivery Modes

Phase 19 supports three delivery modes:

- `fetch_stream`: browser fetch with `Authorization` header and `Accept: text/event-stream`.
- `sse`: server-side SSE response format for deployments that can authenticate safely without URL tokens.
- `polling_fallback`: authenticated scoped polling through `/api/v1/app-events/since`.

The mode is controlled by environment settings:

- `HRM_LIVE_EVENTS_ENABLED`
- `HRM_LIVE_EVENTS_MODE`
- `HRM_LIVE_EVENTS_HEARTBEAT_SECONDS`
- `HRM_LIVE_EVENTS_MAX_DURATION_SECONDS`
- `HRM_LIVE_EVENTS_POLL_INTERVAL_MS`
- `HRM_LIVE_EVENTS_RECONNECT_BASE_MS`
- `HRM_LIVE_EVENTS_RECONNECT_MAX_MS`

## EventSource vs Fetch Stream

OmniCore HR uses bearer-token API authentication in the browser. Native `EventSource` cannot attach the `Authorization` header safely, so the frontend uses a fetch-based readable stream for live delivery. Native EventSource-style SSE formatting remains on the backend, but auth tokens must never be placed in query strings.

## No Token In URL Rule

The live stream endpoint is:

`GET /api/v1/app-events/stream`

The frontend sends auth in the `Authorization` header and resumes with `Last-Event-ID`. The optional `cursor` query parameter is only a safe event timestamp cursor, never a credential.

## Backend Stream Endpoint

The endpoint:

- requires authentication before streaming
- reuses `listAppEventsSince` so tenant/user/role/module/employee scope remains enforced
- sends only sanitized event data
- uses `Content-Type: text/event-stream`
- returns `private, no-store`
- sends bounded batches from D1
- closes after a maximum duration so clients reconnect cleanly

## Heartbeat And Reconnect

When no events are available, the server sends a heartbeat event with server time and current cursor. The client records heartbeat health without showing user alerts. Stream closure or transient errors trigger exponential reconnect. After repeated stream errors, polling fallback activates until streaming reconnects.

## Cursor And Last-Event-ID

The server uses event `created_at` as the stream cursor and SSE `id`. The client resumes with the `Last-Event-ID` header. Cursor handling is scoped server-side, so a cursor never bypasses visibility checks.

## Cross-Tab Leader Coordination

Tabs coordinate through `BroadcastChannel` with a safe storage fallback. One leader tab maintains the stream where possible. Other tabs receive sanitized invalidation messages containing only event id, event type, module, entity reference, query families, and timestamp. If the leader closes, another tab claims leadership.

## Polling Reduction

When the stream is healthy, polling-heavy surfaces such as background job indicators use longer intervals. If streaming fails, `/api/v1/app-events/since` resumes as the fallback. Terminal job states still stop polling.

## Event Security And Sanitization

Event payloads are sanitized by the Worker. Sensitive keys such as passwords, tokens, document numbers, salary values, bank data, raw file content, R2 keys, and storage keys are redacted or omitted. Cross-tab storage never contains event payloads.

## Admin Health Diagnostics

Admins can inspect live event health from Performance Observability. The health view shows mode, stream availability, heartbeat/reconnect settings, recent event counts, D1 backlog count, cleanup status, and sanitized recent module counts.

## Troubleshooting

### Stream Blocked By Auth

Verify the browser request sends `Authorization: Bearer ...`. Do not move the token into the URL. If auth headers are blocked by the network, the client falls back to polling.

### CORS Issue

The Worker CORS allow-list must include `Authorization`, `X-Request-ID`, `Accept`, and `Last-Event-ID`. OPTIONS preflight is handled before auth.

### Fallback Polling Active

Fallback is expected if `HRM_LIVE_EVENTS_ENABLED=false`, mode is `polling`, the stream endpoint returns a non-stream response, or the browser/network closes streams.

### Duplicate Events

The client dedupes event ids in memory. If duplicate invalidations are observed, verify cross-tab leader coordination is not blocked by the browser privacy mode.

### Stale UI After Event

Check the event `query_keys` and `queryInvalidationRouter` mapping. Events should target only affected query families, not the whole app cache.

### Cross-Tab Coordination Issue

If `BroadcastChannel` is unavailable, storage-event fallback is used. If both are unavailable, each tab may safely stream or poll independently.

## Deferred Items

- Durable Object fan-out is not required in this phase.
- WebSockets are not required.
- Per-user delivery acknowledgements remain optional because `app_events` and scoped cursors are the source of truth.

# Performance Observability Phase 11

Phase 11 adds production-safe speed telemetry for OmniCore - HR without adding paid monitoring services or new Cloudflare bindings.

## Metrics Tables

- `performance_api_metrics` stores sampled API timing, safe route keys, status codes, D1 query count/time, payload byte estimates, and hashed scope identifiers.
- `performance_frontend_metrics` stores sampled route, API client, cache, interaction, and lazy chunk timing summaries from the authenticated frontend session.
- `performance_job_metrics` stores background job queue wait, run duration, attempt count, processed count, and failure count.
- `performance_build_metrics` stores build budget snapshots when a build/audit process records them.

All tables use safe non-unique indexes for route/date/duration, frontend route/type/date, job type/status/date, and build label/date lookups.

## Sampling And Thresholds

- Normal API traffic is sampled to avoid excessive D1 writes.
- Slow API requests above 750 ms, critical API requests above 2000 ms, server errors, and large payload warnings are always eligible for capture.
- Frontend metrics are sampled, with slow route/load events above 1500 ms prioritized.
- Background job metrics are recorded from the existing Phase 7 job lifecycle on completion, failure, or cancellation.

Existing `Server-Timing`, `X-Request-Id`, CORS request-id, and `private, no-store` authenticated response behavior remain in place.

## Admin Dashboard

The dashboard route is:

`/settings/performance`

Access requires Super Admin or one of:

- `performance.metrics.view`
- `performance.metrics.manage`
- `admin.system_health.view`
- `admin.system_health.manage`

The dashboard is table-first and paginated. It shows:

- App speed overview
- Slow API endpoints
- Slow frontend routes
- Slow background jobs
- Build budget status
- Recent performance warnings

The dashboard does not expose request bodies, response bodies, raw headers, payroll values, bank details, document numbers, file names, report storage keys, tokens, or cookies.

## Retention

The cleanup utility deletes only performance metrics:

- Detailed API/frontend/job metrics default to 30 days.
- Build metrics default to 180 days.
- Business records, audit logs, security logs, notifications, document records, payroll records, and background job records are not deleted by this cleanup.

Cleanup is available only to users with `performance.metrics.manage`, `admin.system_health.manage`, or `settings.manage`.

## Sensitive Data Rules

The metrics writer and frontend collector sanitize metadata and strip sensitive keys such as password, token, cookie, authorization, salary, payroll, bank, account, document number, file name, raw, body, response, and header. Route keys are normalized by removing query strings and masking long identifiers.

Metrics failures are best-effort and must not break the app or show popup alerts.

## Budget Scripts

Run:

`npm run audit:performance-regression-budget`

The script checks local production build output and source guards for:

- frontend bundle budgets
- main entry size
- largest chunk size
- payload warning helpers
- D1 audit guard coverage
- admin-protected performance dashboard route
- sensitive logging guard

Run:

`npm run verify:performance-observability-phase11`

The verifier checks schema, indexes, permissions, routes, frontend collector, dashboard protection, retention cleanup, documentation, and regression hooks from earlier performance phases.

## Diagnosing Slow Areas

1. Open `/settings/performance`.
2. Review the overview cards for API, frontend, job, and build warning counts.
3. Use the Metric explorer filters for route, date range, severity, job type, or build label.
4. Use the Recent performance warnings table for the latest slow/error signals.
5. Cross-check D1 findings with `npm run audit:d1-query-performance`.

## Deferred

Daily aggregation (`performance_daily_summaries`) is intentionally deferred. The current phase stores sampled detail metrics and source/build budget reports. Aggregated p50/p95/p99 summaries can be added after the app has enough production metric history to justify the extra write/read complexity.

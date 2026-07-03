# Background Jobs and Performance Guide

## Background Job Drawer

The drawer shows queued, running, retrying, completed, failed, and cancelled jobs. It can show progress, counts, retry, and cancel actions where permitted.

## Workflows Using Background Jobs

- Document compliance
- Onboarding readiness
- Attendance refresh
- Reports and exports
- Imports
- Snapshots
- Cleanup work

## Phase 17 Queue and Scheduled Runner

Cloudflare Queues can accelerate long-running work when the optional `BACKGROUND_JOB_QUEUE` binding and feature flags are configured. D1 remains the source of truth: every job is created in `background_jobs` first, Queue messages contain safe identifiers only, and failed Queue sends fall back to the D1 runner.

The Backup & Retention page shows processing mode, Queue producer/consumer status, scheduled runner status, job counts, and recent failed or dead-lettered jobs. If Queue mode is unavailable, use the protected job runner controls or the scheduled fallback runner.

## Real-Time Updates

Real-time app events update caches across open tabs where supported. If events are delayed, refresh the page or relevant workspace.

## Performance Dashboard

Admins can review slow API endpoints, D1 timing, payload warnings, route metrics, build budgets, job failures, and cleanup status.

## When the App Feels Slow

Check recent warnings, slow endpoint counts, failed jobs, payload size warnings, frontend route duration, and whether browser cache is stale.

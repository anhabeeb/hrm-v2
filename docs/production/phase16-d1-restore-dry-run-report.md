# Phase 16 D1 Restore Dry-Run Report

Generated: 2026-07-03T14:19:21.733Z

This report is dry-run only. It does not mutate local, staging, or production D1.

## Checks

| Check | Status | Detail |
| --- | --- | --- |
| schema.sql exists | PASS | Local source schema is available. |
| schema hash calculated | PASS | 73698fba19f5d075b87b60cd9432afa21747582eb05db3d7838e0ce5fb1c728c |
| live production mutation | PASS | This script never executes SQL against production. |
| backup file supplied | SKIPPED | HRM_D1_RESTORE_BACKUP_FILE was not set; source-only dry-run completed. |
| manifest supplied | SKIPPED | HRM_D1_RESTORE_MANIFEST_FILE was not set. |

## Restore Safety Plan

1. Create a fresh backup before any restore attempt.
2. Restore into staging first.
3. Apply database/schema.sql and database/seed.sql in staging.
4. Run remote schema readiness, smoke tests, and HRM workflow checks.
5. Obtain operator approval and a rollback plan before production restore.
6. Never use this dry-run script as a live destructive restore command.


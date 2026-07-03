# Phase 16 D1 Restore Dry-Run Report

Generated: 2026-07-03T15:20:10.168Z

This report is dry-run only. It does not mutate local, staging, or production D1.

## Checks

| Check | Status | Detail |
| --- | --- | --- |
| schema.sql exists | PASS | Local source schema is available. |
| schema hash calculated | PASS | f45117943bcc1f989185ff3239faee9e05fd7bd61bf1c5d8220fce54a1038b01 |
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


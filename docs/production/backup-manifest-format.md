# Backup Manifest Format

Phase 16 uses a JSON manifest to describe backup artifacts without embedding secrets, raw employee data, payroll values, or document contents.

## Required Fields

```json
{
  "backup_id": "backup_example_2026-07-03T00-00-00-000Z",
  "created_at": "2026-07-03T00:00:00.000Z",
  "environment": "production",
  "database": {
    "label": "hrm-v2",
    "binding": "DB",
    "schema_hash_sha256": "hash",
    "schema_table_count": 0,
    "table_count": 0,
    "row_counts_by_table": {}
  },
  "r2": {
    "bucket_label": "hrm-v2-documents",
    "binding": "DOCUMENTS_BUCKET",
    "object_count": 0,
    "total_object_bytes": 0
  },
  "artifacts": {
    "d1_export_file": "backup.sql",
    "r2_inventory_file": "phase16-r2-inventory-report.md",
    "restore_dry_run_report": "phase16-d1-restore-dry-run-report.md"
  },
  "checksums": {
    "schema_sql_sha256": "hash",
    "d1_export_sha256": "hash",
    "r2_inventory_sha256": "hash"
  },
  "script_version": "phase16-v1",
  "created_by": "operator",
  "verification_status": "SOURCE_VALIDATION_ONLY",
  "restore_test_status": "NOT_RUN",
  "safety": {
    "secrets_included": false,
    "raw_employee_data_included": false,
    "raw_payroll_data_included": false,
    "raw_document_contents_included": false
  }
}
```

## Field Notes

- `backup_id`: unique label for this backup set.
- `created_at`: ISO timestamp.
- `environment`: operational label only.
- `database.label`: database name/id label, not a secret.
- `database.schema_hash_sha256`: hash of `database/schema.sql`.
- `database.row_counts_by_table`: safe counts only. Do not include row contents.
- `r2.bucket_label`: bucket label, not credentials.
- `r2.object_count` and `total_object_bytes`: inventory totals only.
- `artifacts`: file names or relative labels only.
- `checksums`: hashes for artifact integrity.
- `script_version`: backup script version.
- `created_by`: operator label.
- `verification_status`: source validation, live backup created, or verified.
- `restore_test_status`: not run, staging passed, staging failed, or production verified.

## Security Rules

- Never include tokens, API keys, private keys, JWT secrets, passwords, or R2 credentials.
- Never include raw document numbers, payroll amounts, bank account values, document contents, or employee PII.
- Store live manifests outside the source tree and outside the clean ZIP.
- Use this sample format with `npm run backup:create-manifest-phase16`.

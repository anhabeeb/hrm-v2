# HRM v2 Remote D1 Schema Repair

Use this flow when the remote Cloudflare D1 database is behind the current HRM v2 app schema.

Do not run `database/seed.sql` before the remote schema-ready verifier passes.

## Command Flow

Use only this flow:

1. Audit remote schema:

```powershell
npm run audit:remote-schema
```

2. Generate repair SQL:

```powershell
npm run generate:remote-schema-repair
```

3. Review generated repair file:

```text
database/remote_schema_repair_generated.sql
```

4. Apply generated repair:

```powershell
npm run apply:remote-schema-repair
```

5. Verify remote schema is ready:

```powershell
npm run verify:remote-schema-ready
```

6. Then run full schema:

```powershell
npx wrangler d1 execute hrm-v2 --remote --config worker/wrangler.toml --file database/schema.sql
```

7. Then run seed:

```powershell
npx wrangler d1 execute hrm-v2 --remote --config worker/wrangler.toml --file database/seed.sql
```

## Warnings

- Do not run seed before `remote_schema_repair_generated.sql` has applied and `npm run verify:remote-schema-ready` passes.
- Do not run old manual repair files. The supported repair file is `database/remote_schema_repair_generated.sql`, created from the current remote audit.
- Do not run `database/remote_schema_repair.sql`, `database/remote_schema_repair_d1.sql`, `database/remote_roster_settings_repair.sql`, or `database/remote_roster_settings_repair_2.sql` unless a future audit intentionally regenerates them for the current remote database.
- Do not rerun a failed generated repair blindly.
- If apply fails, inspect `database/remote_schema_repair_apply_report.json`.
- Re-run audit and regenerate a new repair file after partial success or failure.
- The generator intentionally avoids `BEGIN TRANSACTION`, `COMMIT`, `SAVEPOINT`, and `RELEASE` because D1/Wrangler command files can reject those statements.
- The repair executor applies generated SQL one statement at a time so the exact failed statement is recorded.
- The audit fails if Wrangler output cannot be parsed or if the remote database unexpectedly reports zero tables.

## Rebuild Coverage

The generator supports rebuild repairs for CHECK-constrained tables that cannot be altered in place:

- `leave_policies.salary_deduction_mode`
- `leave_requests.salary_deduction_mode`
- `leave_policy_deduction_rules.deduction_mode`
- `roster_periods.status`
- `roster_assignments.status`
- `payroll_periods.status`
- `payroll_runs.status`

Rebuilds preserve existing rows, preserve existing remote columns where possible, add missing current schema columns, and recreate current schema indexes.

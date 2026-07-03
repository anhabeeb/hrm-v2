import fs from "node:fs";
import path from "node:path";
import {
  extractRowsFromWrangler,
  parseSchema,
  quoteIdent,
  runWranglerSql
} from "./remote-d1-schema-utils.mjs";
import { projectPath } from "./phase21-utils.mjs";

export const phase21RepairSqlPath = "docs/production/phase21-remote-d1-additive-repair.sql";
export const phase21RepairNotesPath = "docs/production/phase21-remote-d1-repair-notes.md";

export const recentPhase21SchemaTables = [
  "employee_onboarding_cases",
  "employee_onboarding_tasks",
  "employee_lifecycle_events",
  "employee_documents",
  "employee_document_versions",
  "document_required_rules",
  "document_upload_sessions",
  "payment_institutions",
  "employee_payment_methods",
  "notifications",
  "notification_preferences",
  "approval_notification_templates",
  "background_jobs",
  "background_job_events",
  "app_events",
  "report_export_artifacts",
  "data_import_batches",
  "data_import_rows",
  "attendance_summary_snapshots",
  "payroll_summary_snapshots",
  "dashboard_summary_snapshots",
  "system_health_snapshots",
  "performance_api_metrics",
  "performance_frontend_metrics",
  "performance_job_metrics",
  "performance_build_metrics",
  "data_retention_settings",
  "data_retention_policies"
];

function remoteRows(sql) {
  return extractRowsFromWrangler(runWranglerSql(sql));
}

export function loadRemoteSchemaSnapshot() {
  const tableRows = remoteRows("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name;");
  if (!tableRows.length) throw new Error("Remote sqlite_master returned zero HRM tables. Remote schema verification is blocked.");
  const indexRows = remoteRows("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND tbl_name NOT GLOB '_cf_*' ORDER BY name;");
  const remoteTables = {};
  for (const table of tableRows) {
    const name = String(table.name);
    const pragmaRows = remoteRows(`PRAGMA table_info(${JSON.stringify(name)});`);
    remoteTables[name] = {
      name,
      sql: String(table.sql ?? ""),
      columns: Object.fromEntries(pragmaRows.map((row) => [String(row.name), row])),
      columnOrder: pragmaRows.map((row) => String(row.name)),
      indexes: indexRows.filter((row) => String(row.tbl_name) === name).map((row) => ({ name: String(row.name), sql: String(row.sql ?? "") }))
    };
  }
  return remoteTables;
}

export function compareRemoteSchema(schema = parseSchema(), remoteTables) {
  const missingTables = [];
  const missingColumns = [];
  const missingIndexes = [];
  const recentSystemChecks = [];

  for (const [tableName, tableDef] of Object.entries(schema.tables)) {
    const remote = remoteTables[tableName];
    if (!remote) {
      missingTables.push(tableName);
      continue;
    }
    for (const column of tableDef.columnOrder) {
      if (!remote.columns[column]) missingColumns.push({ table: tableName, column, definition: tableDef.columns[column] });
    }
  }

  for (const [tableName, indexDefs] of Object.entries(schema.indexes)) {
    const remote = remoteTables[tableName];
    if (!remote) continue;
    const remoteIndexNames = new Set(remote.indexes.map((index) => index.name));
    for (const indexDef of indexDefs) {
      if (!remoteIndexNames.has(indexDef.name)) missingIndexes.push({ table: tableName, index: indexDef.name, definition: indexDef.sql });
    }
  }

  for (const tableName of recentPhase21SchemaTables) {
    recentSystemChecks.push({
      table: tableName,
      exists: Boolean(remoteTables[tableName]),
      local: Boolean(schema.tables[tableName])
    });
  }

  return {
    required_table_count: Object.keys(schema.tables).length,
    remote_table_count: Object.keys(remoteTables).length,
    missing_tables: missingTables,
    missing_columns: missingColumns,
    missing_indexes: missingIndexes,
    recent_system_checks: recentSystemChecks
  };
}

function stripSemicolon(sql) {
  return String(sql ?? "").trim().replace(/;+\s*$/, "");
}

function indexesForTable(schema, tableName) {
  return schema.indexes[tableName]?.map((index) => stripSemicolon(index.sql)).filter(Boolean) ?? [];
}

export function buildAdditiveRepairSql(schema, comparison) {
  const statements = [
    "-- Phase 21 additive-only remote D1 repair.",
    "-- Review before running. Back up remote D1 first. Run in staging first when possible.",
    "-- Allowed statement types: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, ALTER TABLE ADD COLUMN.",
    "-- This file intentionally contains no DROP, DELETE, UPDATE, INSERT, table rebuild, or seed statements."
  ];

  for (const tableName of comparison.missing_tables ?? []) {
    const table = schema.tables[tableName];
    if (!table) continue;
    statements.push(`-- Missing table: ${tableName}`);
    statements.push(stripSemicolon(table.createSql));
    statements.push(...indexesForTable(schema, tableName));
  }

  for (const missing of comparison.missing_columns ?? []) {
    if ((comparison.missing_tables ?? []).includes(missing.table)) continue;
    const definition = schema.tables[missing.table]?.columns?.[missing.column] ?? missing.definition;
    if (!definition) continue;
    statements.push(`ALTER TABLE ${quoteIdent(missing.table)} ADD COLUMN ${definition}`);
  }

  for (const missing of comparison.missing_indexes ?? []) {
    if ((comparison.missing_tables ?? []).includes(missing.table)) continue;
    if (missing.definition) statements.push(stripSemicolon(missing.definition));
  }

  const body = statements.filter(Boolean).join(";\n\n");
  return `${body};\n`;
}

export function validateAdditiveSql(sql) {
  const withoutComments = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
  const forbidden = /\b(DROP|DELETE|UPDATE|INSERT|REPLACE|TRUNCATE|ALTER\s+TABLE\s+\S+\s+RENAME|PRAGMA\s+foreign_keys\s*=\s*OFF|BEGIN|COMMIT|SAVEPOINT|RELEASE)\b/i;
  if (forbidden.test(withoutComments)) throw new Error("Phase 21 additive repair SQL contains a forbidden destructive or transaction-control statement.");
  const statements = withoutComments
    .split(";")
    .map((statement) => statement.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
  const unsafe = statements.filter((statement) => !/^(CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS|ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN)/i.test(statement));
  if (unsafe.length) throw new Error(`Phase 21 additive repair SQL has unsupported statements: ${unsafe.slice(0, 3).join(" | ")}`);
}

export function writeAdditiveRepairArtifacts(schema, comparison, sourceStatus) {
  const sql = buildAdditiveRepairSql(schema, comparison);
  validateAdditiveSql(sql);
  const sqlPath = projectPath(phase21RepairSqlPath);
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.writeFileSync(sqlPath, sql);

  const missingCount = (comparison.missing_tables?.length ?? 0) + (comparison.missing_columns?.length ?? 0) + (comparison.missing_indexes?.length ?? 0);
  const notes = `# Phase 21 Remote D1 Additive Repair Notes

Generated: ${new Date().toISOString()}

Source status: **${sourceStatus}**

Repair needed: **${missingCount > 0 ? "YES" : "NO"}**

Missing tables: ${comparison.missing_tables?.length ?? 0}

Missing columns: ${comparison.missing_columns?.length ?? 0}

Missing indexes: ${comparison.missing_indexes?.length ?? 0}

Safety rules:

- Back up remote D1 before repair.
- Run in staging first if possible.
- Apply only after reviewing \`${phase21RepairSqlPath}\`.
- This repair is additive only.
- Never drop production data.
- Never seed production company data as part of Phase 21.
`;
  const notesPath = projectPath(phase21RepairNotesPath);
  fs.mkdirSync(path.dirname(notesPath), { recursive: true });
  fs.writeFileSync(notesPath, `${notes.trim()}\n`);
}

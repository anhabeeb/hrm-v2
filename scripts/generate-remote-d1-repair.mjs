import fs from "node:fs";
import {
  auditReportPath,
  defaultExpressionForColumn,
  findLegacyManualRepairFiles,
  generatedRepairPath,
  parseSchema,
  quoteIdent,
  rebuildRules
} from "./remote-d1-schema-utils.mjs";

function readAuditReport() {
  if (!fs.existsSync(auditReportPath)) {
    throw new Error("Missing database/remote_schema_audit_report.json. Run npm run audit:remote-schema first.");
  }
  return JSON.parse(fs.readFileSync(auditReportPath, "utf8"));
}

function remoteColumnDefinition(column) {
  const name = quoteIdent(column.name);
  const type = String(column.type ?? "").trim();
  const parts = [name];
  if (type) parts.push(type);
  if (Number(column.notnull ?? 0) === 1) parts.push("NOT NULL");
  if (column.dflt_value !== null && column.dflt_value !== undefined) parts.push(`DEFAULT ${column.dflt_value}`);
  return parts.join(" ");
}

function isRebuildTable(report, tableName) {
  return report.tables_requiring_rebuild?.includes(tableName);
}

function indexesForTable(schema, tableName) {
  return schema.indexes[tableName]?.map((index) => stripSemicolon(index.sql)) ?? [];
}

function stripSemicolon(sql) {
  return String(sql).trim().replace(/;+\s*$/, "");
}

function createMissingTableStatements(schema, tableName) {
  const table = schema.tables[tableName];
  if (!table) return [];
  return [`-- Create missing table ${tableName}`, stripSemicolon(table.createSql), ...indexesForTable(schema, tableName)];
}

function rebuildTableStatements(schema, report, tableName) {
  const table = schema.tables[tableName];
  const remote = report.remote_tables?.[tableName];
  if (!table || !remote) return [];

  const tempName = `${tableName}_old_repair`;
  if (report.remote_tables?.[tempName]) {
    throw new Error(`Refusing to generate rebuild for ${tableName}: ${tempName} already exists. Inspect the remote database before continuing.`);
  }

  const remoteColumns = remote.columns ?? {};
  const currentColumnSet = new Set(table.columnOrder);
  const remoteColumnNames = Object.keys(remoteColumns);
  const extraColumns = remoteColumnNames.filter((column) => !currentColumnSet.has(column));
  const insertColumns = [...table.columnOrder, ...extraColumns];
  const selectExpressions = insertColumns.map((column) => {
    if (remoteColumns[column]) return quoteIdent(column);
    return `${defaultExpressionForColumn(table.columns[column])} AS ${quoteIdent(column)}`;
  });

  const statements = [
    `-- Rebuild ${tableName} to repair CHECK constraints and add missing columns`,
    `ALTER TABLE ${quoteIdent(tableName)} RENAME TO ${quoteIdent(tempName)}`,
    stripSemicolon(table.createSql)
  ];

  for (const column of extraColumns) {
    statements.push(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${remoteColumnDefinition(remoteColumns[column])}`);
  }

  statements.push(
    `INSERT INTO ${quoteIdent(tableName)} (${insertColumns.map(quoteIdent).join(", ")}) SELECT ${selectExpressions.join(", ")} FROM ${quoteIdent(tempName)}`,
    `DROP TABLE ${quoteIdent(tempName)}`,
    ...indexesForTable(schema, tableName)
  );
  return statements;
}

function addMissingColumnStatements(schema, report) {
  const statements = [];
  for (const missing of report.missing_columns ?? []) {
    if (isRebuildTable(report, missing.table)) continue;
    if (report.missing_tables?.includes(missing.table)) continue;
    const definition = schema.tables[missing.table]?.columns?.[missing.column] ?? missing.definition;
    if (!definition) continue;
    statements.push(`ALTER TABLE ${quoteIdent(missing.table)} ADD COLUMN ${definition}`);
  }
  return statements.length ? ["-- Add missing columns", ...statements] : [];
}

function addMissingIndexStatements(report) {
  const statements = (report.missing_indexes ?? []).map((index) => index.definition).filter(Boolean);
  return statements.length ? ["-- Recreate missing indexes", ...statements] : [];
}

function main() {
  const schema = parseSchema();
  const legacyFiles = findLegacyManualRepairFiles();
  if (legacyFiles.length) {
    throw new Error(`Legacy manual repair files still exist in database root: ${legacyFiles.join(", ")}. Remove them before generating a repair.`);
  }

  const report = readAuditReport();
  const remoteTableCount = Number(report.remote_table_count ?? Object.keys(report.remote_tables ?? {}).length);
  if (!remoteTableCount || Object.keys(report.remote_tables ?? {}).length === 0) {
    throw new Error("Audit report contains zero remote tables. Refusing to generate a repair because remote table parsing may have failed.");
  }
  if ((report.missing_tables ?? []).length >= Object.keys(schema.tables).length) {
    throw new Error("Refusing to generate a repair that creates every schema table. Re-run the audit after fixing Wrangler output parsing.");
  }
  if (report.stale_repair_tables?.length) {
    throw new Error(`Remote database has stale repair tables: ${report.stale_repair_tables.join(", ")}. Inspect and resolve before generating a repair.`);
  }

  const statements = [
    "-- Generated HRM v2 remote D1 schema repair.",
    "-- Review this file before applying it.",
    "-- Do not include transaction-control statements in D1/Wrangler command files.",
    "-- Apply with: npm run apply:remote-schema-repair",
    "PRAGMA foreign_keys = OFF"
  ];

  for (const tableName of report.missing_tables ?? []) {
    statements.push(...createMissingTableStatements(schema, tableName));
  }

  const rebuildOrder = Object.keys(rebuildRules).filter((tableName) => report.tables_requiring_rebuild?.includes(tableName));
  for (const tableName of rebuildOrder) {
    statements.push(...rebuildTableStatements(schema, report, tableName));
  }

  statements.push(...addMissingColumnStatements(schema, report));
  statements.push(...addMissingIndexStatements(report));
  statements.push("PRAGMA foreign_keys = ON");

  const sql = `${statements.filter(Boolean).join(";\n\n")};\n`;
  fs.writeFileSync(generatedRepairPath, sql);
  console.log("Remote D1 repair SQL generated.");
  console.log(`Rebuild tables: ${rebuildOrder.join(", ") || "none"}`);
  console.log(`Missing tables: ${(report.missing_tables ?? []).length}`);
  console.log(`Missing columns: ${(report.missing_columns ?? []).filter((item) => !isRebuildTable(report, item.table)).length}`);
  console.log("Generated file: database/remote_schema_repair_generated.sql");
}

try {
  main();
} catch (error) {
  console.error("Remote D1 repair generation failed.");
  console.error(error.message);
  process.exit(1);
}

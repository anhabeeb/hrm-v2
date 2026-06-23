import {
  analyzeCheckCompatibility,
  auditReportPath,
  extractRowsFromWrangler,
  findLegacyManualRepairFiles,
  parseSchema,
  rebuildRules,
  runWranglerSql,
  seedPath,
  writeJson,
  readText
} from "./remote-d1-schema-utils.mjs";

function info(message) {
  console.log(`[remote-schema-audit] ${message}`);
}

function remoteRows(sql) {
  return extractRowsFromWrangler(runWranglerSql(sql));
}

function seedBlockers(remoteTables) {
  const blockers = [];
  const rosterSettings = remoteTables.roster_settings;
  if (rosterSettings) {
    for (const column of ["module_enabled", "lock_roster_after_attendance_payroll_placeholder"]) {
      if (!rosterSettings.columns[column]) blockers.push({ table: "roster_settings", column, reason: "Seed/settings code expects this column." });
    }
  }
  const seed = readText(seedPath);
  for (const match of seed.matchAll(/INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO\s+([A-Za-z_][\w]*)\s*\(([^)]+)\)/gi)) {
    const table = match[1];
    if (!remoteTables[table]) continue;
    const columns = match[2].split(",").map((part) => part.trim().replaceAll('"', ""));
    for (const column of columns) {
      if (!remoteTables[table].columns[column]) blockers.push({ table, column, reason: "Referenced by seed.sql insert columns." });
    }
  }
  return blockers;
}

async function main() {
  const schema = parseSchema();
  const legacyFiles = findLegacyManualRepairFiles();
  if (legacyFiles.length) {
    throw new Error(`Legacy manual repair files still exist in database root: ${legacyFiles.join(", ")}. Remove them before auditing remote D1 schema.`);
  }

  info("Inspecting sqlite_master tables...");
  const tableRows = remoteRows("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name;");
  if (tableRows.length === 0) {
    throw new Error("sqlite_master returned zero remote tables. Refusing to write a repair audit for an existing HRM v2 remote database.");
  }
  const indexRows = remoteRows("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' AND tbl_name NOT GLOB '_cf_*' ORDER BY name;");

  const remoteTables = {};
  for (const table of tableRows) {
    const name = String(table.name);
    info(`Inspecting columns for ${name}`);
    const pragmaRows = remoteRows(`PRAGMA table_info(${JSON.stringify(name)});`);
    remoteTables[name] = {
      name,
      sql: String(table.sql ?? ""),
      columns: Object.fromEntries(pragmaRows.map((row) => [String(row.name), row])),
      columnOrder: pragmaRows.map((row) => String(row.name)),
      indexes: indexRows.filter((row) => row.tbl_name === name).map((row) => ({ name: row.name, sql: row.sql }))
    };
  }
  if (Object.keys(remoteTables).length === 0) {
    throw new Error("Remote D1 audit produced zero remote tables. Could not safely continue.");
  }

  const missingTables = [];
  const missingColumns = [];
  const missingIndexes = [];
  const checkIssues = [];
  const tablesRequiringRebuild = [];

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
    const remoteIndexNames = new Set(remote.indexes.map((index) => String(index.name)));
    for (const indexDef of indexDefs) {
      if (!remoteIndexNames.has(indexDef.name)) missingIndexes.push({ table: tableName, index: indexDef.name, definition: indexDef.sql });
    }
  }

  for (const [tableName, rule] of Object.entries(rebuildRules)) {
    const remote = remoteTables[tableName];
    if (!remote) continue;
    const result = analyzeCheckCompatibility(remote.sql, rule);
    if (!result.compatible) {
      const issue = { table: tableName, column: rule.column, ...result };
      checkIssues.push(issue);
      tablesRequiringRebuild.push(tableName);
    }
  }

  const staleRepairTables = Object.keys(remoteTables).filter((name) => name.endsWith("_old_repair"));
  const blockers = seedBlockers(remoteTables);
  const report = {
    generated_at: new Date().toISOString(),
    required_table_count: Object.keys(schema.tables).length,
    remote_table_count: Object.keys(remoteTables).length,
    missing_tables: missingTables,
    missing_columns: missingColumns,
    missing_indexes: missingIndexes,
    check_constraint_issues: checkIssues,
    tables_requiring_rebuild: [...new Set(tablesRequiringRebuild)],
    stale_repair_tables: staleRepairTables,
    seed_blockers: blockers,
    remote_tables: remoteTables
  };

  writeJson(auditReportPath, report);
  console.log("");
  console.log("Remote D1 schema audit complete.");
  console.log(`Missing tables: ${missingTables.length}`);
  console.log(`Missing columns: ${missingColumns.length}`);
  console.log(`Missing indexes: ${missingIndexes.length}`);
  console.log(`CHECK issues: ${checkIssues.length}`);
  console.log(`Tables requiring rebuild: ${report.tables_requiring_rebuild.join(", ") || "none"}`);
  console.log(`Seed blockers: ${blockers.length}`);
  console.log(`Report saved: database/remote_schema_audit_report.json`);
}

main().catch((error) => {
  console.error("Remote D1 schema audit failed.");
  console.error(error.message);
  if (error.output) console.error(error.output);
  process.exit(1);
});

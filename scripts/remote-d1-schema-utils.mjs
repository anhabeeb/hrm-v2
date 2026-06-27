import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const schemaPath = path.join(rootDir, "database", "schema.sql");
export const seedPath = path.join(rootDir, "database", "seed.sql");
export const auditReportPath = path.join(rootDir, "database", "remote_schema_audit_report.json");
export const generatedRepairPath = path.join(rootDir, "database", "remote_schema_repair_generated.sql");
export const applyReportPath = path.join(rootDir, "database", "remote_schema_repair_apply_report.json");
export const readyReportPath = path.join(rootDir, "database", "remote_schema_ready_report.json");
export const legacyManualRepairFiles = [
  "remote_schema_repair.sql",
  "remote_schema_repair_d1.sql",
  "remote_roster_settings_repair.sql",
  "remote_roster_settings_repair_2.sql"
];

export const databaseName = "hrm-v2";
export const wranglerConfig = "worker/wrangler.toml";

export const advancedDeductionModes = [
  "NONE",
  "FULL_DAY",
  "WORKED_DAYS_ONLY",
  "CUSTOM",
  "NO_DEDUCTION",
  "DEDUCT_FROM_BASIC_SALARY",
  "DEDUCT_FROM_GROSS_SALARY",
  "DEDUCT_FROM_SELECTED_ALLOWANCE",
  "FIXED_AMOUNT_PER_DAY",
  "DAILY_RATE_FORMULA",
  "DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED",
  "PAY_ONLY_WORKED_DAYS"
];

export const rebuildRules = {
  leave_policies: { column: "salary_deduction_mode", requiredValues: advancedDeductionModes },
  leave_requests: { column: "salary_deduction_mode", requiredValues: advancedDeductionModes, allowNull: true },
  leave_policy_deduction_rules: { column: "deduction_mode", requiredValues: advancedDeductionModes },
  roster_periods: { column: "status", requiredValues: ["DRAFT", "PUBLISHED", "LOCKED", "ARCHIVED"] },
  roster_assignments: {
    column: "status",
    requiredValues: [
      "SCHEDULED",
      "OFF",
      "LEAVE",
      "ABSENT_PLACEHOLDER",
      "UNASSIGNED",
      "DRAFT",
      "PUBLISHED",
      "CHANGED_AFTER_PUBLISH",
      "CANCELLED",
      "DAY_OFF",
      "SICK_LEAVE",
      "LONG_LEAVE",
      "PUBLIC_HOLIDAY",
      "CONFLICT"
    ]
  },
  payroll_periods: {
    column: "status",
    requiredValues: [
      "DRAFT",
      "CALCULATING",
      "READY_FOR_REVIEW",
      "SUBMITTED_FOR_APPROVAL",
      "APPROVED_PLACEHOLDER",
      "FINALIZED_PLACEHOLDER",
      "REJECTED",
      "SENT_BACK",
      "APPROVED",
      "FINALIZED",
      "LOCKED",
      "CANCELLED",
      "OPEN",
      "PROCESSING",
      "REVIEW",
      "PAID",
      "CLOSED"
    ]
  },
  payroll_runs: {
    column: "status",
    requiredValues: [
      "DRAFT",
      "CALCULATING",
      "READY_FOR_REVIEW",
      "SUBMITTED_FOR_APPROVAL",
      "APPROVED_PLACEHOLDER",
      "FINALIZED_PLACEHOLDER",
      "REJECTED",
      "SENT_BACK",
      "APPROVED",
      "FINALIZED",
      "LOCKED",
      "CANCELLED",
      "PROCESSING",
      "REVIEW",
      "PAID"
    ]
  }
};

export const codeRequiredColumns = {
  document_types: {
    allowed_mime_types: "allowed_mime_types TEXT",
    max_file_size_mb: "max_file_size_mb REAL NOT NULL DEFAULT 10 CHECK (max_file_size_mb > 0)",
    allow_multiple_files: "allow_multiple_files INTEGER NOT NULL DEFAULT 0 CHECK (allow_multiple_files IN (0, 1))",
    requires_expiry_date: "requires_expiry_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_expiry_date IN (0, 1))",
    requires_issue_date: "requires_issue_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_issue_date IN (0, 1))",
    requires_document_number: "requires_document_number INTEGER NOT NULL DEFAULT 0 CHECK (requires_document_number IN (0, 1))",
    expiry_required: "expiry_required INTEGER NOT NULL DEFAULT 0 CHECK (expiry_required IN (0, 1))",
    issue_date_required: "issue_date_required INTEGER NOT NULL DEFAULT 0 CHECK (issue_date_required IN (0, 1))",
    document_number_required: "document_number_required INTEGER NOT NULL DEFAULT 0 CHECK (document_number_required IN (0, 1))"
  }
};

const constraintStarts = new Set(["PRIMARY", "UNIQUE", "FOREIGN", "CHECK", "CONSTRAINT"]);

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function findLegacyManualRepairFiles() {
  const databaseDir = path.join(rootDir, "database");
  return legacyManualRepairFiles.filter((fileName) => fs.existsSync(path.join(databaseDir, fileName)));
}

export function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function splitTopLevel(input) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quote) {
      if (char === quote) {
        if (next === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") {
      quote = "]";
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function findCreateTableStatements(sql) {
  const results = [];
  const pattern = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+("?[\w]+"?)\s*\(/gi;
  let match;
  while ((match = pattern.exec(sql))) {
    const tableName = match[1].replaceAll('"', "");
    const statementStart = match.index;
    const openIndex = pattern.lastIndex - 1;
    let depth = 0;
    let quote = null;
    let closeIndex = -1;
    for (let index = openIndex; index < sql.length; index += 1) {
      const char = sql[index];
      const next = sql[index + 1];
      if (quote) {
        if (char === quote) {
          if (next === quote) {
            index += 1;
          } else {
            quote = null;
          }
        }
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          closeIndex = index;
          break;
        }
      }
    }
    if (closeIndex === -1) continue;
    const semicolonIndex = sql.indexOf(";", closeIndex);
    const statementEnd = semicolonIndex === -1 ? closeIndex + 1 : semicolonIndex + 1;
    const body = sql.slice(openIndex + 1, closeIndex);
    results.push({ tableName, body, createSql: sql.slice(statementStart, statementEnd).trim() });
    pattern.lastIndex = statementEnd;
  }
  return results;
}

export function parseSchema(sql = readText(schemaPath)) {
  const tables = {};
  for (const table of findCreateTableStatements(sql)) {
    const columnOrder = [];
    const columns = {};
    for (const rawPart of splitTopLevel(table.body)) {
      const part = rawPart.trim().replace(/,$/, "");
      if (!part) continue;
      const firstToken = part.match(/^"([^"]+)"|^\[([^\]]+)\]|^`([^`]+)`|^([A-Za-z_][\w]*)/)?.slice(1).find(Boolean);
      if (!firstToken || constraintStarts.has(firstToken.toUpperCase())) continue;
      columnOrder.push(firstToken);
      columns[firstToken] = part;
    }
    tables[table.tableName] = { ...table, columnOrder, columns };
  }

  const indexes = {};
  const indexPattern = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+("?[\w]+"?)\s+ON\s+("?[\w]+"?)[\s\S]*?;/gi;
  let match;
  while ((match = indexPattern.exec(sql))) {
    const indexName = match[1].replaceAll('"', "");
    const tableName = match[2].replaceAll('"', "");
    indexes[tableName] ??= [];
    indexes[tableName].push({ name: indexName, sql: match[0].trim() });
  }
  return { tables, indexes };
}

export function runWranglerSql(command) {
  const sql = String(command);
  const sqlLabel = sql.replace(/\s+/g, " ").trim().slice(0, 80);
  const wranglerCliPath = path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js");
  if (!fs.existsSync(wranglerCliPath)) {
    throw new Error("Local Wrangler CLI was not found. Run npm ci before using remote D1 schema repair tooling.");
  }
  const args = [
    wranglerCliPath,
    "d1",
    "execute",
    databaseName,
    "--remote",
    "--config",
    wranglerConfig,
    "--json",
    "--command",
    sql
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.join(os.tmpdir(), "hrm-v2-wrangler-logs"),
      WRANGLER_WRITE_LOGS: "false"
    }
  });
  const stderr = String(result.stderr ?? "");
  const finalOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error || result.status !== 0) {
    const exitCode = result.status ?? "spawn-failed";
    const spawnError = result.error ? ` spawn error: ${result.error.message}` : "";
    const error = new Error(`Wrangler D1 command failed for SQL "${sqlLabel}" with exit code ${exitCode}.${spawnError} stderr: ${stderr.trim() || "(empty)"}`);
    error.output = finalOutput;
    error.stderr = stderr;
    error.command = sqlLabel;
    error.exitCode = exitCode;
    error.spawnError = result.error;
    throw error;
  }
  return finalOutput;
}

export function parseWranglerJson(output) {
  const end = output.lastIndexOf("]");
  if (end === -1) return null;
  for (let start = output.indexOf("["); start !== -1 && start < end; start = output.indexOf("[", start + 1)) {
    try {
      const parsed = JSON.parse(output.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Keep looking; Wrangler prefixes human-readable logs before JSON.
    }
  }
  return null;
}

function rowsFromWranglerJson(parsed) {
  return parsed.flatMap((item) => {
    if (Array.isArray(item?.results)) return item.results;
    if (Array.isArray(item?.result)) return item.result;
    if (Array.isArray(item?.rows)) return item.rows;
    return [];
  });
}

function isTableBorderLine(line) {
  return /^[\s+|│┌┬┐├┼┤└┴┘─\-]+$/.test(line);
}

function splitTableCells(line) {
  const delimiter = line.includes("│") ? "│" : "|";
  return line
    .split(delimiter)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function parseWranglerTable(output) {
  const rows = [];
  let headers = null;
  let sawTableSyntax = false;

  for (const line of String(output).split(/\r?\n/)) {
    if (!line.includes("│") && !line.includes("|")) continue;
    sawTableSyntax = true;
    if (isTableBorderLine(line)) continue;
    const cells = splitTableCells(line);
    if (!cells.length) continue;
    if (!headers) {
      headers = cells;
      continue;
    }
    if (cells.length !== headers.length) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null])));
  }

  return { parsed: sawTableSyntax && Array.isArray(headers), rows };
}

export function extractRowsFromWrangler(output) {
  const parsed = parseWranglerJson(output);
  if (parsed) return rowsFromWranglerJson(parsed);

  const table = parseWranglerTable(output);
  if (table.parsed) return table.rows;

  throw new Error("Could not parse Wrangler D1 output. Use --json or update parser.");
}

export function analyzeCheckCompatibility(tableSql, rule) {
  const sql = String(tableSql ?? "");
  const missingValues = rule.requiredValues.filter((value) => !sql.includes(`'${value}'`));
  const hasColumn = sql.toLowerCase().includes(rule.column.toLowerCase());
  const hasCheck = /CHECK\s*\(/i.test(sql);
  return {
    compatible: hasColumn && missingValues.length === 0,
    hasColumn,
    hasCheck,
    missingValues
  };
}

export function defaultExpressionForColumn(definition) {
  const defaultMatch = definition.match(/\bDEFAULT\s+((?:\([^)]*\))|(?:'[^']*')|(?:"[^"]*")|[^\s,]+)/i);
  if (defaultMatch) return defaultMatch[1];
  if (/\bINTEGER\b/i.test(definition) || /\bREAL\b/i.test(definition)) return "0";
  if (/\bTEXT\b/i.test(definition) && /\bNOT\s+NULL\b/i.test(definition)) return "''";
  return "NULL";
}

export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (quote) {
      if (char === quote) {
        if (next === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement && !statement.startsWith("--")) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail && !tail.startsWith("--")) statements.push(tail);
  return statements;
}

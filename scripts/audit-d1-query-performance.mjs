import fs from "node:fs";
import path from "node:path";
import { parseSchema, rootDir } from "./remote-d1-schema-utils.mjs";

const ROUTE_DIR = path.join(rootDir, "worker", "src", "routes");
const SCHEMA_PATH = path.join(rootDir, "database", "schema.sql");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll("\\", "/");
}

function lineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function snippets(content, pattern) {
  const results = [];
  for (const match of content.matchAll(pattern)) {
    const text = match[0].replace(/\s+/g, " ").trim();
    results.push({ line: lineNumber(content, match.index ?? 0), text });
  }
  return results;
}

function extractSqlStrings(content) {
  const sql = [];
  const pattern = /prepare\(\s*(`[\s\S]*?`|"[^"]*"|'[^']*')/g;
  for (const match of content.matchAll(pattern)) {
    const raw = match[1];
    const body = raw.slice(1, -1);
    if (/\bSELECT\b|\bUPDATE\b|\bINSERT\b|\bDELETE\b/i.test(body)) {
      sql.push({ line: lineNumber(content, match.index ?? 0), text: body.replace(/\$\{[\s\S]*?\}/g, "?").replace(/\s+/g, " ").trim() });
    }
  }
  return sql;
}

function parseIndexes(schema) {
  const indexColumns = new Map();
  for (const [table, indexes] of Object.entries(schema.indexes)) {
    for (const index of indexes) {
      const match = index.sql.match(/\(([\s\S]+)\)/);
      if (!match) continue;
      const columns = match[1]
        .split(",")
        .map((part) => part.trim().replace(/^COALESCE\(([^,\s]+).*/, "$1").replace(/["`]/g, "").split(/\s+/)[0])
        .filter(Boolean);
      for (const column of columns) {
        const key = `${table}.${column}`;
        indexColumns.set(key, (indexColumns.get(key) ?? 0) + 1);
      }
    }
  }
  return indexColumns;
}

function queryTables(sql) {
  const tables = [];
  for (const match of sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_][\w]*)/gi)) {
    tables.push(match[1]);
  }
  return [...new Set(tables)];
}

function whereColumns(sql) {
  const columns = [];
  const where = sql.match(/\bWHERE\b([\s\S]*?)(?:\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i)?.[1] ?? "";
  for (const match of where.matchAll(/\b([A-Za-z_][\w]*)\s*(?:=|IN\b|LIKE\b|>=|<=|>|<)/gi)) {
    columns.push(match[1]);
  }
  return [...new Set(columns)];
}

function orderColumns(sql) {
  const order = sql.match(/\bORDER\s+BY\b([\s\S]*?)(?:\bLIMIT\b|$)/i)?.[1] ?? "";
  return [...order.matchAll(/\b([A-Za-z_][\w]*)\b/g)].map((match) => match[1]).filter((column) => !["ASC", "DESC", "NULLS", "FIRST", "LAST", "CASE", "WHEN", "THEN", "ELSE", "END", "COALESCE"].includes(column.toUpperCase()));
}

function likelyIndexed(indexColumns, table, column) {
  return indexColumns.has(`${table}.${column}`) || column === "id";
}

function main() {
  const schemaSql = read(SCHEMA_PATH);
  const schema = parseSchema(schemaSql);
  const indexColumns = parseIndexes(schema);
  const routeFiles = walk(ROUTE_DIR);
  const report = {
    generated_at: new Date().toISOString(),
    scanned_route_files: routeFiles.length,
    select_star: [],
    unbounded_lists: [],
    unindexed_filters: [],
    n_plus_one_risks: [],
    disabled_module_notes: [],
    payload_notes: []
  };

  for (const file of routeFiles) {
    const content = read(file);
    const fileName = relative(file);
    for (const hit of snippets(content, /\bSELECT\s+\*/gi)) {
      report.select_star.push({ file: fileName, ...hit });
    }
    for (const sql of extractSqlStrings(content)) {
      const isListLike = /\bSELECT\b/i.test(sql.text) && /\.first\s*\(/i.test(content.slice(Math.max(0, content.indexOf(sql.text) - 160), content.indexOf(sql.text) + 160)) === false;
      if (isListLike && /\bORDER\s+BY\b/i.test(sql.text) && !/\bLIMIT\b/i.test(sql.text) && !/COUNT\s*\(/i.test(sql.text)) {
        report.unbounded_lists.push({ file: fileName, line: sql.line, text: sql.text.slice(0, 220) });
      }
      const tables = queryTables(sql.text);
      const filters = whereColumns(sql.text);
      for (const table of tables) {
        for (const column of filters) {
          if (!schema.tables[table]?.columns?.[column]) continue;
          if (!likelyIndexed(indexColumns, table, column)) {
            report.unindexed_filters.push({ file: fileName, line: sql.line, table, column, text: sql.text.slice(0, 180) });
          }
        }
      }
    }
    for (const hit of snippets(content, /\bfor\s*\([^)]*(?:await|\.prepare\()/gi)) {
      report.n_plus_one_risks.push({ file: fileName, ...hit });
    }
    if (/moduleStatuses|isOperationalModuleEnabled|requireOperationalModule/i.test(content)) {
      report.disabled_module_notes.push({ file: fileName, note: "contains disabled-module guards or module status checks" });
    }
  }

  report.select_star_count = report.select_star.length;
  report.unbounded_list_count = report.unbounded_lists.length;
  report.unindexed_filter_count = report.unindexed_filters.length;
  report.n_plus_one_risk_count = report.n_plus_one_risks.length;

  console.log("D1 query performance audit complete.");
  console.log(`Route files scanned: ${report.scanned_route_files}`);
  console.log(`SELECT * occurrences: ${report.select_star_count}`);
  console.log(`Potential unbounded ordered lists: ${report.unbounded_list_count}`);
  console.log(`Potential unindexed filters: ${report.unindexed_filter_count}`);
  console.log(`Potential N+1 risks: ${report.n_plus_one_risk_count}`);
  console.log("");
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error("D1 query performance audit failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

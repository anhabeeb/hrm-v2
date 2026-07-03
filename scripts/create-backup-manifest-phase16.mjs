import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "database", "schema.sql");
const outputPath = path.join(root, "docs", "production", "phase16-backup-manifest-example.json");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tableNames(schemaSql) {
  return [...schemaSql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+("?[\w]+"?)/gi)].map((match) => match[1].replaceAll('"', ""));
}

function safeEnvLabel() {
  return process.env.HRM_BACKUP_ENV || process.env.ENVIRONMENT || "source-validation";
}

function createManifest() {
  if (!fs.existsSync(schemaPath)) throw new Error("database/schema.sql is required to create a backup manifest.");
  const schema = read(schemaPath);
  const tables = tableNames(schema);
  const now = new Date().toISOString();
  return {
    backup_id: `backup_example_${now.replace(/[:.]/g, "-")}`,
    created_at: now,
    environment: safeEnvLabel(),
    database: {
      label: process.env.HRM_D1_DATABASE_NAME || "hrm-v2",
      binding: "DB",
      schema_hash_sha256: sha256(schema),
      schema_table_count: tables.length,
      table_count: tables.length,
      row_counts_by_table: Object.fromEntries(tables.slice(0, 12).map((table) => [table, "not_collected_in_source_validation"]))
    },
    r2: {
      bucket_label: "hrm-v2-documents",
      binding: "DOCUMENTS_BUCKET",
      object_count: "not_collected_in_source_validation",
      total_object_bytes: "not_collected_in_source_validation"
    },
    artifacts: {
      d1_export_file: "example-d1-export.sql",
      r2_inventory_file: "phase16-r2-inventory-report.md",
      restore_dry_run_report: "phase16-d1-restore-dry-run-report.md"
    },
    checksums: {
      schema_sql_sha256: sha256(schema),
      d1_export_sha256: "fill_after_live_export",
      r2_inventory_sha256: "fill_after_live_inventory"
    },
    script_version: "phase16-v1",
    created_by: process.env.USERNAME || process.env.USER || "operator",
    verification_status: "SOURCE_VALIDATION_ONLY",
    restore_test_status: "NOT_RUN",
    safety: {
      secrets_included: false,
      raw_employee_data_included: false,
      raw_payroll_data_included: false,
      raw_document_contents_included: false
    }
  };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(createManifest(), null, 2)}\n`);
console.log("Phase 16 safe backup manifest example written.");
console.log(path.relative(root, outputPath).replaceAll("\\", "/"));

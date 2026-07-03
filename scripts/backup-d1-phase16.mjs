import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "database", "schema.sql");
const seedPath = path.join(root, "database", "seed.sql");
const defaultOutputDir = path.resolve(root, "..", "hrm-v2-phase16-backups", "d1");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isInsideRoot(targetPath) {
  const relative = path.relative(root, path.resolve(targetPath));
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function requiredSourceChecks() {
  const missing = [schemaPath, seedPath].filter((file) => !fs.existsSync(file));
  if (missing.length) throw new Error(`Missing required source files: ${missing.map((file) => path.relative(root, file)).join(", ")}`);
}

function liveEnabled() {
  return process.env.HRM_BACKUP_LIVE === "true";
}

function backupOutputDir() {
  return path.resolve(process.env.HRM_D1_BACKUP_OUTPUT_DIR || defaultOutputDir);
}

function commandPreview(databaseName, outputFile) {
  return [
    "npx",
    "wrangler",
    "d1",
    "export",
    databaseName,
    "--remote",
    "--config",
    "worker/wrangler.toml",
    "--output",
    outputFile
  ];
}

function writeManifest(outputDir, outputFile, databaseName) {
  const manifest = {
    backup_id: `d1_backup_${new Date().toISOString().replace(/[:.]/g, "-")}`,
    created_at: new Date().toISOString(),
    environment: process.env.HRM_BACKUP_ENV || "source-validation",
    database: {
      label: databaseName,
      binding: "DB",
      schema_hash_sha256: sha256File(schemaPath)
    },
    artifacts: {
      d1_export_file: path.basename(outputFile),
      schema_file: "database/schema.sql",
      seed_file: "database/seed.sql"
    },
    checksums: {
      d1_export_sha256: fs.existsSync(outputFile) ? sha256File(outputFile) : "not_created_in_dry_run",
      schema_sql_sha256: sha256File(schemaPath)
    },
    script_version: "phase16-d1-backup-v1",
    created_by: process.env.USERNAME || process.env.USER || "operator",
    verification_status: fs.existsSync(outputFile) ? "BACKUP_FILE_CREATED" : "DRY_RUN_ONLY",
    restore_test_status: "NOT_RUN",
    safety: {
      destructive_sql_run: false,
      secrets_included: false,
      output_inside_source_zip: isInsideRoot(outputDir)
    }
  };
  const manifestPath = path.join(outputDir, "phase16-d1-backup-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

function main() {
  requiredSourceChecks();
  const databaseName = process.env.HRM_D1_DATABASE_NAME || "hrm-v2";
  const outputDir = backupOutputDir();
  const outputFile = path.join(outputDir, `hrm-v2-d1-backup-${new Date().toISOString().slice(0, 10)}.sql`);
  const preview = commandPreview(databaseName, outputFile);

  if (!liveEnabled()) {
    console.log("Phase 16 D1 backup dry-run/source validation.");
    console.log("No Cloudflare command was executed.");
    console.log(`Output directory default: ${outputDir}`);
    console.log(`Output directory inside source root: ${isInsideRoot(outputDir) ? "yes - choose an external directory for live backups" : "no"}`);
    console.log(`Would run: ${preview.join(" ")}`);
    return;
  }

  if (process.env.HRM_BACKUP_CONFIRM !== "BACKUP_D1") {
    throw new Error("Live D1 backup requires HRM_BACKUP_CONFIRM=BACKUP_D1.");
  }
  if (isInsideRoot(outputDir)) {
    throw new Error("Refusing to write live backup output inside the source tree. Set HRM_D1_BACKUP_OUTPUT_DIR outside the project.");
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = preview.slice(1);
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false });
  if (result.status !== 0) {
    throw new Error(`Wrangler D1 export failed with exit ${result.status}. stderr: ${String(result.stderr ?? "").slice(0, 1000)}`);
  }
  const manifestPath = writeManifest(outputDir, outputFile, databaseName);
  console.log("Phase 16 D1 backup completed.");
  console.log(`Manifest: ${manifestPath}`);
}

try {
  main();
} catch (error) {
  console.error("Phase 16 D1 backup failed safely.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

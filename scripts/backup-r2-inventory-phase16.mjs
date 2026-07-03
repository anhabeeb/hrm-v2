import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "docs", "production", "phase16-r2-inventory-report.md");

function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function liveEnabled() {
  return process.env.HRM_R2_BACKUP_LIVE === "true";
}

function redactObject(object) {
  const key = String(object.key ?? object.name ?? "");
  const prefix = key.includes("/") ? key.split("/")[0] : "root";
  return {
    key_hash: key ? hashKey(key) : "missing",
    prefix,
    size: Number(object.size ?? object.uploaded?.size ?? 0) || 0,
    uploaded: object.uploaded ?? object.created ?? null
  };
}

function listLiveObjects(bucketName) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["wrangler", "r2", "object", "list", bucketName, "--json"];
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`Wrangler R2 inventory failed with exit ${result.status}. stderr: ${String(result.stderr ?? "").slice(0, 1000)}`);
  }
  const parsed = JSON.parse(String(result.stdout ?? "[]"));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.objects) ? parsed.objects : [];
}

function buildInventory() {
  const bucketName = process.env.HRM_R2_BUCKET_NAME || "hrm-v2-documents";
  if (!liveEnabled()) {
    return {
      mode: "DRY_RUN_SOURCE_VALIDATION",
      bucket_label: bucketName,
      generated_at: new Date().toISOString(),
      total_objects: "not_collected_in_dry_run",
      total_bytes: "not_collected_in_dry_run",
      objects_by_prefix: {},
      orphan_candidate_count: "not_collected_in_dry_run",
      missing_metadata_candidate_count: "not_collected_in_dry_run",
      sample_objects: [],
      notes: ["No Cloudflare command was executed.", "Set HRM_R2_BACKUP_LIVE=true and HRM_R2_BACKUP_CONFIRM=BACKUP_R2_INVENTORY for live inventory."]
    };
  }

  if (process.env.HRM_R2_BACKUP_CONFIRM !== "BACKUP_R2_INVENTORY") {
    throw new Error("Live R2 inventory requires HRM_R2_BACKUP_CONFIRM=BACKUP_R2_INVENTORY.");
  }
  const objects = listLiveObjects(bucketName).map(redactObject);
  const totalBytes = objects.reduce((sum, item) => sum + item.size, 0);
  const byPrefix = objects.reduce((acc, item) => {
    acc[item.prefix] ??= { count: 0, bytes: 0 };
    acc[item.prefix].count += 1;
    acc[item.prefix].bytes += item.size;
    return acc;
  }, {});
  return {
    mode: "LIVE_INVENTORY_REDACTED",
    bucket_label: bucketName,
    generated_at: new Date().toISOString(),
    total_objects: objects.length,
    total_bytes: totalBytes,
    objects_by_prefix: byPrefix,
    orphan_candidate_count: "requires D1 metadata comparison",
    missing_metadata_candidate_count: "requires D1 metadata comparison",
    sample_objects: objects.slice(0, 20),
    notes: ["Object keys are hashed/redacted. File contents were not downloaded."]
  };
}

function writeReport(inventory) {
  const lines = [
    "# Phase 16 R2 Backup Inventory Report",
    "",
    `Generated: ${inventory.generated_at}`,
    `Mode: ${inventory.mode}`,
    `Bucket label: ${inventory.bucket_label}`,
    "",
    "## Summary",
    "",
    `- Total objects: ${inventory.total_objects}`,
    `- Total bytes: ${inventory.total_bytes}`,
    `- Orphan candidates: ${inventory.orphan_candidate_count}`,
    `- Missing metadata candidates: ${inventory.missing_metadata_candidate_count}`,
    "",
    "## Objects By Prefix",
    "",
    "```json",
    JSON.stringify(inventory.objects_by_prefix, null, 2),
    "```",
    "",
    "## Redacted Sample Objects",
    "",
    "```json",
    JSON.stringify(inventory.sample_objects, null, 2),
    "```",
    "",
    "## Notes",
    "",
    ...inventory.notes.map((note) => `- ${note}`),
    ""
  ];
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

try {
  const inventory = buildInventory();
  writeReport(inventory);
  console.log("Phase 16 R2 inventory report written.");
  console.log(path.relative(root, reportPath).replaceAll("\\", "/"));
} catch (error) {
  console.error("Phase 16 R2 inventory failed safely.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

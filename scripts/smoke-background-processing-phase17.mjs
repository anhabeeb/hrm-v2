import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const dryRun = process.env.HRM_PHASE17_BACKGROUND_SMOKE_WRITE !== "true";

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const schema = read("database/schema.sql");
const backgroundJobs = read("worker/src/utils/background-jobs.ts");
const adminRoutes = read("worker/src/routes/admin.ts");
const packageJson = JSON.parse(read("package.json") || "{}");

check(dryRun, "Phase 17 smoke must remain dry-run unless HRM_PHASE17_BACKGROUND_SMOKE_WRITE=true is set intentionally.");
check(schema.includes("background_jobs") && schema.includes("background_job_events"), "Background job tables are missing from schema.");
check(schema.includes("DEAD_LETTERED"), "Dead-letter job status is missing from schema.");
check(backgroundJobs.includes("runScheduledBackgroundJobs"), "Scheduled fallback runner missing.");
check(backgroundJobs.includes("handleBackgroundJobQueue"), "Queue consumer handler missing.");
check(backgroundJobs.includes("sendJobToQueueIfEnabled"), "Queue producer handoff missing.");
check(backgroundJobs.includes("getBackgroundProcessingStatus"), "Admin health/status helper missing.");
check(adminRoutes.includes("/background-processing/status"), "Admin background processing status endpoint missing.");
check(packageJson.scripts?.["smoke:background-processing-phase17"] === "node scripts/smoke-background-processing-phase17.mjs", "Smoke script package entry missing.");

if (failures.length) {
  console.error("Background processing Phase 17 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  dry_run: true,
  message: "Phase 17 background processing smoke completed without mutating data."
}, null, 2));

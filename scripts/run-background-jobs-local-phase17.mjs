import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowWrite = process.env.HRM_PHASE17_RUN_LOCAL_WRITE === "true";

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const readiness = {
  dry_run: !allowWrite,
  source_only: true,
  message: allowWrite
    ? "Live local execution is intentionally not implemented in this source-tree helper. Use the protected Worker endpoint or wrangler dev with bindings."
    : "Source-only dry-run completed. This helper does not mutate D1 by default.",
  checks: {
    background_job_utility: exists("worker/src/utils/background-jobs.ts"),
    worker_queue_handler: exists("worker/src/index.ts"),
    admin_status_route: exists("worker/src/routes/admin.ts"),
    schema: exists("database/schema.sql")
  },
  safe_commands: [
    "npm run smoke:background-processing-phase17",
    "npm run verify:cloudflare-queues-phase17",
    "npm run verify:queue-readiness-phase17"
  ]
};

if (allowWrite) {
  console.error("Refusing source-tree local write execution. Run background jobs through Worker bindings or the protected API runner.");
  console.log(JSON.stringify(readiness, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(readiness, null, 2));

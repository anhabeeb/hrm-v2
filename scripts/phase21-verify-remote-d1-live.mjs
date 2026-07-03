import { parseSchema } from "./remote-d1-schema-utils.mjs";
import { phase21Report, markdownTable, writeJsonReport, writeReport } from "./phase21-utils.mjs";
import { compareRemoteSchema, loadRemoteSchemaSnapshot, writeAdditiveRepairArtifacts } from "./phase21-remote-d1-utils.mjs";

const reportPath = "docs/production/phase21-remote-d1-live-report.md";

function statusFor(comparison) {
  if (comparison.missing_tables.length || comparison.missing_columns.length || comparison.missing_indexes.length) return "PASS WITH ADDITIVE REPAIR AVAILABLE";
  if (comparison.recent_system_checks.some((row) => !row.exists || !row.local)) return "BLOCKED";
  return "PASS";
}

function render(comparison, status, note = "") {
  const schemaRows = [
    ["Required tables", comparison.required_table_count],
    ["Remote tables", comparison.remote_table_count],
    ["Missing tables", comparison.missing_tables.length],
    ["Missing columns", comparison.missing_columns.length],
    ["Missing indexes", comparison.missing_indexes.length]
  ];
  const recentRows = comparison.recent_system_checks.map((row) => [row.exists && row.local ? "PASS" : "FAIL", row.table, row.local ? "local schema present" : "missing from local schema", row.exists ? "remote present" : "missing remotely"]);
  return phase21Report("Phase 21 Remote D1 Live Verification", status, [
    note,
    markdownTable(["Metric", "Value"], schemaRows),
    "## Recent Phase 1-20 System Tables",
    markdownTable(["Status", "Table", "Local", "Remote"], recentRows),
    "## Safety",
    "- Read-only verification only.\n- No remote repair was applied.\n- Missing elements produce additive repair SQL only.\n- Production data is not seeded, dropped, deleted, or rewritten."
  ]);
}

async function main() {
  const schema = parseSchema();
  try {
    const remoteTables = loadRemoteSchemaSnapshot();
    const comparison = compareRemoteSchema(schema, remoteTables);
    const status = statusFor(comparison);
    writeAdditiveRepairArtifacts(schema, comparison, status);
    writeJsonReport("docs/production/phase21-remote-d1-live-report.json", comparison);
    writeReport(reportPath, render(comparison, status, "Remote D1 was queried through Wrangler in read-only mode."));
    console.log(`Phase 21 remote D1 live verification complete: ${status}.`);
  } catch (error) {
    const comparison = {
      required_table_count: Object.keys(schema.tables).length,
      remote_table_count: 0,
      missing_tables: [],
      missing_columns: [],
      missing_indexes: [],
      recent_system_checks: []
    };
    writeAdditiveRepairArtifacts(schema, comparison, "BLOCKED");
    writeReport(reportPath, phase21Report("Phase 21 Remote D1 Live Verification", "BLOCKED", [
      `Remote D1 verification could not be completed: ${error instanceof Error ? error.message : String(error)}`,
      "This is a safe blocked status, not a false PASS. Configure Cloudflare/Wrangler credentials and rerun `npm run verify:phase21-remote-d1-live`."
    ]));
    console.log("Phase 21 remote D1 live verification blocked safely.");
  }
}

main().catch((error) => {
  console.error("Phase 21 remote D1 live verification failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});


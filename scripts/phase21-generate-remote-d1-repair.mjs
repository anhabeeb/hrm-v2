import { parseSchema } from "./remote-d1-schema-utils.mjs";
import { phase21Report, writeReport } from "./phase21-utils.mjs";
import { compareRemoteSchema, loadRemoteSchemaSnapshot, phase21RepairSqlPath, phase21RepairNotesPath, writeAdditiveRepairArtifacts } from "./phase21-remote-d1-utils.mjs";

async function main() {
  const schema = parseSchema();
  try {
    const remoteTables = loadRemoteSchemaSnapshot();
    const comparison = compareRemoteSchema(schema, remoteTables);
    const missingCount = comparison.missing_tables.length + comparison.missing_columns.length + comparison.missing_indexes.length;
    const status = missingCount ? "PASS WITH ADDITIVE REPAIR AVAILABLE" : "PASS";
    writeAdditiveRepairArtifacts(schema, comparison, status);
    console.log(`Phase 21 additive repair generation complete. Missing elements: ${missingCount}.`);
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
    writeReport(phase21RepairNotesPath, phase21Report("Phase 21 Remote D1 Additive Repair Notes", "BLOCKED", [
      `Could not query remote D1 through Wrangler: ${error instanceof Error ? error.message : String(error)}`,
      `The placeholder repair SQL at \`${phase21RepairSqlPath}\` contains no destructive or schema-changing statements. Configure Cloudflare/Wrangler credentials, run \`npm run verify:phase21-remote-d1-live\`, then rerun this generator.`
    ]));
    console.log("Phase 21 additive repair generation blocked safely.");
  }
}

main().catch((error) => {
  console.error("Phase 21 additive repair generator failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});


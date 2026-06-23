import fs from "node:fs";
import {
  applyReportPath,
  generatedRepairPath,
  runWranglerSql,
  splitSqlStatements,
  writeJson
} from "./remote-d1-schema-utils.mjs";

function stripSqlComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function containsTransactionControl(sql) {
  const withoutComments = stripSqlComments(sql);
  return /(^|;)\s*(BEGIN\s+TRANSACTION|BEGIN|COMMIT|SAVEPOINT\s+\w+|RELEASE\s+\w+)\s*;?/im.test(withoutComments);
}

function main() {
  if (!fs.existsSync(generatedRepairPath)) {
    throw new Error("Missing database/remote_schema_repair_generated.sql. Run npm run generate:remote-schema-repair first.");
  }
  const sql = fs.readFileSync(generatedRepairPath, "utf8");
  if (containsTransactionControl(sql)) {
    throw new Error("Generated repair SQL contains transaction-control statements. Remove them before applying to D1.");
  }
  const statements = splitSqlStatements(sql);
  const report = {
    started_at: new Date().toISOString(),
    statement_count: statements.length,
    applied: [],
    failed: null,
    completed_at: null
  };

  console.log(`Applying ${statements.length} remote D1 repair statements one by one.`);
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    console.log(`[${index + 1}/${statements.length}] ${statement.slice(0, 120).replace(/\s+/g, " ")}`);
    try {
      const output = runWranglerSql(statement);
      report.applied.push({ index: index + 1, statement, output });
      writeJson(applyReportPath, report);
    } catch (error) {
      report.failed = {
        index: index + 1,
        statement,
        message: error.message,
        output: error.output ?? null
      };
      report.completed_at = new Date().toISOString();
      writeJson(applyReportPath, report);
      console.error("Remote D1 repair failed. Stopping without applying remaining statements.");
      console.error(`Failed statement #${index + 1}:`);
      console.error(statement);
      if (error.output) console.error(error.output);
      process.exit(1);
    }
  }
  report.completed_at = new Date().toISOString();
  writeJson(applyReportPath, report);
  console.log("Remote D1 repair apply completed.");
  console.log("Report saved: database/remote_schema_repair_apply_report.json");
}

try {
  main();
} catch (error) {
  console.error("Remote D1 repair apply failed before execution.");
  console.error(error.message);
  process.exit(1);
}

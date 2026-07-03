import fs from "node:fs";
import { phase21Report, projectPath, writeReport } from "./phase21-utils.mjs";

const reportInputs = [
  ["Remote D1 schema readiness", "docs/production/phase21-remote-d1-live-report.md"],
  ["Additive repair status", "docs/production/phase21-remote-d1-repair-notes.md"],
  ["Frontend deployment status", "docs/production/phase21-frontend-deployment-report.md"],
  ["Smoke/login/bootstrap status", "docs/production/phase21-production-smoke-live-report.md"],
  ["R2 upload status", "docs/production/phase21-r2-upload-live-report.md"],
  ["Background processing status", "docs/production/phase21-background-processing-live-report.md"],
  ["Live events status", "docs/production/phase21-live-events-live-report.md"],
  ["Security status", "docs/production/phase21-security-live-report.md"],
  ["Load test status", "docs/production/phase21-readonly-loadtest-report.md"]
];

function extractStatus(markdown) {
  return markdown.match(/Status:\s+\*\*([^*]+)\*\*/i)?.[1]?.trim() ?? "MISSING";
}

function decision(statuses) {
  if (statuses.some((item) => item.status === "BLOCKED" || item.status === "MISSING")) return "NO-GO";
  if (statuses.some((item) => /SOURCE READY|LIVE NOT VERIFIED|WARNING|SKIPPED|ADDITIVE REPAIR/i.test(item.status))) return "GO WITH WARNINGS";
  return "GO";
}

function main() {
  const statuses = reportInputs.map(([label, relativePath]) => {
    const fullPath = projectPath(relativePath);
    if (!fs.existsSync(fullPath)) return { label, path: relativePath, status: "MISSING" };
    return { label, path: relativePath, status: extractStatus(fs.readFileSync(fullPath, "utf8")) };
  });
  const rows = statuses.map((item) => `| ${item.label} | ${item.status} | ${item.path} |`).join("\n");
  const finalDecision = decision(statuses);
  writeReport("docs/production/phase21-go-no-go-report.md", phase21Report("Phase 21 Production Go/No-Go Report", finalDecision, [
    `Recommended decision: **${finalDecision}**`,
    `| Area | Status | Report |\n| --- | --- | --- |\n${rows}`,
    "If any live environment variables were missing, the decision is intentionally not a false GO. Complete live checks before final production sign-off."
  ]));
  console.log(`Phase 21 go/no-go report generated: ${finalDecision}.`);
}

main();


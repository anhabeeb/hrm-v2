import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const caseId = process.env.HRM_DIAG_CASE_ID || "";
const includeLegacy = process.env.HRM_DIAG_INCLUDE_LEGACY === "1";
const outputPath = path.join(root, "docs/production/onboarding-section-readiness-aggregator-diagnostics.md");

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

const aggregator = read("worker/src/onboarding/section-readiness-aggregator.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const page = read("frontend/src/pages/LifecyclePage.tsx");

const checks = [
  ["Aggregator helper exists", aggregator.includes("getFastOnboardingSectionReadiness")],
  ["Retry endpoint uses section status aggregator", lifecycle.includes("rebuildStaleOrMissingOnboardingSectionReadiness")],
  ["Readiness status endpoint uses fast section readiness", lifecycle.includes("getFastOnboardingSectionReadiness")],
  ["Frontend displays Setup Readiness", page.includes("Setup Readiness")],
  ["Final verification remains required", page.includes("Final verification required") && page.includes("activation_requires_final_verification")]
];

const lines = [
  "# Onboarding Section Readiness Aggregator Diagnostics",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Case ID: ${caseId || "not provided"}`,
  `Legacy comparison requested: ${includeLegacy ? "yes" : "no"}`,
  "",
  "## Source Checks",
  "",
  ...checks.map(([label, passed]) => `- ${passed ? "PASS" : "FAIL"} - ${label}`),
  "",
  "## Runtime Diagnostic Plan",
  "",
  caseId
    ? `Use an authenticated session to call /api/v1/onboarding/cases/${caseId}/readiness${includeLegacy ? "?include_legacy_comparison=1" : ""}.`
    : "Set HRM_DIAG_CASE_ID to run a live one-case readiness diagnostic outside source-validation mode.",
  "",
  "The normal readiness path should return section-status readiness, section rows, timing metadata, and activation_requires_final_verification=true without loading the full workspace.",
  "",
  "## Safety",
  "",
  "- This diagnostic script does not write D1 data.",
  "- It does not activate employees.",
  "- It does not print secrets or authentication tokens."
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error("Onboarding section readiness aggregator diagnostics found source issues:");
  for (const [label] of failed) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Onboarding section readiness aggregator diagnostics written to ${path.relative(root, outputPath).replace(/\\/g, "/")}.`);

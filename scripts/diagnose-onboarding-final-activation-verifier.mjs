import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const caseId = process.env.HRM_DIAG_CASE_ID || "";
const runRebuild = process.env.HRM_DIAG_RUN_REBUILD === "1";
const includeLegacy = process.env.HRM_DIAG_INCLUDE_LEGACY === "1";
const outputPath = path.join(root, "docs/production/onboarding-final-activation-verifier-diagnostics.md");

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

const verifier = read("worker/src/onboarding/final-activation-verifier.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const page = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");

const checks = [
  ["Final verifier service exists", verifier.includes("verifyOnboardingCaseForActivation")],
  ["Final verifier has stale rebuild helper", verifier.includes("rebuildStaleSectionsBeforeFinalVerification")],
  ["Final verifier marks passing sections verified", verifier.includes("markSectionsVerified") && verifier.includes("last_verified_at")],
  ["Final verification endpoint exists", lifecycle.includes('/cases/:caseId/final-verification')],
  ["Activation endpoints are guarded by final verifier", lifecycle.includes("runOnboardingFinalVerificationForRoute") && lifecycle.includes("verification.can_activate")],
  ["Frontend calls explicit final verification before activation", api.includes("finalVerifyOnboardingActivation") && page.includes("api.finalVerifyOnboardingActivation")]
];

const lines = [
  "# Onboarding Final Activation Verifier Diagnostics",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Case ID: ${caseId || "not provided"}`,
  `Run rebuild requested: ${runRebuild ? "yes" : "no"}`,
  `Legacy comparison requested: ${includeLegacy ? "yes" : "no"}`,
  "",
  "## Source Checks",
  "",
  ...checks.map(([label, passed]) => `- ${passed ? "PASS" : "FAIL"} - ${label}`),
  "",
  "## Runtime Diagnostic Plan",
  "",
  caseId
    ? [
        `1. Use an authenticated session to call /api/v1/onboarding/cases/${caseId}/section-readiness.`,
        runRebuild ? `2. Rebuild stale/missing statuses with /api/v1/onboarding/cases/${caseId}/section-statuses/rebuild before final verification.` : "2. Skip rebuild unless stale sections are reported.",
        `3. Call /api/v1/onboarding/cases/${caseId}/final-verification and compare blockers/stale/failed sections with section-status readiness.`,
        includeLegacy ? `4. Optionally compare /api/v1/onboarding/cases/${caseId}/readiness?include_legacy_comparison=1 for diagnostic drift only.` : "4. Legacy readiness comparison was not requested."
      ].join("\n")
    : "Set HRM_DIAG_CASE_ID to run a one-case live diagnostic outside source-validation mode.",
  "",
  "## Expected Safe Behavior",
  "",
  "- Section statuses may show Ready for final verification, but final activation still requires the backend verifier.",
  "- Blocked business setup must return blockers, not a system failure.",
  "- Failed system checks must include safe reason, next action, and request ID.",
  "- This diagnostic does not write D1 data, does not activate employees, and does not print secrets."
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error("Onboarding final activation verifier diagnostics found source issues:");
  for (const [label] of failed) console.error(`- ${label}`);
  process.exit(1);
}

console.log(`Onboarding final activation verifier diagnostics written to ${path.relative(root, outputPath).replace(/\\/g, "/")}.`);

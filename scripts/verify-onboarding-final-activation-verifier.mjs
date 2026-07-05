import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function check(message, condition) {
  if (!condition) failures.push(message);
}

function sliceBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

const packageJson = JSON.parse(read("package.json"));
const finalVerifier = read("worker/src/onboarding/final-activation-verifier.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const evaluator = read("worker/src/onboarding/section-evaluators.ts");
const aggregator = read("worker/src/onboarding/section-readiness-aggregator.ts");
const statusRegistry = read("worker/src/onboarding/section-status-registry.ts");
const api = read("frontend/src/lib/api.ts");
const page = read("frontend/src/pages/LifecyclePage.tsx");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

for (const helper of [
  "verifyOnboardingCaseForActivation",
  "rebuildStaleSectionsBeforeFinalVerification",
  "runFinalSectionVerification",
  "markSectionsVerified",
  "buildActivationBlockerResponse"
]) {
  check(`final verifier: ${helper} export exists`, finalVerifier.includes(`export async function ${helper}`) || finalVerifier.includes(`export function ${helper}`));
}

check("final verifier uses section-status aggregator, not workspace loader", finalVerifier.includes("rebuildAndAggregateOnboardingSectionReadiness") && !finalVerifier.includes("loadOnboardingWorkspace"));
check("final verifier does not call old heavy readiness primary path", !finalVerifier.includes("getEmployeeOnboardingReadiness"));
check("final verifier uses bounded execution timeout", finalVerifier.includes("FINAL_VERIFICATION_TIMEOUT_MS") && finalVerifier.includes("timeoutMs"));
check("final verifier marks sections verified", finalVerifier.includes("status = 'verified'") && finalVerifier.includes("is_verified = 1") && finalVerifier.includes("last_verified_at"));
check("final verifier returns structured blocker response", finalVerifier.includes("action_errors") && finalVerifier.includes("details") && finalVerifier.includes("request_id"));
check("final verifier sanitizes sensitive failure messages", /password\|token\|secret\|document number\|account number/i.test(finalVerifier) && !/stack\s*:/i.test(finalVerifier));
check("final verifier treats stale as blocking", finalVerifier.includes('"stale"') && finalVerifier.includes("must be rechecked before activation"));
check("final verifier protects already-active/archived employees", finalVerifier.includes("EMPLOYEE_ALREADY_ACTIVE") && finalVerifier.includes("EMPLOYEE_ARCHIVED"));

const finalVerificationRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/final-verification"', 'onboardingRoutes.post("/cases/:caseId/complete"');
check("final verification endpoint exists", finalVerificationRoute.length > 0);
check("final verification endpoint has required permissions", ["onboarding.activation.submit", "onboarding.activation.activate", "onboarding.activation.manage", "onboarding.workspace.activate", "onboarding.cases.manage"].every((permission) => finalVerificationRoute.includes(permission)));
check("final verification endpoint uses no-store and Vary Origin", finalVerificationRoute.includes('Cache-Control", "private, no-store"') && finalVerificationRoute.includes('Vary", "Origin"'));
check("final verification endpoint runs final verifier and returns sections", finalVerificationRoute.includes("runOnboardingFinalVerificationForRoute") && finalVerificationRoute.includes("section_status_update"));

const completeRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/complete"', 'onboardingRoutes.get("/cases/:caseId"');
const submitRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/submit-activation"', 'onboardingRoutes.post("/cases/:caseId/approve-activation"');
const activateRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/activate"', 'onboardingRoutes.post("/cases/:caseId/activate-with-override"');
const overrideRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/activate-with-override"', 'onboardingRoutes.get("/cases/:caseId/events"');
const activateFunction = sliceBetween(lifecycle, "export async function activateEmployeeFromOnboarding", "export async function activateEmployeeWithOnboardingOverride");
const submitFunction = sliceBetween(lifecycle, "export async function submitEmployeeActivationForApproval", "export async function approveEmployeeActivation");
const overrideFunction = sliceBetween(lifecycle, "export async function activateEmployeeWithOnboardingOverride", "export async function createOnboardingApprovalInstance");

check("complete route runs final verifier before submission", completeRoute.includes("runOnboardingFinalVerificationForRoute") && completeRoute.includes("finalVerificationBlockedResponse"));
check("submit activation path requires final verifier", submitRoute.includes("submitEmployeeActivationForApproval") && submitFunction.includes("runOnboardingFinalVerificationForRoute") && submitFunction.includes("verification.can_activate"));
check("activate path requires final verifier", activateRoute.includes("activateEmployeeFromOnboarding") && activateFunction.includes("runOnboardingFinalVerificationForRoute") && activateFunction.includes("verification.can_activate"));
check("override activation path requires reason and final verifier", overrideRoute.includes("ONBOARDING_OVERRIDE_REASON_REQUIRED") && overrideFunction.includes("runOnboardingFinalVerificationForRoute") && overrideFunction.includes("verification.can_activate"));
check("activation route does not use section-status candidate as authority", !activateFunction.includes("can_activate_candidate") && !submitFunction.includes("can_activate_candidate") && !overrideFunction.includes("can_activate_candidate"));
check("activation route does not use old heavy readiness as primary path", !activateFunction.includes("getEmployeeOnboardingReadiness") && !completeRoute.includes("getEmployeeOnboardingReadiness"));
check("blocked/failed verification returns structured 409/500", lifecycle.includes("finalVerificationBlockedResponse") && lifecycle.includes("buildActivationBlockerResponse"));
check("final verification audit and app events exist", lifecycle.includes("onboarding.final_verification.attempted") && lifecycle.includes("onboarding.final_verification.completed") && lifecycle.includes("onboarding.final_verification.blocked") && lifecycle.includes("onboarding.final_verification.failed"));

check("frontend API exposes final verification endpoint", api.includes("finalVerifyOnboardingActivation") && api.includes("/final-verification"));
check("frontend activation action calls final verification before activate/submit", page.includes("runActivationAction") && page.includes("api.finalVerifyOnboardingActivation") && page.indexOf("api.finalVerifyOnboardingActivation") < page.indexOf("await runWorkspaceAction(action, success)"));
check("frontend can offer button from candidate readiness but not as final authority", page.includes("can_activate_candidate") && page.includes("activation_requires_final_verification") && page.includes("Run final server verification"));
check("frontend shows blocked final verification details", page.includes("Final verification blocked") && page.includes("finalVerificationBlockerMessage"));

check("missing setup remains blocked, not failed", evaluator.includes("return blocked(") && evaluator.includes("Required employee documents are missing."));
check("cash payment does not require payment institution", evaluator.includes('methodType === "CASH"') && evaluator.includes("payment_institution: \"not_required\""));
check("bank transfer validation remains strict", evaluator.includes('methodType === "BANK_TRANSFER"') && evaluator.includes("bank_account_name") && evaluator.includes("bank_account_number"));
check("pension disabled returns not_required", evaluator.includes("Pension is disabled or Payroll is disabled.") && evaluator.includes("return notRequired"));
check("attendance disabled does not block payroll", evaluator.includes("Attendance and Roster setup is disabled or not required.") && statusRegistry.includes("module_dependency: \"payroll\""));
check("local/foreign document behavior remains guarded", evaluator.includes("document_required_rules") && evaluator.includes("employee_type") && evaluator.includes("document_type_name"));
check("user access validation is not weakened", evaluator.includes("Linked user account must be active") && evaluator.includes("user_roles"));
check("approval tasks remain enforced", evaluator.includes("Required onboarding tasks or approvals are still pending.") && statusRegistry.includes("activation_approval"));
check("accepted Phase 3 aggregator still requires final verification", aggregator.includes("activation_requires_final_verification: true") && aggregator.includes("can_activate_candidate"));

check("diagnostic script registered", packageJson.scripts?.["diagnose:onboarding-final-activation-verifier"] === "node scripts/diagnose-onboarding-final-activation-verifier.mjs");
check("phase 4 verifier registered", packageJson.scripts?.["verify:onboarding-final-activation-verifier"] === "node scripts/verify-onboarding-final-activation-verifier.mjs");
check("diagnostic script exists", fs.existsSync(path.join(root, "scripts/diagnose-onboarding-final-activation-verifier.mjs")));

check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000"));
check("authenticated API no-store behavior present", lifecycle.includes('Cache-Control", "private, no-store"'));
check("no browser alert/confirm/prompt", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test([page, lifecycle, finalVerifier].join("\n")));
check("dark mode not introduced", !/dark:|prefers-color-scheme|useDarkMode/i.test([page, lifecycle, finalVerifier].join("\n")));

if (failures.length) {
  console.error("Onboarding final activation verifier verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding final activation verifier verification passed.");

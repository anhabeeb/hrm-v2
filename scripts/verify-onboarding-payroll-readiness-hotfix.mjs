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

function includes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(content) : content.includes(marker));
}

function excludes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(content) : !content.includes(marker));
}

const lifecycleRoute = "worker/src/routes/lifecycle.ts";
const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const packageJsonPath = "package.json";
const wrangler = "worker/wrangler.toml";
const password = "worker/src/auth/password.ts";

const route = read(lifecycleRoute);
const page = read(lifecyclePage);
const packageJson = JSON.parse(read(packageJsonPath));

includes(lifecycleRoute, "isOperationalModuleEnabled", "onboarding readiness must use operational module/submodule state");
includes(lifecycleRoute, "moduleStatuses.payment_methods === false", "Payment Methods disabled is treated as not required");
includes(lifecycleRoute, "moduleStatuses.pension === false", "Pension disabled is treated as not required");
includes(lifecycleRoute, "Pension setup is not required because Pension is disabled.", "Pension disabled has exact not-required reason");
includes(lifecycleRoute, "Payment method setup is not required because Payment Methods is disabled.", "Payment Methods disabled has exact not-required reason");
includes(lifecycleRoute, "Payment institution is not required for Cash payment.", "Cash does not require payment institution");
includes(lifecycleRoute, "methodType === \"CASH\"", "Cash readiness branch exists");
includes(lifecycleRoute, "methodType === \"BANK_TRANSFER\"", "Bank Transfer readiness branch exists");
includes(lifecycleRoute, "Bank is required for Bank Transfer.", "Bank Transfer requires active bank");
includes(lifecycleRoute, "Account name is required for Bank Transfer.", "Bank Transfer requires account name");
includes(lifecycleRoute, "Account number is required for Bank Transfer.", "Bank Transfer requires account number");
includes(lifecycleRoute, "PAYMENT_INSTITUTIONS_DISABLED_FOR_BANK_TRANSFER", "Bank Transfer is blocked when Payment Institutions are disabled");
includes(lifecycleRoute, "Bank Transfer requires Payment Institutions to be enabled.", "disabled Payment Institutions returns user-friendly save error");
includes(lifecycleRoute, "getOnboardingPayrollBlockers", "activation validator uses grouped payroll readiness blockers");
includes(lifecycleRoute, "...(await getOnboardingPayrollBlockers(c, caseId))", "onboarding blockers include payroll readiness blockers");
includes(lifecycleRoute, "children: {", "grouped readiness returns child states");
includes(lifecycleRoute, "payment_institution:", "payment institution child state exists");
includes(lifecycleRoute, "Optional setup: not required for onboarding activation.", "optional onboarding tasks are normalized as not required");
includes(lifecycleRoute, "Disabled module: not required for onboarding.", "disabled onboarding tasks are normalized as not required");
includes(lifecycleRoute, "task_status IN ('COMPLETED', 'WAIVED')", "completed optional tasks are preserved during refresh");

includes(lifecyclePage, "\"payroll\", \"payment-methods\", \"pension\", \"readiness\"", "payroll save invalidates targeted payment/pension/readiness slices");
includes(lifecyclePage, "\"payment-methods\", \"payroll\", \"pension\", \"readiness\"", "payment save invalidates grouped payroll readiness slices");
includes(lifecyclePage, "\"pension\", \"payroll\", \"payment-methods\", \"readiness\"", "pension save invalidates grouped payroll readiness slices");
includes(lifecyclePage, "payrollReadiness", "frontend reads grouped payroll readiness");
includes(lifecyclePage, "payrollChildren", "frontend reads grouped child readiness states");
includes(lifecyclePage, "paymentReasons", "frontend shows exact payroll/payment missing reason");
includes(lifecyclePage, "Payment institution is not required for Cash payment.", "Cash helper says payment institution is not required");
includes(lifecyclePage, "Cash payment does not require bank details.", "accepted Cash helper wording remains");
includes(lifecyclePage, "Payment Institutions module is disabled. Bank Transfer cannot be completed until it is enabled or payment method is changed to Cash.", "frontend shows disabled Payment Institutions reason");
includes(lifecyclePage, "Bank is required for Bank Transfer.", "frontend shows exact bank missing reason");
includes(lifecyclePage, "Account name is required for Bank Transfer.", "frontend shows exact account name missing reason");
includes(lifecyclePage, "Account number is required for Bank Transfer.", "frontend shows exact account number missing reason");
includes(lifecyclePage, "activeBankInstitutions", "active bank selector remains in use");
includes(lifecyclePage, "Select active bank", "active bank selector label remains");
includes(lifecyclePage, "payment_institution_id: normalized === \"BANK_TRANSFER\" ? payment.payment_institution_id : \"\"", "Cash clears stale bank institution payload");
includes(lifecyclePage, "bank_account_name: normalized === \"BANK_TRANSFER\" ? payment.bank_account_name : \"\"", "Cash clears stale account name payload");
includes(lifecyclePage, "bank_account_number: normalized === \"BANK_TRANSFER\" ? payment.bank_account_number : \"\"", "Cash clears stale account number payload");

check(`${packageJsonPath}: missing verify:onboarding-payroll-readiness-hotfix script`, Boolean(packageJson.scripts?.["verify:onboarding-payroll-readiness-hotfix"]));
for (const script of [
  "verify:onboarding-document-payroll-validation",
  "verify:onboarding-batch-document-upload",
  "verify:main-module-submodule-dependencies",
  "verify:disabled-module-global-sweep",
  "verify:global-workspace-page-load-reduction",
  "verify:production-hotfix-global-module-resilience",
  "verify:production-hotfix-onboarding-case-timeout"
]) {
  check(`${packageJsonPath}: missing regression script ${script}`, Boolean(packageJson.scripts?.[script]));
}

for (const file of [lifecycleRoute, lifecyclePage]) {
  excludes(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be introduced");
  excludes(file, /dark:/, "dark mode classes must not be introduced");
  excludes(file, /Payroll incomplete|Setup missing/, "vague payroll/setup missing copy must not be introduced");
}

includes(password, "ITERATIONS = 100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");

if (failures.length) {
  console.error("Onboarding payroll readiness hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding payroll readiness hotfix verification passed.");

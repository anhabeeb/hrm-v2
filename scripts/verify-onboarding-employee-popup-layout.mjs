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
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function excludes(file, marker, message) {
  const content = read(file);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function blockAfter(file, marker, length = 6000) {
  const content = read(file);
  const start = content.indexOf(marker);
  if (start < 0) {
    failures.push(`${file}: missing block marker ${marker}`);
    return "";
  }
  return content.slice(start, start + length);
}

const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const password = "worker/src/auth/password.ts";
const wrangler = "worker/wrangler.toml";
const seed = "database/seed.sql";
const packageJson = JSON.parse(read("package.json"));

const lifecycleText = read(lifecyclePage);
const modalBlock = blockAfter(lifecyclePage, "function Modal", 2200);
const workspaceBlock = blockAfter(lifecyclePage, "function OnboardingWorkspace", 26000);
const documentFormBlock = blockAfter(lifecyclePage, "function DocumentsWorkspaceForm", 17000);
const paymentPensionBlock = blockAfter(lifecyclePage, "function PaymentPensionWorkspaceForm", 12000);

includes(lifecyclePage, "wide={kind === \"onboarding\"}", "onboarding case modal must request the large workspace shell");
includes(lifecyclePage, "hideHeader={kind === \"onboarding\"}", "onboarding workspace must own its own header");
includes(lifecyclePage, "bodyClassName={kind === \"onboarding\" ? \"min-h-0 flex-1 overflow-hidden p-0\" : undefined}", "onboarding modal body must fill the fixed-height modal without padding overflow");
check(`${lifecyclePage}: Modal must use 94vw desktop width`, modalBlock.includes("w-[94vw]"));
check(`${lifecyclePage}: Modal must cap desktop width at 1440px`, modalBlock.includes("max-w-[1440px]"));
check(`${lifecyclePage}: Modal must use 90vh height`, modalBlock.includes("h-[90vh]"));
check(`${lifecyclePage}: Modal must cap height at 92vh`, modalBlock.includes("max-h-[92vh]"));
check(`${lifecyclePage}: Modal must prevent viewport overflow`, modalBlock.includes("overflow-hidden"));
check(`${lifecyclePage}: Modal body must preserve internal scrolling for wide dialogs`, modalBlock.includes("min-h-0 flex-1 overflow-y-auto p-4"));

for (const marker of [
  "OnboardingEmployeePopupLayout",
  "data-onboarding-employee-popup-layout",
  "onboarding-popup-header",
  "onboarding-employee-summary-panel",
  "onboarding-main-workspace",
  "onboarding-readiness-blockers-panel",
  "onboarding-popup-footer"
]) {
  check(`${lifecyclePage}: missing popup region ${marker}`, workspaceBlock.includes(marker));
}

check(`${lifecyclePage}: popup must use requested desktop three-column grid`, workspaceBlock.includes("lg:grid-cols-[300px_minmax(0,1fr)_340px]"));
check(`${lifecyclePage}: popup must preserve larger desktop panel sizing`, workspaceBlock.includes("xl:grid-cols-[320px_minmax(0,1fr)_360px]"));
check(`${lifecyclePage}: modal content must scroll internally`, workspaceBlock.includes("min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"));
check(`${lifecyclePage}: left summary panel must be sticky on desktop`, /onboarding-employee-summary-panel[\s\S]+lg:sticky/.test(workspaceBlock));
check(`${lifecyclePage}: right readiness panel must be sticky on desktop`, /onboarding-readiness-blockers-panel[\s\S]+lg:sticky/.test(workspaceBlock));
check(`${lifecyclePage}: section sidebar must remain ticked/completed by validator state`, workspaceBlock.includes("data-onboarding-section-sidebar") && workspaceBlock.includes("sectionStatus(tab)") && workspaceBlock.includes("<CheckCircle2"));

for (const marker of [
  "employeeDisplayName(employee)",
  "employeeCode",
  "employeeTypeLabel(employee.employee_type)",
  "StatusBadge value={rowCase.onboarding_status}",
  "displayText(employee.joining_date",
  "Button variant=\"ghost\" size=\"sm\" onClick={onClose}>Close"
]) {
  check(`${lifecyclePage}: header identity marker missing: ${marker}`, workspaceBlock.includes(marker));
}
check(`${lifecyclePage}: header must not render undefined/null employee identity text`, workspaceBlock.includes("displayText(") && workspaceBlock.includes("employeeDisplayName"));

for (const marker of [
  "employeeProfilePhoto(employee)",
  "employeeInitials(employee)",
  "OnboardingEmployeeSummaryRow label=\"Code\"",
  "OnboardingEmployeeSummaryRow label=\"Department\"",
  "OnboardingEmployeeSummaryRow label=\"Position\"",
  "OnboardingEmployeeSummaryRow label=\"Employment\"",
  "OnboardingEmployeeSummaryRow label=\"Phone\"",
  "OnboardingEmployeeSummaryRow label=\"Email\"",
  "OnboardingEmployeeSummaryRow label=\"Location\""
]) {
  check(`${lifecyclePage}: left summary marker missing: ${marker}`, lifecycleText.includes(marker));
}

for (const marker of [
  "DocumentsWorkspaceForm workspace={workspace} onSave={saveDocumentBatch}",
  "PaymentPensionWorkspaceForm",
  "PayrollWorkspaceForm",
  "JobAssignmentWorkspaceForm",
  "AssetsWorkspaceForm",
  "ChecklistWorkspaceTable",
  "Timeline items={asRows(workspace.events)"
]) {
  check(`${lifecyclePage}: main workspace must preserve ${marker}`, workspaceBlock.includes(marker));
}

for (const marker of [
  "visibleOnboardingBlockers(blockers)",
  "onboardingReadinessRows(workspace, readiness, tasks)",
  "onboardingBlockerTarget(blocker)",
  "setActiveTab(target)",
  "Not Required",
  "No required blockers are open."
]) {
  check(`${lifecyclePage}: right readiness/blocker behavior missing ${marker}`, lifecycleText.includes(marker));
}
check(`${lifecyclePage}: disabled modules must be filtered from blockers`, /visibleOnboardingBlockers[\s\S]+NOT_REQUIRED[\s\S]+disabled\|not required/.test(lifecycleText));
check(`${lifecyclePage}: disabled modules must show Not Required instead of blocking`, /modules\.assets_uniforms === false[\s\S]+Not Required/.test(lifecycleText));

for (const marker of [
  "Refresh readiness",
  "Activate Employee",
  "disabled={!canActivate}",
  "border-emerald-600 bg-emerald-600",
  "Section forms save changes inside the workspace"
]) {
  check(`${lifecyclePage}: footer action marker missing: ${marker}`, workspaceBlock.includes(marker));
}

for (const marker of [
  "uploadOnboardingWorkspaceDocumentBatch",
  "Add multiple document rows and upload the batch in one action.",
  "createDocumentBatchRow",
  "form.set(\"metadata\"",
  "form.set(`file_${index}`",
  "matched_employee_type_label",
  "typeSpecificRows"
]) {
  check(`${lifecyclePage}: document batch/local-foreign behavior marker missing: ${marker}`, lifecycleText.includes(marker));
}
check(`${lifecyclePage}: document upload input must remain one file per row`, !/<Input[^>]+type="file"[^>]+multiple/.test(documentFormBlock));

for (const marker of [
  "Cash payment does not require bank details.",
  "Bank transfer requires bank, account name, and account number.",
  "activeBankInstitutions",
  "paymentErrors",
  "payment_institution_id: normalized === \"BANK_TRANSFER\" ? payment.payment_institution_id : \"\""
]) {
  check(`${lifecyclePage}: payroll/payment validation marker missing: ${marker}`, paymentPensionBlock.includes(marker) || lifecycleText.includes(marker));
}

const seedText = read(seed);
check(`${seed}: Visa default rule must remain FOREIGN only`, /doc_required_rule_foreign_visa'[^;]+doc_type_visa'[^;]+'FOREIGN'/.test(seedText));
check(`${seed}: Work Permit default rule must remain FOREIGN only`, /doc_required_rule_foreign_work_permit'[^;]+doc_type_work_permit'[^;]+'FOREIGN'/.test(seedText));

for (const script of [
  "verify:onboarding-batch-document-upload",
  "verify:onboarding-document-payroll-validation",
  "verify:sidebar-command-center-welcome",
  "verify:header-search-layout",
  "verify:global-popup-alerts",
  "verify:disabled-module-global-sweep"
]) {
  check(`package.json: missing ${script} script`, Boolean(packageJson.scripts?.[script]));
}

for (const file of [lifecyclePage]) {
  excludes(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be introduced");
  excludes(file, /dark:/, "dark mode classes must not be introduced");
}

includes(password, "ITERATIONS = 100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");

if (failures.length) {
  console.error("Onboarding employee popup layout verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding employee popup layout verification passed.");

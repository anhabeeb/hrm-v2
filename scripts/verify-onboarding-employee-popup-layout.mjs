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

function blockBetween(content, startMarker, endMarker, label) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    failures.push(`${label}: missing block boundary ${startMarker} -> ${endMarker}`);
    return "";
  }
  return content.slice(start, end);
}

const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const password = "worker/src/auth/password.ts";
const wrangler = "worker/wrangler.toml";
const seed = "database/seed.sql";
const packageJson = JSON.parse(read("package.json"));

const lifecycleText = read(lifecyclePage);
const modalBlock = blockAfter(lifecyclePage, "function Modal", 2200);
const tabDefinitionBlock = blockAfter(lifecyclePage, "const onboardingWorkspaceTabs =", 700);
const workspaceBlock = blockAfter(lifecyclePage, "function OnboardingWorkspace", 56000);
const headerBlock = blockAfter(lifecyclePage, "<header className=\"onboarding-popup-header", 2200);
const overviewBlock = blockAfter(lifecyclePage, "function OnboardingWorkspaceOverview", 9000);
const setupNavBlock = blockBetween(workspaceBlock, "onboarding-setup-navigation-panel", "onboarding-main-workspace", `${lifecyclePage}: setup navigation block`);
const mainWorkspaceBlock = blockBetween(workspaceBlock, "onboarding-main-workspace", "onboarding-employee-info-panel", `${lifecyclePage}: main workspace block`);
const employeeInfoBlock = blockBetween(workspaceBlock, "onboarding-employee-info-panel", "<footer className=\"onboarding-popup-footer", `${lifecyclePage}: employee info block`);
const footerBlock = blockAfter(lifecyclePage, "<footer className=\"onboarding-popup-footer", 5000);
const footerVisibleStart = lifecycleText.indexOf("data-onboarding-footer-visible-actions");
const footerVisibleEnd = footerVisibleStart >= 0 ? lifecycleText.indexOf("{moreActionsOpen ?", footerVisibleStart) : -1;
const footerVisibleActionsBlock = footerVisibleStart >= 0 && footerVisibleEnd > footerVisibleStart ? lifecycleText.slice(footerVisibleStart, footerVisibleEnd) : "";
const documentFormBlock = blockAfter(lifecyclePage, "function DocumentsWorkspaceForm", 26000);
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
  "onboarding-setup-navigation-panel",
  "onboarding-main-workspace",
  "onboarding-employee-info-panel",
  "onboarding-popup-footer"
]) {
  check(`${lifecyclePage}: missing popup region ${marker}`, workspaceBlock.includes(marker));
}

check(`${lifecyclePage}: popup must use simplified desktop three-column grid`, workspaceBlock.includes("lg:grid-cols-[240px_minmax(0,1fr)_340px]"));
check(`${lifecyclePage}: popup must preserve right employee panel sizing without crowding`, workspaceBlock.includes("xl:grid-cols-[260px_minmax(0,1fr)_360px]"));
check(`${lifecyclePage}: modal content must scroll internally without horizontal overflow`, workspaceBlock.includes("overflow-x-hidden overflow-y-auto"));
check(`${lifecyclePage}: popup shell must guard against horizontal overflow`, workspaceBlock.includes("max-w-full") && workspaceBlock.includes("overflow-hidden"));
check(`${lifecyclePage}: setup navigation panel must be sticky on desktop`, /onboarding-setup-navigation-panel[\s\S]+lg:sticky/.test(workspaceBlock));
check(`${lifecyclePage}: employee info panel must be sticky on desktop`, /onboarding-employee-info-panel[\s\S]+lg:sticky/.test(workspaceBlock));
check(`${lifecyclePage}: desktop layout order must be setup nav, main workspace, employee info`, workspaceBlock.indexOf("onboarding-setup-navigation-panel") < workspaceBlock.indexOf("onboarding-main-workspace") && workspaceBlock.indexOf("onboarding-main-workspace") < workspaceBlock.indexOf("onboarding-employee-info-panel"));
check(`${lifecyclePage}: mobile order must place employee info before nav and main workspace`, employeeInfoBlock.includes("order-1") && setupNavBlock.includes("order-2") && mainWorkspaceBlock.includes("order-3"));
check(`${lifecyclePage}: section sidebar must remain ticked/completed by validator state`, workspaceBlock.includes("data-onboarding-section-sidebar") && workspaceBlock.includes("sectionStatus(tab)") && workspaceBlock.includes("<CheckCircle2"));
check(`${lifecyclePage}: setup tabs must remove Checklist and Approval Timeline`, !tabDefinitionBlock.includes("\"Checklist\"") && !tabDefinitionBlock.includes("\"Approval Timeline\""));
check(`${lifecyclePage}: popup must not render removed Checklist or Approval Timeline branches`, !workspaceBlock.includes("activeTab === \"Checklist\"") && !workspaceBlock.includes("activeTab === \"Approval Timeline\""));
check(`${lifecyclePage}: popup must not render checklist table or approval timeline as setup sections`, !workspaceBlock.includes("ChecklistWorkspaceTable") && !workspaceBlock.includes("Timeline items={asRows(workspace.events)"));
check(`${lifecyclePage}: text-heavy popup containers must use min-w-0 safeguards`, (workspaceBlock.match(/min-w-0/g) ?? []).length >= 25);
check(`${lifecyclePage}: long popup text must use truncate/line-clamp/break-words protections`, workspaceBlock.includes("truncate") && workspaceBlock.includes("line-clamp-2") && workspaceBlock.includes("break-words"));

for (const marker of [
  "employeeDisplayName(employee)",
  "employeeCode",
  "employeeTypeLabel(employee.employee_type)",
  "StatusBadge value={rowCase.onboarding_status}",
  "activationBadgeLabel",
  "displayText(employee.joining_date",
  "Button variant=\"ghost\" size=\"sm\" className=\"shrink-0\" onClick={onClose}>Close"
]) {
  check(`${lifecyclePage}: header identity marker missing: ${marker}`, workspaceBlock.includes(marker));
}
check(`${lifecyclePage}: header must not render undefined/null employee identity text`, workspaceBlock.includes("displayText(") && workspaceBlock.includes("employeeDisplayName"));
check(`${lifecyclePage}: header must show no more than three high-signal badges`, (headerBlock.match(/<Badge|<StatusBadge/g) ?? []).length <= 3);
check(`${lifecyclePage}: header must not show duplicate readiness status badge`, !headerBlock.includes("readinessState") && !headerBlock.includes("Ready for Activation"));
check(`${lifecyclePage}: header metadata row must protect long values`, headerBlock.includes("grid min-w-0 max-w-full") && (headerBlock.match(/truncate/g) ?? []).length >= 4);
check(`${lifecyclePage}: old left employee summary panel must be removed`, !workspaceBlock.includes("onboarding-employee-summary-panel"));

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
  check(`${lifecyclePage}: right employee info marker missing: ${marker}`, employeeInfoBlock.includes(marker) || lifecycleText.includes(marker));
}
check(`${lifecyclePage}: left setup navigation must not contain employee summary content`, !setupNavBlock.includes("OnboardingEmployeeSummaryRow") && !setupNavBlock.includes("employeeProfilePhoto") && !setupNavBlock.includes("<Badge"));
check(`${lifecyclePage}: right employee info must not contain old missing/module state clutter`, (!employeeInfoBlock.includes("Readiness") || employeeInfoBlock.includes("data-setup-readiness-display") || employeeInfoBlock.includes("OnboardingSectionReadinessPreview")) && !employeeInfoBlock.includes("Missing items") && !employeeInfoBlock.includes("Module states") && !employeeInfoBlock.includes("moduleStateRows") && !employeeInfoBlock.includes("visibleBlockers"));
check(`${lifecyclePage}: right employee info value rows must truncate long fields`, employeeInfoBlock.includes("OnboardingEmployeeSummaryRow") && lifecycleText.includes("title={display}") && lifecycleText.includes("grid min-w-0"));

for (const marker of [
  "PaymentPensionWorkspaceForm",
  "PayrollWorkspaceForm",
  "JobAssignmentWorkspaceForm",
  "AssetsWorkspaceForm",
  "UserAccessWorkspaceForm"
]) {
  check(`${lifecyclePage}: main workspace must preserve ${marker}`, workspaceBlock.includes(marker));
}
check(`${lifecyclePage}: main workspace must preserve DocumentsWorkspaceForm save path`, workspaceBlock.includes("DocumentsWorkspaceForm workspace={workspace}") && workspaceBlock.includes("onSave={saveDocumentBatch}"));

for (const marker of [
  "onboardingReadinessRows(workspace, readiness, tasks)",
  "Not Required",
  "readiness.can_activate === true"
]) {
  check(`${lifecyclePage}: internal activation/readiness logic marker missing ${marker}`, lifecycleText.includes(marker));
}
check(`${lifecyclePage}: disabled modules must be filtered from blockers`, /visibleOnboardingBlockers[\s\S]+NOT_REQUIRED[\s\S]+disabled\|not required/.test(lifecycleText));
check(`${lifecyclePage}: disabled modules must show Not Required instead of blocking`, /modules\.assets_uniforms === false[\s\S]+Not Required/.test(lifecycleText));
check(`${lifecyclePage}: old overview/readiness chip wall must be removed`, !lifecycleText.includes("data-onboarding-readiness-pills") && !workspaceBlock.includes("<OnboardingReadinessPills"));
check(`${lifecyclePage}: overview must use compact summary counters without a visible missing panel`, overviewBlock.includes("Workspace overview") && overviewBlock.includes("Completed") && overviewBlock.includes("To review") && overviewBlock.includes("Not required") && overviewBlock.includes("Disabled"));
check(`${lifecyclePage}: overview must not render blocker/warning/readiness lists`, !overviewBlock.includes("Needs attention") && !overviewBlock.includes("Warnings") && !overviewBlock.includes("attentionRows.map") && !overviewBlock.includes("blockers.map") && !overviewBlock.includes("Key setup"));
check(`${lifecyclePage}: overview must avoid raw snake_case module labels`, !overviewBlock.includes("title(key)") && !overviewBlock.includes("Assets / Uniforms"));

for (const marker of [
  "formatOnboardingModuleLabel",
  "Document compliance",
  "Payment methods",
  "Payment institutions",
  "Bank loans",
  "Custom deductions",
  "ZKTeco attendance",
  "Assets & Uniforms",
  "Final settlement",
  "Self-service"
]) {
  check(`${lifecyclePage}: professional module label marker missing ${marker}`, lifecycleText.includes(marker));
}
check(`${lifecyclePage}: visible readiness panel must be removed from popup body`, !workspaceBlock.includes("onboarding-readiness-blockers-panel") && !workspaceBlock.includes("data-onboarding-metric-grid") && !workspaceBlock.includes("data-onboarding-metric-card"));
check(`${lifecyclePage}: visible missing items panel must be removed from popup body`, !workspaceBlock.includes("Missing items") && !workspaceBlock.includes("No required blockers are open.") && !workspaceBlock.includes("visibleBlockers.map"));
check(`${lifecyclePage}: visible module readiness/states panel must be removed from popup body`, !workspaceBlock.includes("Module states") && !workspaceBlock.includes("moduleStatesOpen") && !workspaceBlock.includes("moduleStateRows.map") && !workspaceBlock.includes("Enabled: {moduleSummary.enabled}"));

for (const marker of [
  "Refresh readiness",
  "Activate Employee",
  "primaryAction",
  "disabled={primaryAction.disabled}",
  "intent={primaryAction.intent}",
  "Section forms save changes inside the workspace",
  "More actions"
]) {
  check(`${lifecyclePage}: footer action marker missing: ${marker}`, workspaceBlock.includes(marker));
}
check(`${lifecyclePage}: footer must expose no more than three visible controls`, (footerVisibleActionsBlock.match(/<Button|<ActionTextButton/g) ?? []).length === 3 && footerVisibleActionsBlock.includes("Close") && footerVisibleActionsBlock.includes("primaryAction.label") && footerVisibleActionsBlock.includes("More actions"));
check(`${lifecyclePage}: refresh readiness must live inside the More actions menu`, !footerVisibleActionsBlock.includes("Refresh readiness") && footerBlock.indexOf("More actions") < footerBlock.indexOf("Refresh readiness"));
check(`${lifecyclePage}: footer must avoid a crowded always-visible action row`, footerBlock.includes("data-onboarding-footer-visible-actions") && footerBlock.includes("More actions") && footerBlock.includes("bottom-full"));
check(`${lifecyclePage}: secondary activation actions must live inside the More actions menu`, footerBlock.indexOf("More actions") < footerBlock.indexOf("Submit activation") && footerBlock.indexOf("More actions") < footerBlock.indexOf("Approve activation") && footerBlock.indexOf("More actions") < footerBlock.indexOf("Override activation"));
check(`${lifecyclePage}: destructive override action must be in dropdown, not the visible footer row`, /More actions[\s\S]+Override activation/.test(footerBlock) && !/flex-nowrap[\s\S]+Override activation[\s\S]+More actions/.test(footerBlock));

for (const marker of [
  "uploadOnboardingWorkspaceDocumentBatch",
  "Add multiple document rows and upload them together. Each row accepts one file.",
  "createDocumentBatchRow",
  "form.set(\"metadata\"",
  "form.set(`file_${index}`",
  "matched_employee_type_label",
  "typeSpecificRows"
]) {
  check(`${lifecyclePage}: document batch/local-foreign behavior marker missing: ${marker}`, lifecycleText.includes(marker));
}
check(`${lifecyclePage}: document upload input must remain one file per row`, !/<Input[^>]+type="file"[^>]+multiple/.test(documentFormBlock));
check(`${lifecyclePage}: documents workspace must use a single-column popup flow`, documentFormBlock.includes("grid min-w-0 max-w-full gap-4") && !documentFormBlock.includes("lg:grid-cols-[1fr_1.2fr]"));
check(`${lifecyclePage}: document row fields must not use cramped six-column layout`, !documentFormBlock.includes("md:grid-cols-6") && documentFormBlock.includes("xl:grid-cols-2") && documentFormBlock.includes("xl:grid-cols-3"));
check(`${lifecyclePage}: document type and file fields must have roomy guarded columns`, documentFormBlock.includes("Document type") && documentFormBlock.includes("File *") && (documentFormBlock.match(/className=\"min-w-0\"/g) ?? []).length >= 8);
check(`${lifecyclePage}: file input and selected filename must not overflow`, documentFormBlock.includes("className=\"max-w-full file:max-w-full\"") && documentFormBlock.includes("title={row.file.name}") && documentFormBlock.includes("truncate text-xs text-muted-foreground"));
check(`${lifecyclePage}: document number/date/notes fields must not be squeezed into tiny columns`, documentFormBlock.includes("Document number/reference") && documentFormBlock.includes("Issue date") && documentFormBlock.includes("Expiry date") && documentFormBlock.includes("<Field label=\"Notes\"") && documentFormBlock.includes("mt-3 min-w-0"));
check(`${lifecyclePage}: document helper text must span safely`, documentFormBlock.includes("documentTypeFileRuleText(type)") && documentFormBlock.includes("break-words"));
check(`${lifecyclePage}: document checklist employee type badge must use user-friendly labels`, documentFormBlock.includes("Employee type: {employeeTypeLabel(employee.employee_type)}") && !documentFormBlock.includes("Employee type: {employee.employee_type}") && !documentFormBlock.includes("Employee type: {text(employee.employee_type)"));
check(`${lifecyclePage}: empty document checklist must use compact empty state instead of an empty table`, documentFormBlock.includes("No required document rules are configured for this employee.") && documentFormBlock.includes("min-h-24") && !documentFormBlock.includes("DataTableFrame empty={checklistRows.length === 0}"));
check(`${lifecyclePage}: populated document checklist must scroll/wrap safely`, documentFormBlock.includes("<DataTableFrame className=\"mt-3\"") && documentFormBlock.includes("whitespace-normal break-words text-xs text-muted-foreground"));

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

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function ok(condition, message) {
  if (!condition) {
    console.error(`Prompt 14 verification failed: ${message}`);
    process.exit(1);
  }
}

function hasAll(file, markers) {
  const text = read(file);
  for (const marker of markers) ok(text.includes(marker), `${file} missing ${marker}`);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
[
  "verify:baseline-prompts1-5",
  "verify:prompt8",
  "verify:prompt9",
  "verify:recovery-prompts6-9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final",
  "verify:prompt13",
  "verify:prompt14"
].forEach((script) => ok(Boolean(scripts[script]), `package.json missing ${script}`));

hasAll("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS contract_settings",
  "CREATE TABLE IF NOT EXISTS contract_types",
  "CREATE TABLE IF NOT EXISTS employee_contracts",
  "CREATE TABLE IF NOT EXISTS employee_contract_events",
  "CREATE TABLE IF NOT EXISTS employee_probation_events",
  "CREATE TABLE IF NOT EXISTS employee_contract_renewals",
  "CREATE TABLE IF NOT EXISTS contract_alerts",
  "idx_employee_contracts_one_active",
  "probation_status",
  "renewal_status",
  "approval_status",
  "salary_terms_json",
  "document_id"
]);

hasAll("database/seed.sql", [
  "contracts.view",
  "contracts.create",
  "contracts.update",
  "contracts.cancel",
  "contracts.archive",
  "contracts.manage",
  "contracts.approve",
  "contracts.reject",
  "contracts.renew",
  "contracts.salary_terms.view",
  "contracts.salary_terms.manage",
  "contracts.settings.view",
  "contracts.settings.update",
  "contracts.types.view",
  "contracts.probation.confirm",
  "contracts.renewals.activate",
  "contracts.alerts.acknowledge",
  "employees.contracts.view",
  "employees.contracts.manage",
  "reports.contracts.view",
  "self_service.contracts.view",
  "contract_settings_default",
  "PERMANENT",
  "FIXED_TERM",
  "PROBATION",
  "PART_TIME_PLACEHOLDER"
]);

hasAll("worker/src/db/permissions.ts", [
  "contracts.view",
  "contracts.settings.manage",
  "contracts.types.manage",
  "contracts.probation.manage",
  "contracts.renewals.manage",
  "contracts.alerts.manage",
  "employees.contracts.view",
  "self_service.contracts.view"
]);

hasAll("worker/src/routes/contracts.ts", [
  "const contractRoutes",
  "const employeeContractRoutes",
  "const selfServiceContractRoutes",
  "export { contractRoutes, employeeContractRoutes, selfServiceContractRoutes }",
  "requireActiveContractTypeForNewContract",
  "requireExistingContractTypeForAction",
  "validateContractTypeDrivenFields",
  "CONTRACT_TYPE_REQUIRED",
  "Please select a contract type.",
  "CONTRACT_TYPE_NOT_FOUND",
  "Selected contract type was not found.",
  "CONTRACT_TYPE_INACTIVE",
  "Selected contract type is inactive or archived and cannot be used for a new contract.",
  "CONTRACT_END_DATE_REQUIRED",
  "Contract end date is required for this contract type.",
  "CONTRACT_PROBATION_DATES_REQUIRED",
  "Probation dates are required for this contract type.",
  "CONTRACT_START_DATE_REQUIRED",
  "Contract start date is required.",
  "CONTRACT_RENEWAL_REFERENCE_REQUIRED",
  "Renewal contract must be linked to a previous contract.",
  "contract_type_display_name",
  "getEmployeeActiveContract",
  "getEmployeeContractRequirementStatus",
  "syncEmployeeContractStatusSnapshot",
  "maybeCreateContractTaskForOnboarding",
  "getContractPayrollImpact",
  "getContractSalaryTermsForPayroll",
  "getContractFinalSettlementImpact",
  "getEndOfContractSettlementContext",
  "linkContractToEmployeeDocument",
  "getContractDocumentStatus",
  "refreshContractAlerts",
  "getExpiringContracts",
  "getExpiredContracts",
  "getProbationDueEmployees",
  "createContractAlertIfMissing",
  "/probation/due",
  "/renewals",
  "/alerts",
  "/:contractId/probation/confirm",
  "/:contractId/renew",
  "/:employeeId/contracts/summary",
  "selfServiceContractRoutes.get(\"/contracts\"",
  "canAccessEmployee"
]);

const contractsRoute = read("worker/src/routes/contracts.ts");
ok(/type\.requires_end_date === 1 && !input\.contract_end_date/.test(contractsRoute), "contract end date must be required by contract type");
ok(/type\.requires_probation === 1 && \(!input\.probation_start_date \|\| !input\.probation_end_date\)/.test(contractsRoute), "probation dates must be required by contract type");
ok(/type\.is_active !== 1 \|\| type\.status !== "ACTIVE" \|\| type\.archived_at/.test(contractsRoute), "inactive or archived contract types must be blocked for new contracts");
ok(!/employment_type\s*={2,3}\s*["']FULL_TIME["'][\s\S]{0,160}contract_end_date/.test(contractsRoute), "contracts route must not infer end-date requirement from FULL_TIME employment type");

hasAll("worker/src/index.ts", [
  "contractRoutes",
  "employeeContractRoutes",
  "selfServiceContractRoutes",
  "/api/v1/contracts",
  "/api/v1/employees",
  "/api/v1/self-service"
]);

hasAll("worker/src/routes/reports.ts", [
  "contracts/active",
  "contracts/expiring",
  "contracts/expired",
  "contracts/missing",
  "contracts/probation-due",
  "contracts/renewals-due",
  "contracts/salary-differences",
  "contracts/foreign-alignment-placeholder",
  "getContractReport"
]);

hasAll("frontend/src/lib/api.ts", [
  "getContractSettings",
  "listContractTypes",
  "listContracts",
  "createEmployeeContract",
  "getEmployeeContractSummary",
  "listProbationDue",
  "listContractRenewals",
  "listContractAlerts",
  "getSelfServiceContracts"
]);

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "import(\"../pages/ContractsPage\")",
  "path=\"contracts\"",
  "path=\"contracts/probation\"",
  "path=\"settings/contracts\"",
  "path=\"self-service/contracts\""
]);

hasAll("frontend/src/layouts/AppShell.tsx", [
  "FileSignature",
  "Contracts",
  "contracts.view",
  "employees.contracts.view"
]);

hasAll("frontend/src/pages/ContractsPage.tsx", [
  "Employee Contracts",
  "Contract Settings",
  "Probation due",
  "Renewals",
  "Alerts",
  "ReasonDialog",
  "Refresh alerts",
  "requiresEndDate",
  "requiresProbation",
  "allowsSalaryTerms",
  "End date is optional for this contract type.",
  "Probation is optional or not applicable for this contract type.",
  "Salary terms are disabled for this contract type.",
  "status !== \"ARCHIVED\" && !type.archived_at"
]);

hasAll("frontend/src/components/employee/EmployeeContractsPanel.tsx", [
  "EmployeeContractsPanel",
  "getEmployeeContractSummary",
  "createEmployeeContract",
  "contractAction",
  "Contract history",
  "Active contract",
  "Settlement flag",
  "requiresEndDate",
  "requiresProbation",
  "allowsSalaryTerms",
  "End date is optional for this contract type.",
  "Probation is optional or not applicable for this contract type.",
  "Salary terms are disabled for this contract type.",
  "status !== \"ARCHIVED\" && !type.archived_at",
  "contract_type_display_name"
]);

hasAll("frontend/src/pages/EmployeeProfilePage.tsx", [
  "EmployeeContractsPanel",
  "\"Contracts\"",
  "employees.contracts.view"
]);

hasAll("frontend/src/pages/SelfServicePage.tsx", [
  "contracts",
  "My Contracts",
  "getSelfServiceContracts",
  "ContractsSelfServiceSection",
  "contract_type_display_name",
  "Not selected"
]);

ok(!/e-signature|esignature|generate legal|legal formula/i.test(contractsRoute), "Prompt 14 must not implement legal/e-signature automation");

for (const file of [
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/components/employee/EmployeeContractsPanel.tsx",
  "frontend/src/pages/SelfServicePage.tsx"
]) {
  const text = read(file);
  ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} must not use browser alert/confirm/prompt`);
}

const wranglerToml = read("worker/wrangler.toml");
ok(wranglerToml.includes('binding = "DB"'), "D1 DB binding missing");
ok(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database name changed");
ok(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database id changed");
ok(wranglerToml.includes('binding = "DOCUMENTS_BUCKET"'), "R2 binding missing");
ok(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

const auth = read("worker/src/auth/password.ts");
ok(auth.includes("100000"), "PBKDF2 maximum must remain 100000");
ok(!auth.includes("210000"), "PBKDF2 must not be reverted to 210000");

console.log("Prompt 14 verifier passed.");

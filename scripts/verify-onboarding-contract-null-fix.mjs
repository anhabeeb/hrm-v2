import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function must(condition, message) {
  if (!condition) failures.push(message);
}

function includes(file, marker) {
  must(read(file).includes(marker), `${file} missing ${marker}`);
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const contracts = read("worker/src/routes/contracts.ts");
const employees = read("worker/src/routes/employees.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const contractsPage = read("frontend/src/pages/ContractsPage.tsx");
const employeeContractsPanel = read("frontend/src/components/employee/EmployeeContractsPanel.tsx");
const selfServicePage = read("frontend/src/pages/SelfServicePage.tsx");
const wrangler = read("worker/wrangler.toml");
const auth = read("worker/src/auth/password.ts");

[
  "auto_create_onboarding_case_on_employee_create",
  "employee_onboarding_cases",
  "contract_types",
  "requires_end_date"
].forEach((marker) => must(schema.includes(marker), `schema missing ${marker}`));

must(seed.includes("'contract_type_permanent', 'PERMANENT'") && seed.includes("'PERMANENT', 'Permanent'"), "seed missing permanent contract type");
must(/'contract_type_permanent'[\s\S]*?0,\s*1,\s*1,\s*1/.test(seed), "permanent contract type should not require contract end date");

[
  "auto_create_onboarding_case_on_employee_create",
  "autoCreateOnboardingCaseAfterEmployeeCreate",
  "insertOnboardingCaseForEmployee",
  "seedOnboardingChecklistForEmployee",
  "getOnboardingContractStatus",
  "Contract missing",
  "Not required",
  "Not set",
  "Not applicable",
  "blocking_items",
  "Required employment contract is missing",
  "This contract type requires a contract end date",
  "employee_onboarding_cases WHERE employee_id = ? AND onboarding_status != 'CANCELLED' AND activation_status != 'ACTIVATED'",
  "employees.lifecycle.view",
  "ONBOARDING_CASE_NOT_FOUND"
].forEach((marker) => must(lifecycle.includes(marker), `lifecycle route missing ${marker}`));

must(!/employment_type\s*={2,3}\s*["']FULL_TIME["'][\s\S]{0,120}contract_end_date/.test(lifecycle), "lifecycle should not require contract end date only because employment_type is FULL_TIME");
must(!/FULL_TIME[\s\S]{0,120}contract_end_date[\s\S]{0,120}required/i.test(lifecycle), "lifecycle has a full-time contract-end-date requirement marker");
must(lifecycle.includes("current_contract_type_requires_end_date") && lifecycle.includes("current_contract_type_requires_probation"), "onboarding readiness must use contract type validation flags");
must(lifecycle.includes("contract_type_id") && lifecycle.includes("Please select a contract type."), "onboarding readiness missing clean contract type blocker");

[
  "requireActiveContractTypeForNewContract",
  "requireExistingContractTypeForAction",
  "validateContractTypeDrivenFields",
  "CONTRACT_TYPE_REQUIRED",
  "CONTRACT_TYPE_NOT_FOUND",
  "CONTRACT_TYPE_INACTIVE",
  "CONTRACT_END_DATE_REQUIRED",
  "CONTRACT_PROBATION_DATES_REQUIRED",
  "CONTRACT_START_DATE_REQUIRED",
  "CONTRACT_RENEWAL_REFERENCE_REQUIRED",
  "contract_type_display_name"
].forEach((marker) => must(contracts.includes(marker), `contracts route missing ${marker}`));
must(/type\.requires_end_date === 1 && !input\.contract_end_date/.test(contracts), "contract end-date validation must be driven by contract type");
must(/type\.requires_probation === 1 && \(!input\.probation_start_date \|\| !input\.probation_end_date\)/.test(contracts), "probation validation must be driven by contract type");
must(/type\.is_active !== 1 \|\| type\.status !== "ACTIVE" \|\| type\.archived_at/.test(contracts), "inactive/archived contract types must be blocked for new contracts");
must(!/employment_type\s*={2,3}\s*["']FULL_TIME["'][\s\S]{0,160}contract_end_date/.test(contracts), "contracts route should not infer end date from FULL_TIME employment type");

[
  "autoCreateOnboardingCaseAfterEmployeeCreate",
  "await autoCreateOnboardingCaseAfterEmployeeCreate(c, id)"
].forEach((marker) => must(employees.includes(marker), `employees route missing ${marker}`));

[
  "ContractReadinessPanel",
  "Contract missing",
  "Not required",
  "Not selected",
  "Not set",
  "Not applicable",
  "objectMessage"
].forEach((marker) => must(lifecyclePage.includes(marker), `LifecyclePage missing ${marker}`));

[
  contractsPage,
  employeeContractsPanel
].forEach((text, index) => {
  const name = index === 0 ? "ContractsPage" : "EmployeeContractsPanel";
  must(text.includes("requiresEndDate"), `${name} missing dynamic end-date validation`);
  must(text.includes("requiresProbation"), `${name} missing dynamic probation validation`);
  must(text.includes("allowsSalaryTerms"), `${name} missing salary terms contract-type gate`);
  must(text.includes("End date is optional for this contract type."), `${name} missing permanent/end-date helper text`);
  must(text.includes("status !== \"ARCHIVED\" && !type.archived_at"), `${name} must keep archived contract types out of create forms`);
});
must(employeeContractsPanel.includes("contract_type_display_name"), "Employee 360 contracts panel must use null-safe contract type display");
must(selfServicePage.includes("contract_type_display_name") && selfServicePage.includes("Not selected"), "self-service contract summary must be null-safe for missing contract type");

must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(lifecyclePage), "LifecyclePage uses browser alert/confirm/prompt");
must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(contractsPage), "ContractsPage uses browser alert/confirm/prompt");
must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(employeeContractsPanel), "EmployeeContractsPanel uses browser alert/confirm/prompt");
must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(selfServicePage), "SelfServicePage uses browser alert/confirm/prompt");
must(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed");
must(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed");
must(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");
must(auth.includes("PBKDF2_ITERATIONS = 100000") || auth.includes("100000"), "PBKDF2 max iteration guard missing");

[
  "scripts/verify-prompt23.mjs",
  "scripts/verify-global-form-validation.mjs",
  "scripts/run-production-smoke-checks.mjs"
].forEach((file) => must(exists(file), `${file} is missing`));

if (failures.length) {
  console.error("Onboarding contract null-handling verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Onboarding contract null-handling verification passed.");

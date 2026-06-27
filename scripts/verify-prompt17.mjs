import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    console.error(`Prompt 17 verification failed: missing ${file}`);
    process.exit(1);
  }
  return fs.readFileSync(target, "utf8");
}

function ok(condition, message) {
  if (!condition) {
    console.error(`Prompt 17 verification failed: ${message}`);
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
  "verify:prompt14",
  "verify:prompt15",
  "verify:prompt16",
  "verify:prompt17"
].forEach((script) => ok(Boolean(scripts[script]), `package.json missing ${script}`));

hasAll("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS asset_uniform_settings",
  "CREATE TABLE IF NOT EXISTS asset_categories",
  "CREATE TABLE IF NOT EXISTS asset_items",
  "CREATE TABLE IF NOT EXISTS employee_asset_assignments",
  "CREATE TABLE IF NOT EXISTS uniform_types",
  "CREATE TABLE IF NOT EXISTS uniform_stock_items",
  "CREATE TABLE IF NOT EXISTS employee_uniform_assignments",
  "CREATE TABLE IF NOT EXISTS asset_uniform_assignment_events",
  "default_asset_clearance_required_before_final_settlement",
  "default_uniform_clearance_required_before_final_settlement",
  "FULL_REPLACEMENT_VALUE",
  "CUSTOM_FORMULA_PLACEHOLDER",
  "ASSET_ASSIGNMENT",
  "UNIFORM_ASSIGNMENT",
  "DEDUCTION_APPLIED",
  "DEDUCTION_WAIVED",
  "DOCUMENT_LINKED"
]);

hasAll("database/seed.sql", [
  "Prompt 17: Asset & Uniform Lifecycle Advanced Completion",
  "assets.settings.view",
  "assets.settings.update",
  "assets.categories.archive",
  "assets.items.archive",
  "assets.assignments.issue",
  "assets.assignments.return",
  "assets.assignments.transfer",
  "assets.assignments.mark_damaged",
  "assets.assignments.mark_lost",
  "assets.assignments.apply_deduction",
  "assets.assignments.waive",
  "assets.deductions.apply",
  "assets.deductions.waive",
  "uniforms.settings.view",
  "uniforms.types.manage",
  "uniforms.stock.manage",
  "uniforms.assignments.issue",
  "uniforms.assignments.return",
  "uniforms.assignments.mark_damaged",
  "uniforms.assignments.mark_lost",
  "uniforms.assignments.apply_deduction",
  "uniforms.assignments.waive",
  "uniforms.assignments.cancel",
  "uniforms.deductions.apply",
  "uniforms.deductions.waive",
  "self_service.uniforms.view",
  "asset_uniform_settings_default",
  "asset_cat_laptop",
  "asset_cat_pos_device",
  "asset_cat_keys_access",
  "uniform_type_shirt",
  "uniform_type_name_badge",
  "ASSET_DAMAGE",
  "UNIFORM_DEDUCTION"
]);

hasAll("worker/src/db/permissions.ts", [
  "assets.settings.view",
  "assets.settings.update",
  "assets.assignments.issue",
  "assets.assignments.return",
  "assets.assignments.transfer",
  "assets.assignments.mark_damaged",
  "assets.assignments.mark_lost",
  "assets.assignments.apply_deduction",
  "assets.assignments.waive",
  "assets.deductions.apply",
  "assets.deductions.waive",
  "uniforms.settings.view",
  "uniforms.types.view",
  "uniforms.stock.view",
  "uniforms.assignments.issue",
  "uniforms.assignments.return",
  "uniforms.assignments.mark_damaged",
  "uniforms.assignments.mark_lost",
  "uniforms.assignments.apply_deduction",
  "uniforms.assignments.waive",
  "uniforms.assignments.cancel",
  "uniforms.deductions.apply",
  "uniforms.deductions.waive",
  "self_service.uniforms.view"
]);

hasAll("worker/src/routes/asset-uniforms-advanced.ts", [
  "assetUniformAdvancedRoutes",
  "uniformRoutes",
  "employeeAssetUniformRoutes",
  "selfServiceAssetUniformRoutes",
  "requireAssetModuleEnabled",
  "requireUniformModuleEnabled",
  "issueAssetToEmployee",
  "returnEmployeeAsset",
  "transferEmployeeAsset",
  "markEmployeeAssetDamaged",
  "markEmployeeAssetLost",
  "applyAssetDeduction",
  "waiveAssetDeduction",
  "getEmployeeAssetClearanceStatus",
  "issueUniformToEmployee",
  "returnEmployeeUniform",
  "markEmployeeUniformDamaged",
  "markEmployeeUniformLost",
  "applyUniformDeduction",
  "waiveUniformDeduction",
  "getEmployeeUniformClearanceStatus",
  "createAssetDamageCustomDeduction",
  "createUniformDamageCustomDeduction",
  "linkAssetAssignmentToCustomDeduction",
  "linkUniformAssignmentToCustomDeduction",
  "getAssetClearanceForSettlement",
  "getUniformClearanceForSettlement",
  "calculateAssetDeductionsForSettlement",
  "calculateUniformDeductionsForSettlement",
  "getEmployeeAssetUniformClearanceSummary",
  "createAssetApprovalInstance",
  "createUniformApprovalInstance",
  "getAssetAssignmentApprovalSummary",
  "getUniformAssignmentApprovalSummary",
  "syncAssetAssignmentApprovalStatus",
  "syncUniformAssignmentApprovalStatus",
  "linkAssetAssignmentDocument",
  "linkUniformAssignmentDocument",
  "getAssetAssignmentDocumentStatus",
  "getUniformAssignmentDocumentStatus",
  "/settings",
  "/assignments/issue",
  "/assignments/:assignmentId/return",
  "/assignments/:assignmentId/transfer",
  "/assignments/:assignmentId/mark-damaged",
  "/assignments/:assignmentId/mark-lost",
  "/assignments/:assignmentId/apply-deduction",
  "/assignments/:assignmentId/waive",
  "/assignments/:assignmentId/cancel",
  "/assets-uniforms/summary",
  "/uniforms"
]);

hasAll("worker/src/index.ts", [
  "assetUniformAdvancedRoutes",
  "employeeAssetUniformRoutes",
  "selfServiceAssetUniformRoutes",
  "uniformRoutes",
  "/api/v1/assets",
  "/api/v1/uniforms",
  "/api/v1/employees",
  "/api/v1/self-service"
]);

hasAll("worker/src/routes/reports.ts", [
  "assetUniformReport",
  "assets/assigned",
  "assets/available",
  "assets/damaged",
  "assets/lost",
  "assets/history",
  "assets/by-employee",
  "assets/by-department",
  "assets/by-worksite",
  "assets/pending-returns",
  "assets/clearance",
  "uniforms/issue-summary",
  "uniforms/stock",
  "uniforms/damaged-lost",
  "uniforms/clearance",
  "assets-uniforms/deductions",
  "assets-uniforms/final-settlement-impact"
]);

hasAll("frontend/src/lib/api.ts", [
  "getAssetUniformSettings",
  "updateAssetUniformSettings",
  "archiveAssetCategory",
  "assetAssignmentAdvancedAction",
  "getEmployeeAssetUniformSummary",
  "assignAssetToEmployee",
  "listUniformTypes",
  "createUniformType",
  "archiveUniformType",
  "listUniformStock",
  "createUniformStock",
  "listUniformAssignments",
  "issueUniformAssignment",
  "issueEmployeeUniform",
  "uniformAssignmentAction",
  "getSelfServiceUniforms"
]);

hasAll("frontend/src/types/assets.ts", [
  "AssetUniformSettings",
  "UniformType",
  "UniformStockItem",
  "UniformAssignment",
  "AssetUniformEvent",
  "AssetUniformClearanceSummary"
]);

hasAll("frontend/src/pages/AssetUniformAdvancedPages.tsx", [
  "AssetUniformSettingsPage",
  "UniformTypesPage",
  "UniformInventoryPage",
  "UniformAssignmentsPage",
  "Asset & Uniform Settings",
  "Uniform Types",
  "Uniform Inventory",
  "Uniform Assignments",
  "Issue uniform"
]);

hasAll("frontend/src/components/assets/AssetsNav.tsx", [
  "/assets/uniforms",
  "/assets/uniform-assignments",
  "/assets/uniform-types"
]);

hasAll("frontend/src/components/ui/page-shell.tsx", [
  'prefix: "/assets"',
  'settingsPath: "/assets/settings"',
  "SettingsIcon"
]);

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "AssetUniformSettingsPage",
  "UniformInventoryPage",
  "UniformAssignmentsPage",
  "UniformTypesPage",
  "assets/uniforms",
  "assets/uniform-assignments",
  "assets/uniform-types",
  "assets/settings",
  "self-service/uniforms"
]);

hasAll("frontend/src/components/assets/EmployeeAssetsPanel.tsx", [
  "getEmployeeAssetUniformSummary",
  "Uniform assignments",
  "clearance",
  "uniforms"
]);

hasAll("frontend/src/pages/SelfServicePage.tsx", [
  "getSelfServiceUniforms",
  "My Uniforms",
  "UniformsSection",
  "uniforms"
]);

hasAll("worker/src/routes/final-settlement.ts", [
  "getAssetClearanceForSettlement",
  "getUniformClearanceForSettlement",
  "calculateAssetDeductionsForSettlement",
  "calculateUniformDeductionsForSettlement"
]);

hasAll("worker/src/routes/payroll-foundations.ts", [
  "ASSET_DAMAGE",
  "UNIFORM",
  "employee_custom_deductions"
]);

hasAll("worker/src/routes/approvals.ts", [
  "createApprovalForModuleEntity",
  "getModuleEntityApprovalSummary"
]);

for (const file of [
  "worker/src/routes/asset-uniforms-advanced.ts",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/components/assets/EmployeeAssetsPanel.tsx",
  "frontend/src/pages/SelfServicePage.tsx"
]) {
  const text = read(file);
  ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} must not use browser alert/confirm/prompt`);
}

const prompt17Text = [
  read("worker/src/routes/asset-uniforms-advanced.ts"),
  read("frontend/src/pages/AssetUniformAdvancedPages.tsx")
].join("\n");
ok(!/purchase[-_\s]?order|supplier|depreciation|barcode|qr\s*scanner|warehouse\s+transfer/i.test(prompt17Text), "Prompt 17 must not add procurement, supplier, depreciation, barcode, QR scanner, or warehouse transfer systems");

const wranglerToml = read("worker/wrangler.toml");
ok(wranglerToml.includes('binding = "DB"'), "D1 DB binding missing");
ok(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database name changed");
ok(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database id changed");
ok(wranglerToml.includes('binding = "DOCUMENTS_BUCKET"'), "R2 binding missing");
ok(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

const authText = read("worker/src/auth/password.ts");
ok(authText.includes("100000"), "PBKDF2 iteration cap must remain 100000");

console.log("Prompt 17 verification passed.");

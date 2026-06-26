import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function requireFile(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: missing required file`);
}

function has(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasAll(relativePath, markers) {
  markers.forEach((marker) => has(relativePath, marker, `missing marker ${String(marker)}`));
}

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts?.["verify:module-toggle-settings"]) failures.push("package.json: missing verify:module-toggle-settings script");

requireFile("frontend/src/components/settings/ModuleToggleHeader.tsx");
requireFile("frontend/src/components/ui/switch.tsx");

hasAll("frontend/src/components/settings/ModuleToggleHeader.tsx", [
  "ModuleToggleHeader",
  "ModuleSettingsBody",
  "ConfirmDialog",
  "dependencyWarnings",
  "You do not have permission to enable or disable this module.",
  "This module is currently disabled. Enable it to edit settings or use related features.",
  "permissionCanUpdate"
]);
hasAll("frontend/src/components/ui/switch.tsx", ["Switch", "peer-checked", "sr-only", "onCheckedChange"]);

[
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/RosterSettingsPage.tsx",
  "frontend/src/pages/SelfServiceSettingsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx"
].forEach((file) => {
  requireFile(file);
  has(file, "ModuleToggleHeader", "settings page must use the shared module toggle header");
  has(file, "ModuleSettingsBody", "settings page must grey out disabled settings through ModuleSettingsBody");
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be used");
});

[
  ["frontend/src/pages/AttendanceSettingsPage.tsx", "label=\"Attendance module enabled\""],
  ["frontend/src/pages/RosterSettingsPage.tsx", "label=\"Roster module enabled\""],
  ["frontend/src/pages/SelfServiceSettingsPage.tsx", "[\"module_enabled\", \"Self-service enabled\"]"],
  ["frontend/src/pages/DocumentCompliancePage.tsx", "label=\"Compliance enabled\""],
  ["frontend/src/pages/ApprovalsPage.tsx", "label=\"Central approvals enabled\""],
  ["frontend/src/pages/ContractsPage.tsx", "\"contracts_enabled\", \"require_contract_for_active_employee\""],
  ["frontend/src/pages/FinalSettlementPage.tsx", "\"final_settlement_enabled\","],
  ["frontend/src/pages/AssetUniformAdvancedPages.tsx", "[\"asset_module_enabled\", \"Asset module enabled\""],
  ["frontend/src/pages/AssetUniformAdvancedPages.tsx", "[\"uniform_module_enabled\", \"Uniform module enabled\""]
].forEach(([file, marker]) => hasNo(file, marker, `old embedded module toggle marker remains: ${marker}`));

has("frontend/src/pages/AttendanceSettingsPage.tsx", "disabled={saving || !moduleEnabled}", "attendance save must be disabled while module is disabled");
has("frontend/src/pages/RosterSettingsPage.tsx", "disabled={saving || !moduleEnabled}", "roster save must be disabled while module is disabled");
has("frontend/src/pages/SelfServiceSettingsPage.tsx", "disabled={saving || !settings || !moduleEnabled}", "self-service save must be disabled while module is disabled");
has("frontend/src/pages/PayrollAdminPages.tsx", "disabled={!moduleEnabled}", "payroll save/action must reflect disabled module state");
has("frontend/src/pages/AttendanceDeviceOperationsPage.tsx", "zkteco_csv_import_enabled: false", "ZKTeco disable path must turn off import modes");

has("frontend/src/routes/AppRoutes.tsx", "lazyPage", "Prompt 13 route-level lazy loading marker missing");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 manual chunk split marker missing");
has("worker/src/auth/password.ts", "100000", "PBKDF2 max iteration marker must remain 100000");
has("worker/wrangler.toml", 'binding = "DB"', "D1 binding missing");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding missing");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");

if (failures.length) {
  console.error("Module toggle settings verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Module toggle settings verification passed.");

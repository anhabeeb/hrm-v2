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

function has(relativePath, marker, message) {
  const text = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(text) : text.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  const text = read(relativePath);
  const matched = marker instanceof RegExp ? marker.test(text) : text.includes(marker);
  if (matched) failures.push(`${relativePath}: ${message}`);
}

function routeHasNoAssetGate(routePath) {
  const text = read("worker/src/routes/employees.ts");
  const index = text.indexOf(routePath);
  if (index === -1) {
    failures.push(`worker/src/routes/employees.ts: missing core employee route ${routePath}`);
    return;
  }
  const nearby = text.slice(Math.max(0, index - 180), index + 420);
  if (/assets_uniforms|Assets and uniforms|requireOperationalModuleEnabled\(c,\s*"assets_uniforms"/.test(nearby)) {
    failures.push(`worker/src/routes/employees.ts: core route ${routePath} is gated by Assets & Uniforms`);
  }
}

[
  "worker/src/index.ts",
  "worker/src/routes/employees.ts",
  "worker/src/routes/assets-notes-audit.ts",
  "worker/src/routes/asset-uniforms-advanced.ts",
  "worker/src/routes/lifecycle.ts",
  "worker/src/routes/self-service.ts",
  "worker/src/utils/module-enforcement.ts",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/components/assets/EmployeeAssetsPanel.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "worker/wrangler.toml"
].forEach((file) => {
  if (!exists(file)) failures.push(`${file}: required file is missing`);
});

hasNo(
  "worker/src/routes/assets-notes-audit.ts",
  /employeeAssetRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/,
  "employee asset router must not broad-catch all /employees routes when assets are disabled"
);
has(
  "worker/src/routes/assets-notes-audit.ts",
  /employeeAssetRoutes\.use\("\/:employeeId\/assets\/\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/,
  "employee asset summary/history/assignment routes still enforce Assets & Uniforms"
);
has(
  "worker/src/routes/assets-notes-audit.ts",
  /assetRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/,
  "top-level asset APIs still enforce Assets & Uniforms"
);

hasNo(
  "worker/src/routes/asset-uniforms-advanced.ts",
  /employeeAssetUniformRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/,
  "employee advanced asset/uniform router must not broad-catch all /employees routes"
);
hasNo(
  "worker/src/routes/asset-uniforms-advanced.ts",
  /selfServiceAssetUniformRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/,
  "self-service asset/uniform router must not broad-catch all /self-service routes"
);
[
  /employeeAssetUniformRoutes\.use\("\/:employeeId\/assets\/\*"/,
  /employeeAssetUniformRoutes\.use\("\/:employeeId\/assets-uniforms\/\*"/,
  /employeeAssetUniformRoutes\.use\("\/:employeeId\/uniforms"/,
  /selfServiceAssetUniformRoutes\.use\("\/assets"/,
  /selfServiceAssetUniformRoutes\.use\("\/uniforms"/,
  /assetUniformAdvancedRoutes\.use\("\*",\s*async/,
  /uniformRoutes\.use\("\*",\s*async/,
  /requireOperationalModuleMiddleware\("assets_uniforms"/
].forEach((marker) => has("worker/src/routes/asset-uniforms-advanced.ts", marker, "actual asset/uniform routes must remain disabled-module protected"));

[
  'employeeRoutes.get("/",',
  'employeeRoutes.get("/assignment-options",',
  'employeeRoutes.get("/settings/statuses",',
  'employeeRoutes.post("/",',
  'employeeRoutes.get("/:id",',
  'employeeRoutes.patch("/:id",',
  'employeeRoutes.post("/:id/status",',
  'employeeRoutes.get("/:id/user-account",',
  'employeeRoutes.post("/:id/user-account/link-existing",',
  'employeeRoutes.post("/:id/user-account/provision",'
].forEach(routeHasNoAssetGate);
hasNo("worker/src/routes/employees.ts", /assets_uniforms|Assets and uniforms/, "employee core route module must not reference Assets & Uniforms");

has("frontend/src/pages/EmployeeProfilePage.tsx", "assetsUniformsVisible", "Employee 360 must read Assets & Uniforms visibility");
has("frontend/src/pages/EmployeeProfilePage.tsx", "visibleProfileTabs", "Employee 360 must filter hidden optional tabs");
has("frontend/src/pages/EmployeeProfilePage.tsx", /tab !== "Assets & Uniforms"/, "Employee 360 must hide Assets & Uniforms tab when disabled");
has("frontend/src/pages/EmployeeProfilePage.tsx", /const canAssets = assetsUniformsVisible &&/, "Employee 360 asset permission must include module visibility");
has("frontend/src/components/assets/EmployeeAssetsPanel.tsx", "assetsUniformsVisible", "Employee assets panel must read module visibility");
has("frontend/src/components/assets/EmployeeAssetsPanel.tsx", "if (!token || !assetsUniformsVisible)", "Employee assets panel must skip API calls when hidden");
has("frontend/src/components/assets/EmployeeAssetsPanel.tsx", "Assets & uniforms disabled", "Employee assets panel must fail closed with a compact disabled state");

has("frontend/src/pages/SelfServicePage.tsx", 'moduleKeys: ["assets_uniforms"]', "self-service My Assets/My Uniforms must be tied to asset module visibility");
has("frontend/src/pages/SelfServicePage.tsx", "navItemVisible(activeItem, requestVisibility)", "self-service must skip disabled optional section API calls");
has("frontend/src/pages/SelfServicePage.tsx", 'activeMode === "profile"', "self-service My Profile route must remain independent");
hasNo(
  "frontend/src/pages/SelfServicePage.tsx",
  /activeMode === "profile"[\s\S]{0,260}assets_uniforms/,
  "self-service My Profile must not be gated by Assets & Uniforms"
);

has("worker/src/routes/lifecycle.ts", "moduleStatuses.assets_uniforms !== false", "onboarding/offboarding asset tasks must be module-aware");
has("worker/src/routes/lifecycle.ts", "not_required: true", "disabled asset setup actions must become not required instead of blocking");
has("frontend/src/pages/LifecyclePage.tsx", "Assets/uniforms not required", "onboarding/offboarding UI must show disabled assets as not required");

has("worker/src/utils/module-enforcement.ts", "moduleSpecificSettingEnabledRaw", "module visibility sync helper must remain present");
has("worker/src/utils/module-enforcement.ts", "asset_uniform_settings", "Assets & Uniforms visibility must come from asset_uniform_settings");
hasNo("worker/src/utils/module-enforcement.ts", /case "roster":[\s\S]{0,260}attendance_settings/, "Roster must not depend on Attendance toggle");

[
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/components/assets/EmployeeAssetsPanel.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "worker/src/routes/employees.ts",
  "worker/src/routes/assets-notes-audit.ts",
  "worker/src/routes/asset-uniforms-advanced.ts"
].forEach((file) => {
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be used");
  if (file.startsWith("frontend/")) hasNo(file, /\bdark:/, "dark mode classes must not be introduced");
});

const wrangler = read("worker/wrangler.toml");
if (!wrangler.includes('binding = "DB"') || !wrangler.includes('database_name = "hrm-v2"') || !wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"')) {
  failures.push("worker/wrangler.toml: D1 binding changed");
}
if (!wrangler.includes('binding = "DOCUMENTS_BUCKET"') || !wrangler.includes('bucket_name = "hrm-v2-documents"')) {
  failures.push("worker/wrangler.toml: R2 binding changed");
}

has("worker/src/auth/password.ts", "MAX_WORKER_PBKDF2_ITERATIONS = 100000", "PBKDF2 max iteration cap must remain 100000");

if (failures.length) {
  console.error("Employee core vs Assets & Uniforms verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Employee core vs Assets & Uniforms disabled-module verification passed.");

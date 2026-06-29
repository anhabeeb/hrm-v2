import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`FAIL: ${message}`);
}

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function hasAll(file, markers, message) {
  const source = read(file);
  check(markers.every((marker) => source.includes(marker)), message);
}

function walk(dir, predicate = () => true) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".wrangler"].includes(entry.name)) continue;
    const full = path.join(absolute, entry.name);
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...walk(relative, predicate));
    else if (predicate(relative)) files.push(relative);
  }
  return files;
}

const loadingComponents = [
  "frontend/src/components/loading/AppLoader.tsx",
  "frontend/src/components/loading/PageLoader.tsx",
  "frontend/src/components/loading/TableSkeleton.tsx",
  "frontend/src/components/loading/CardSkeleton.tsx",
  "frontend/src/components/loading/FormSkeleton.tsx",
  "frontend/src/components/loading/InlineSpinner.tsx",
  "frontend/src/components/loading/LoadingOverlay.tsx",
  "frontend/src/components/loading/LoadingButton.tsx",
  "frontend/src/components/loading/index.ts"
];

for (const file of loadingComponents) check(exists(file), `${file} exists`);

hasAll("frontend/src/components/loading/AppLoader.tsx", [
  "Preparing HRM workspace",
  "Loading your secure employee operations dashboard",
  "aria-busy",
  "bg-[linear-gradient",
  "loader-slide",
  "motion-reduce:animate-none"
], "AppLoader is branded, accessible, light themed, and reduced-motion friendly");

hasAll("frontend/src/components/loading/PageLoader.tsx", [
  "PageLoader",
  "InlineSpinner",
  "aria-busy",
  "Loading workspace",
  "rounded-lg border bg-white"
], "PageLoader provides route/lazy page loading UI");

hasAll("frontend/src/components/loading/TableSkeleton.tsx", [
  "TableSkeleton",
  "aria-busy",
  "overflow-x-auto",
  "gridTemplateColumns",
  "animate-pulse"
], "TableSkeleton uses table-like rows and internal horizontal handling");

hasAll("frontend/src/components/loading/CardSkeleton.tsx", [
  "CardSkeleton",
  "sm:grid-cols-2",
  "xl:grid-cols-4",
  "aria-busy"
], "CardSkeleton supports dashboard/KPI style loading");

hasAll("frontend/src/components/loading/FormSkeleton.tsx", [
  "FormSkeleton",
  "md:grid-cols-2",
  "aria-busy"
], "FormSkeleton supports form/dialog loading states");

hasAll("frontend/src/components/ui/button.tsx", [
  "loading?: boolean",
  "loadingLabel?: string",
  "InlineSpinner",
  "aria-busy={loading || undefined}",
  "disabled={disabled || loading}"
], "shared Button supports loading state and duplicate-submit prevention");

hasAll("frontend/src/components/loading/LoadingButton.tsx", [
  "LoadingButton",
  "loading={loading}"
], "LoadingButton wrapper exists for explicit loading buttons");

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "AppLoader",
  "PageLoader",
  "<Suspense fallback={<PageLoader",
  "return <AppLoader />"
], "app auth/startup and route suspense use professional loaders");

hasAll("frontend/src/layouts/AppShell.tsx", [
  "Suspense",
  "PageLoader",
  "<Suspense fallback={<PageLoader",
  "<Outlet />"
], "AppShell preserves sidebar/header while lazy page content loads");

hasAll("frontend/src/components/LoadingScreen.tsx", [
  "AppLoader",
  "return <AppLoader />"
], "legacy LoadingScreen delegates to AppLoader");

hasAll("frontend/src/components/ui/data-table.tsx", [
  "TableSkeleton",
  "if (loading)",
  "<TableSkeleton rows={5}"
], "DataTableFrame uses professional table skeletons");

hasAll("frontend/src/components/ui/data-table-shell.tsx", [
  "TableSkeleton",
  "if (loading)",
  "<TableSkeleton rows={5}"
], "DataTableShell uses professional table skeletons");

hasAll("frontend/src/components/ui/page-shell.tsx", [
  "CardSkeleton",
  "FormSkeleton",
  "TableSkeleton",
  "export { CardSkeleton, FormSkeleton, TableSkeleton }",
  "aria-busy"
], "page-shell exports professional skeleton primitives for existing pages");

hasAll("frontend/src/pages/LoginPage.tsx", [
  "loading={submitting}",
  "loadingLabel=\"Signing in\"",
  "showValidationError"
], "login submission uses standardized loading button and keeps validation alerts");

hasAll("frontend/src/pages/SetupPage.tsx", [
  "loading={submitting}",
  "loadingLabel=\"Creating owner account\""
], "setup submission uses standardized loading button");

hasAll("frontend/src/components/import/ImportWizard.tsx", [
  "templateBusy",
  "errorsBusy",
  "loading={templateBusy === \"xlsx\"}",
  "loading={templateBusy === \"csv\"}",
  "loading={busy}",
  "loading={errorsBusy}",
  "ImportPreviewTable preview={preview} rows={rows} loading={busy && step === \"preview\"}",
  "showSuccess",
  "showApiError"
], "import/export wizard actions have professional loading states and global alert results");

hasAll("frontend/src/components/import/ImportPreviewTable.tsx", [
  "TableSkeleton",
  "loading?: boolean",
  "Loading import preview"
], "import preview table has a skeleton loading state");

hasAll("frontend/src/pages/DashboardPage.tsx", [
  "CardSkeleton",
  "data-professional-loader=\"command-center\"",
  "KPI_ROW_SIZE = 5",
  "CommandCenterSkeleton"
], "Command Center loading state keeps accepted KPI behavior");

const frontendFiles = walk("frontend/src", (file) => /\.(ts|tsx)$/.test(file));
for (const file of frontendFiles) {
  const source = read(file);
  check(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source), `${file} has no browser alert/confirm/prompt`);
  check(!/\bdark:/.test(source), `${file} does not add dark mode classes`);
}

check(!read("frontend/src/components/LoadingScreen.tsx").includes("Loading HRM v2"), "rough full-screen Loading HRM v2 text was removed");
check(!read("frontend/src/routes/AppRoutes.tsx").includes("LoadingScreen"), "routes no longer use plain LoadingScreen as suspense fallback");

hasAll("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1 and R2 bindings remain unchanged");

check(read("worker/src/auth/password.ts").includes("100000"), "PBKDF2 remains capped at 100000");

const regressionScripts = [
  "scripts/verify-global-popup-alerts.mjs",
  "scripts/verify-form-action-validation-hardening.mjs",
  "scripts/verify-employee-user-account-linking.mjs",
  "scripts/verify-import-export-standardization.mjs",
  "scripts/verify-button-color-standardization.mjs",
  "scripts/verify-frontend-static-assets.mjs",
  "scripts/verify-frontend-bundle-integrity.mjs",
  "scripts/verify-filter-search-date-standardization.mjs",
  "scripts/verify-command-center-dashboard.mjs"
];
for (const file of regressionScripts) check(exists(file), `${file} remains present`);

if (failed) {
  console.error("Professional app loader verification failed.");
  process.exit(1);
}

console.log("Professional app loader verification passed.");

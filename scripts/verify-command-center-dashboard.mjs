import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function has(file, needle, message) {
  const text = read(file);
  const ok = needle instanceof RegExp ? needle.test(text) : text.includes(needle);
  if (!ok) failures.push(message);
}

function hasNo(file, needle, message) {
  const text = read(file);
  const ok = needle instanceof RegExp ? !needle.test(text) : !text.includes(needle);
  if (!ok) failures.push(message);
}

function before(file, first, second, message) {
  const text = read(file);
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) failures.push(message);
}

const appShell = "frontend/src/layouts/AppShell.tsx";
const dashboardPage = "frontend/src/pages/DashboardPage.tsx";
const dashboardRoute = "worker/src/routes/dashboard.ts";
const api = "frontend/src/lib/api.ts";
const appRoutes = "frontend/src/routes/AppRoutes.tsx";
const loginPage = "frontend/src/pages/LoginPage.tsx";

has(appShell, "topLevelNavItems", "Command Center must be modeled as a top-level sidebar item.");
has(appShell, "HRM Command Center", "Sidebar must label the first item HRM Command Center.");
has(appShell, "LayoutDashboard", "Command Center sidebar item must use a dashboard-style icon.");
before(appShell, "topLevelNavItems", "const navGroups", "Command Center top-level item must be declared before grouped navigation.");
hasNo(appShell, /label:\s*["']Dashboard["'][\s\S]{0,120}items:\s*\[\{\s*label:\s*["']Dashboard["']/m, "Dashboard must not remain as a collapsible sidebar group.");

has(appRoutes, '<Route index element={<DashboardPage />} />', "Command Center must remain the index route.");
has(appRoutes, 'path="dashboard" element={<DashboardPage />}', "Explicit /dashboard compatibility route is required.");
has(appRoutes, 'path="command-center" element={<Navigate to="/dashboard" replace />}', "/command-center backward compatibility redirect is required.");
has(appRoutes, "defaultLandingPath", "Admin default landing logic must be explicit.");
has(loginPage, "defaultLandingPath", "Login must navigate admins to Command Center and employee-only users to Self-Service.");
has(loginPage, '"/self-service"', "Employee-only default landing must preserve Self-Service behavior.");

has(api, "getCommandCenterDashboard", "Frontend API helper for command center summary is missing.");
has(api, "/api/v1/dashboard/command-center-summary", "Command Center frontend must use the grouped summary API.");

has(dashboardRoute, "/command-center-summary", "Dashboard summary API route is missing.");
has(dashboardRoute, "safeDashboardSummaryGroup", "Safe group wrapper is missing.");
has(dashboardRoute, "enabled_modules", "Grouped summary must include enabled module metadata.");
has(dashboardRoute, "priority_actions", "Grouped summary must include priority actions.");
has(dashboardRoute, "groups", "Grouped KPI response must include groups.");
has(dashboardRoute, "moduleControlEnabled", "Summary API must respect central module control settings.");
has(dashboardRoute, "settingEnabled", "Summary API must respect module settings toggles.");
has(dashboardRoute, "buildEmployeeScopeWhereClause", "Summary API must enforce employee access scopes.");
has(dashboardRoute, "payroll_employee_results", "Payroll dashboard summary must use active payroll result tables.");
has(dashboardRoute, "employee_uniform_assignments", "Assets/uniforms KPI coverage is missing.");
has(dashboardRoute, "catch", "Dashboard group failures must be isolated.");

has(dashboardPage, "HRM Command Center", "Command Center header title is missing.");
has(dashboardPage, "Enterprise people operations overview with live HR, attendance, payroll, compliance, and workflow indicators.", "Command Center subtitle must match the required copy.");
has(dashboardPage, "CommandCenterKpiCard", "KPI card component marker is missing.");
has(dashboardPage, "Priority Actions", "Priority Actions section is missing.");
has(dashboardPage, "MetricGrid", "Dashboard KPI grid must use the standardized metric grid.");
has(dashboardPage, "DashboardWidget", "Dashboard groups must use standardized dashboard widgets.");
has(dashboardPage, "to={card.route}", "KPI cards must be clickable and route-aware.");
has(dashboardPage, "summary?.priority_actions", "Priority actions must come from the summary API.");
has(dashboardPage, "summary?.warnings", "Group warning display is missing.");
hasNo(dashboardPage, "PriorityTable", "Table-heavy dashboard priority table must be removed.");
hasNo(dashboardPage, "DataTableFrame", "Command Center KPI area must not use table frames.");
hasNo(dashboardPage, "Table", "Command Center dashboard must not render table-heavy blocks.");

for (const file of [appShell, dashboardPage, dashboardRoute, api, appRoutes, loginPage]) {
  hasNo(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, `${file} must not use browser alert/confirm/prompt.`);
}

has("worker/src/auth/password.ts", "PBKDF2_ITERATIONS = 100000", "PBKDF2 iteration cap must remain 100000.");
has("worker/wrangler.toml", 'binding = "DB"', "D1 binding name changed or missing.");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed or missing.");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed or missing.");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding name changed or missing.");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed or missing.");

has("scripts/verify-performance-optimization.mjs", "performance", "Performance optimization verifier must remain present.");
has("scripts/verify-settings-toggles-tabs-layout.mjs", "SettingsPage", "Settings toggles/tabs verifier must remain present.");
has("scripts/verify-global-search-notifications.mjs", "GlobalSearch", "Global search/notifications verifier must remain present.");
has("scripts/verify-shadcn-navigation-tabs.mjs", "Tabs", "shadcn navigation tabs verifier must remain present.");
hasNo(dashboardPage, /dark:/, "Command Center must remain light-theme only.");

if (failures.length) {
  console.error("Command Center dashboard verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Command Center dashboard verification passed.");

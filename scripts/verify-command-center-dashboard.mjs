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
const tooltipComponent = "frontend/src/components/ui/tooltip.tsx";
const api = "frontend/src/lib/api.ts";
const appRoutes = "frontend/src/routes/AppRoutes.tsx";
const loginPage = "frontend/src/pages/LoginPage.tsx";

has(appShell, "topLevelNavItems", "Command Center must be modeled as a top-level sidebar item.");
has(appShell, "Command Center", "Sidebar must label the first item Command Center.");
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
has(dashboardRoute, "Math.max(0, Number(countValue) || 0)", "Priority helper must clamp invalid or negative counts to 0.");
hasNo(dashboardRoute, "countValue <= 0", "Priority helper must not hide enabled/permitted KPI icons when the count is 0.");
hasNo(dashboardRoute, /function priority[\s\S]{0,260}return null/, "Priority helper must return an action for zero-count priorities.");
hasNo(dashboardRoute, /filter\(Boolean\)\s+as\s+PriorityAction\[\]/, "Priority actions must not rely on zero-count filtering.");
has(dashboardRoute, "canViewOnboardingPriority", "Onboarding priority icon must be gated by module and permission availability.");
has(dashboardRoute, "canViewOffboardingPriority", "Offboarding priority icon must be gated by module and permission availability.");
for (const priorityId of [
  "complete-onboarding",
  "complete-offboarding",
  "resolve-attendance-corrections",
  "review-pending-leave",
  "leave-documents",
  "payroll-holds",
  "missing-documents",
  "contract-renewals",
  "pending-approvals",
  "asset-returns"
]) {
  has(dashboardRoute, priorityId, `Required priority KPI ${priorityId} is missing.`);
}

has(dashboardPage, "OmniCore Command Center", "Command Center header title is missing.");
has(dashboardPage, "Enterprise people operations overview with live HR, attendance, payroll, compliance, and workflow indicators.", "Command Center subtitle must match the required copy.");
has(dashboardPage, "CommandCenterKpiCard", "KPI card component marker is missing.");
has(dashboardPage, "PriorityKpiIconStrip", "Priority KPI icon strip component is missing.");
has(dashboardPage, "<PriorityKpiIconStrip actions={priorityActions} />", "Priority KPI icon strip must be rendered in the Command Center header actions.");
before(dashboardPage, "<PriorityKpiIconStrip actions={priorityActions} />", '<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>', "Priority KPI icon strip must appear immediately before Refresh.");
has(dashboardPage, "PriorityKpiIcon", "Priority KPI icon component is missing.");
has(dashboardPage, "Tooltip", "Priority KPI icons must use tooltip/hover detail behavior.");
has(tooltipComponent, "createPortal", "Tooltip content must render through a portal to avoid header clipping.");
has(tooltipComponent, "document.body", "Tooltip portal must render outside clipped header containers.");
has(tooltipComponent, "fixed z-[100]", "Tooltip content must use a fixed high-z layer.");
has(tooltipComponent, "onMouseEnter", "Tooltip must open on hover.");
has(tooltipComponent, "onFocus", "Tooltip must open on keyboard focus.");
has(tooltipComponent, "aria-describedby", "Tooltip trigger must preserve accessible description behavior.");
has(dashboardPage, "action.count.toLocaleString()", "Priority KPI icons must show their count/value.");
has(dashboardPage, "to={action.route}", "Priority KPI icons must click through to their related route.");
has(dashboardPage, "priorityIconToneClass", "Priority KPI icon tone/glow helper is missing.");
has(dashboardPage, "count <= 0", "Priority KPI icons must have a neutral zero-count state.");
has(dashboardPage, "shadow-none", "Priority KPI zero-count icon state must remove glow/shadow.");
has(dashboardPage, "shadow-[0_0_0_3px", "Priority KPI icons with count > 0 must use a visible glow/color state.");
has(dashboardPage, "text-slate-500", "Priority KPI zero-count icon state must be neutral/grey.");
has(dashboardPage, "hasCount ? \"text-current\" : \"text-slate-500\"", "Priority KPI count text must use a neutral style for zero counts.");
has(dashboardPage, "No pending items in this queue.", "Priority KPI hover content must include a useful zero-state message.");
has(dashboardPage, "Click to open related queue.", "Priority KPI hover content must include action guidance.");
has(dashboardPage, "PriorityKpiIconStrip flex min-w-0 flex-wrap items-center justify-end gap-1.5", "Priority KPI strip must render as a compact non-scroll flex group.");
has(dashboardPage, "overflowActions = actions.slice(4)", "Priority KPI strip must collapse extra mobile icons instead of scrolling.");
has(dashboardPage, "aria-haspopup=\"menu\"", "Priority KPI mobile overflow control must be an accessible menu trigger.");
has(dashboardPage, "PriorityMenuItem", "Priority KPI mobile overflow menu items are missing.");
has(dashboardPage, "hidden lg:inline-flex", "Extra priority KPI icons must be hidden behind the mobile Priority menu on small screens.");
hasNo(dashboardPage, /PriorityKpiIconStrip[\s\S]{0,240}overflow-(?:x-)?(?:auto|scroll)/, "Priority KPI strip must not use visible overflow scroll/auto behavior.");
hasNo(dashboardPage, /PriorityKpiIconStrip[\s\S]{0,240}(?:max-h-|h-\[|min-h-\[)/, "Priority KPI strip must not be a fixed-height scroll box.");
hasNo(tooltipComponent, /absolute\s+right-0\s+top-full/, "Tooltip content must not remain absolute inside a potentially clipped parent.");
has(dashboardPage, "summary?.priority_actions", "Priority actions must come from the summary API.");
hasNo(dashboardPage, "title=\"Priority Actions\"", "Priority Actions must not remain duplicated as a lower section.");
has(dashboardPage, "Accordion", "Dashboard KPI groups must use the shadcn Accordion primitive.");
has(dashboardPage, 'type="single"', "Dashboard KPI accordion must use single-open behavior.");
has(dashboardPage, "collapsible", "Dashboard KPI accordion must allow the open group to be collapsed.");
has(dashboardPage, "getPreferredOpenGroup", "Dashboard KPI accordion must choose Workforce or first available group by default.");
has(dashboardPage, "getKpiGroupFullSummary", "Collapsed KPI full-summary title helper is missing.");
has(dashboardPage, "CommandCenterKpiSummary", "Collapsed KPI summary must use a colored renderer component.");
has(dashboardPage, "toneSummaryValueClass", "Tone-based KPI summary value color classes are missing.");
has(dashboardPage, "kpi-summary-region", "Collapsed KPI summary must render in a distinct right-side summary region.");
has(dashboardPage, "kpi.title", "Collapsed KPI summary must use actual KPI titles.");
has(dashboardPage, "formatValue(kpi.value)", "Collapsed KPI summary must use actual KPI values.");
has(dashboardPage, 'join(" | ")', "Collapsed KPI full summary title must use pipe separators.");
has(dashboardPage, "text-slate-600", "Collapsed KPI summary labels must use readable slate styling.");
has(dashboardPage, "text-emerald-700", "Collapsed KPI summary success values must be color-coded.");
has(dashboardPage, "text-amber-700", "Collapsed KPI summary warning values must be color-coded.");
has(dashboardPage, "text-red-700", "Collapsed KPI summary danger values must be color-coded.");
has(dashboardPage, "text-cyan-700", "Collapsed KPI summary info values must be color-coded.");
has(dashboardPage, "text-slate-300", "Collapsed KPI summary pipe separator styling is missing.");
hasNo(dashboardPage, "Scope-aware operational indicators for enabled modules.", "Collapsed KPI summary must not use generic operational indicator copy.");
hasNo(dashboardPage, /group\.kpis\.length\}\s*KPIs/, "Collapsed KPI summary must not use only an X KPIs badge.");
hasNo(dashboardPage, />\s*\$\{group\.kpis\.length\}\s*KPIs\s*</, "Collapsed KPI trigger must not render X KPIs as the main summary.");
hasNo(dashboardPage, "KPI_SUMMARY_LIMIT", "Collapsed KPI summary must not hide desktop KPI names behind a summary limit.");
hasNo(dashboardPage, /\+\$\{hiddenCount\} more|\+\d+ more/, "Collapsed KPI summary must not use +N more.");
hasNo(dashboardPage, " · ", "Collapsed KPI summary must use pipe separators, not dot separators.");
hasNo(dashboardPage, "Â·", "Collapsed KPI summary must not include encoded dot separators.");
has(dashboardPage, "CommandCenterKpiGrid", "Dashboard KPI grid wrapper marker is missing.");
has(dashboardPage, "max-w-[89rem]", "Dashboard KPI grid must cap wide rows to five cards.");
has(dashboardPage, "KPI_ROW_SIZE = 5", "Dashboard KPI grid must use an explicit five-card row size.");
has(dashboardPage, "commandCenterKpiRowClass", "Dashboard KPI rows must use a shared deterministic row class.");
has(dashboardPage, "chunkKpis", "Dashboard KPI grid must split cards into deterministic rows.");
has(dashboardPage, "chunkKpis(kpis, KPI_ROW_SIZE)", "Dashboard KPI grid must render KPI cards in deterministic five-card rows.");
has(dashboardPage, "chunkKpis(skeletonCards, KPI_ROW_SIZE)", "Dashboard KPI skeleton must use the same deterministic row chunking.");
has(dashboardPage, "flex-col items-center", "Dashboard KPI grid must stack centered KPI rows.");
has(dashboardPage, "kpi-row grid w-full justify-center", "Dashboard KPI rows must be deterministic centered grid rows.");
has(dashboardPage, "lg:[grid-template-columns:repeat(var(--kpi-row-count),minmax(0,12rem))]", "Normal desktop KPI rows must render the full chunk instead of falling back to three columns.");
has(dashboardPage, "xl:[grid-template-columns:repeat(var(--kpi-row-count),minmax(0,14rem))]", "Wide KPI rows must preserve deterministic chunk columns before 2xl.");
has(dashboardPage, "2xl:[grid-template-columns:repeat(var(--kpi-row-count),16.75rem)]", "Wide desktop KPI rows must use row chunk size instead of stretching/wrapping.");
has(dashboardPage, '"--kpi-row-count": row.length', "KPI row column count must be driven by each chunk length.");
has(dashboardPage, "className={commandCenterKpiRowClass}", "Live and skeleton KPI rows must share the deterministic row class.");
hasNo(dashboardPage, "lg:[grid-template-columns:repeat(3", "Command Center KPI rows must not use a three-column desktop breakpoint.");
hasNo(dashboardPage, /grid-template-columns:repeat\(3/, "Command Center KPI rows must not visually split a five-card chunk into 3+2.");
hasNo(dashboardPage, "flex w-full flex-wrap justify-center", "Wide KPI rows must not rely on generic flex-wrap.");
has(dashboardPage, "DashboardWidget", "Dashboard groups must use standardized dashboard widgets.");
has(dashboardPage, "to={card.route}", "KPI cards must be clickable and route-aware.");
has(dashboardPage, "summary?.warnings", "Group warning display is missing.");
has(dashboardPage, "group.enabled", "Disabled module KPI groups must remain hidden.");
hasNo(dashboardPage, "PriorityTable", "Table-heavy dashboard priority table must be removed.");
hasNo(dashboardPage, "DataTableFrame", "Command Center KPI area must not use table frames.");
hasNo(dashboardPage, "Table", "Command Center dashboard must not render table-heavy blocks.");

for (const file of [appShell, dashboardPage, dashboardRoute, tooltipComponent, api, appRoutes, loginPage]) {
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

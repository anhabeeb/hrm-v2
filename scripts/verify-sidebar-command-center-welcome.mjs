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

function countMatches(file, regex) {
  return Array.from(read(file).matchAll(regex)).length;
}

const appShell = "frontend/src/layouts/AppShell.tsx";
const dashboardPage = "frontend/src/pages/DashboardPage.tsx";
const authTypes = "frontend/src/types/auth.ts";
const userDb = "worker/src/db/users.ts";
const dashboardRoute = "worker/src/routes/dashboard.ts";
const tooltipComponent = "frontend/src/components/ui/tooltip.tsx";

has(appShell, "const [openGroup, setOpenGroup] = useState<string | null>", "Sidebar must use a single openGroup state value.");
has(appShell, "resolveActiveSidebarGroup", "Sidebar must resolve the active parent group from the current route.");
has(appShell, "const activeGroupLabel = useMemo(() => resolveActiveSidebarGroup", "Sidebar active group must be derived from route and visible groups.");
has(appShell, "setOpenGroup(activeGroupLabel)", "Route changes must open the matching sidebar group after refresh/navigation.");
has(appShell, "current === label && activeGroupLabel !== label ? null : label", "Opening one sidebar group must close any previously open group while keeping the active route group open.");
has(appShell, "const expanded = collapsed || openGroup === group.label", "Sidebar item expansion must depend on one open group while preserving collapsed behavior.");
has(appShell, "moduleIsVisible", "Disabled-module sidebar visibility filtering must remain in place.");
has(appShell, "canShow(item, permissions, moduleVisibility)", "Sidebar permission and module visibility checks must remain in place.");
has(appShell, "mobileOpen", "Mobile sidebar behavior marker is missing.");
has(appShell, "setMobileOpen(false)", "Mobile sidebar links must continue closing the drawer.");
has(appShell, "collapsed", "Collapsed sidebar behavior marker is missing.");
has(appShell, "aria-expanded={expanded}", "Sidebar group buttons must keep aria-expanded behavior.");
hasNo(appShell, "expandedGroups", "Sidebar must not use the old expandedGroups multi-open state.");
hasNo(appShell, "setExpandedGroups", "Sidebar must not use the old setExpandedGroups updater.");
hasNo(appShell, /useState<Record<string,\s*boolean>>/, "Sidebar group open state must not use a Record<string, boolean>.");
hasNo(appShell, /setExpandedGroups\(\(current\)\s*=>\s*\(\{\s*\.\.\.current/, "Sidebar must not spread old group state when toggling.");
hasNo(appShell, /\?\?\s*true/, "Sidebar groups must not default every group open with ?? true.");
has(appShell, /const\s+\[openGroup,\s*setOpenGroup\]\s*=\s*useState<string\s*\|\s*null>\(\(\)\s*=>\s*readSidebarOpenGroupState\(\)\)/, "Sidebar must persist exactly one open group label, not a multi-open collection.");
has(appShell, /const\s+activeGroupLabel\s*=\s*useMemo\(\(\)\s*=>\s*resolveActiveSidebarGroup\(location\.pathname,\s*sidebarGroups\),\s*\[location\.pathname,\s*sidebarGroups\]\)/, "Sidebar active group must be recalculated from the current route and visible sidebar groups.");
has(appShell, /useEffect\(\(\)\s*=>\s*\{\s*setOpenGroup\(activeGroupLabel\);\s*\},\s*\[activeGroupLabel\]\);/, "Sidebar route changes must replace stale open group state with the active route group.");
has(appShell, /const\s+toggleGroup\s*=\s*\(label:\s*string\)\s*=>\s*\{\s*setOpenGroup\(\(current\)\s*=>\s*\(current\s*===\s*label\s*&&\s*activeGroupLabel\s*!==\s*label\s*\?\s*null\s*:\s*label\)\);\s*\};/, "Sidebar toggle must set a single group label and close the previous submenu.");
has(appShell, /const\s+expanded\s*=\s*collapsed\s*\|\|\s*openGroup\s*===\s*group\.label;/, "Sidebar submenu expansion must be derived from the single openGroup value.");
has(appShell, /visibleGroups[\s\S]*items:\s*group\.items\.filter\(\(item\)\s*=>\s*canShow\(item,\s*permissions,\s*moduleVisibility\)\)/, "Sidebar visible groups must keep permission and disabled-module filtering.");
has(appShell, /sidebarGroups[\s\S]*filter\(\(item\)\s*=>\s*canShow\(item,\s*permissions,\s*moduleVisibility\)\)/, "Self-service sidebar items must keep disabled-module filtering.");
hasNo(appShell, /openGroups|openedGroups|expandedGroupLabels|expandedGroupSet/, "Sidebar must not introduce a second multi-open submenu state.");
if (countMatches(appShell, /useState<[^>]*(?:Record|Set|Array|\[\])[^>]*>\(/g) > 0) {
  failures.push("Sidebar must not use Record/Set/Array state for submenu expansion.");
}

has(dashboardPage, "CommandCenterHeader", "Command Center must have a dedicated header/top container.");
has(dashboardPage, "<CommandCenterWelcome name={welcome.name} title={welcome.title} />", "Command Center welcome must be rendered in the header.");
has(dashboardPage, "Welcome, {name}", "Command Center welcome must render the logged-in user's name.");
has(dashboardPage, "{title}", "Command Center welcome must render the logged-in user's title/designation.");
has(dashboardPage, "text-2xl", "Command Center welcome line must be larger than ordinary body text.");
has(dashboardPage, "sm:text-3xl", "Command Center welcome must scale prominently on larger screens.");
has(dashboardPage, "lg:text-4xl", "Command Center welcome should remain the main visual heading on desktop.");
has(dashboardPage, "text-sm font-medium text-muted-foreground sm:text-base", "Command Center title/designation must render under the welcome line in muted text.");
before(dashboardPage, "<section className=\"CommandCenterHeader", "<CommandCenterWelcome name={welcome.name} title={welcome.title} />", "Command Center header must start with the welcome component.");
before(dashboardPage, "<CommandCenterWelcome name={welcome.name} title={welcome.title} />", "<PriorityKpiIconStrip actions={priorityActions} />", "Command Center welcome must appear before priority KPI icons.");
before(dashboardPage, "<CommandCenterWelcome name={welcome.name} title={welcome.title} />", '<Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>', "Command Center welcome must appear before header actions.");
hasNo(dashboardPage, "OmniCore Command Center", "Old Command Center title must not appear in the Command Center header.");
hasNo(dashboardPage, "Enterprise people operations overview with live HR, attendance, payroll, compliance, and workflow indicators.", "Old Command Center enterprise overview description must not appear.");
hasNo(dashboardPage, "APP_BRANDING", "Command Center header must not reintroduce app branding text in place of the welcome heading.");

has(dashboardPage, "const { token, user } = useAuth();", "Command Center welcome must use the authenticated user context.");
has(dashboardPage, "const welcome = useMemo(() => resolveCommandCenterWelcome(user), [user]);", "Command Center welcome should resolve from current user data without extra loading calls.");
has(dashboardPage, "resolveCommandCenterWelcome", "Command Center welcome resolver is missing.");
has(dashboardPage, "user?.employee_full_name", "Welcome resolver must prefer linked employee full name.");
has(dashboardPage, "user?.employee_position_title", "Welcome resolver must prefer linked employee position title.");
has(dashboardPage, "user?.employee_job_title", "Welcome resolver must support linked employee job title.");
has(dashboardPage, "user?.employee_designation", "Welcome resolver must support linked employee designation.");
has(dashboardPage, "user?.employee_role_title", "Welcome resolver must support linked employee role title.");
has(dashboardPage, "formatRoleDisplayName", "Welcome resolver must format account role display names.");
has(dashboardPage, "titleCaseToken", "Welcome resolver must format raw role tokens.");
has(dashboardPage, "emailPrefix", "Welcome resolver must use email prefix only as a late fallback.");
has(dashboardPage, "?? \"User\"", "Welcome resolver must use User as the name fallback.");
has(dashboardPage, "?? \"Team Member\"", "Welcome resolver must use Team Member as the title fallback.");
has(dashboardPage, "undefined|null|\\[object object\\]", "Welcome resolver must reject undefined/null/object text.");
hasNo(dashboardPage, "SUPER_ADMIN", "Welcome display must not hardcode or render raw SUPER_ADMIN role codes.");
has(authTypes, "employee_full_name?: string | null", "Auth user type must include employee full name.");
has(authTypes, "employee_position_title?: string | null", "Auth user type must include employee position title.");
has(userDb, "getLinkedEmployeeDisplayProfile", "Backend auth user payload must load linked employee display profile.");
has(userDb, "LEFT JOIN positions p ON p.id = e.primary_position_id", "Backend auth user payload must load position title.");
has(userDb, "employee_full_name", "Backend auth payload must return employee full name.");
has(userDb, "employee_position_title", "Backend auth payload must return employee position title.");

has(dashboardPage, "PriorityKpiIconStrip", "Priority KPI icon strip must remain present.");
has(dashboardPage, "<PriorityKpiIconStrip actions={priorityActions} />", "Priority KPI icon strip must remain rendered in the header/top container.");
has(dashboardPage, "Tooltip", "Priority KPI hover popup must remain present.");
has(tooltipComponent, "createPortal", "Priority KPI hover popup must continue rendering through the shared tooltip portal.");
has(dashboardPage, "priorityIconToneClass", "Priority KPI glow/zero-state helper must remain present.");
has(dashboardPage, "shadow-[0_0_0_3px", "Pending priority KPI icons must retain glow styling.");
has(dashboardPage, "count <= 0", "Zero/normal priority KPI icons must retain grey zero-state logic.");
has(dashboardPage, "shadow-none", "Zero priority KPI icons must remain non-glowing.");
has(dashboardPage, "to={action.route}", "Priority KPI click navigation must remain present.");
has(dashboardRoute, "priority_actions", "Priority KPI data must still come from the Command Center summary API.");

for (const file of [appShell, dashboardPage, authTypes, userDb, dashboardRoute, tooltipComponent]) {
  hasNo(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, `${file} must not use browser alert/confirm/prompt.`);
  hasNo(file, /dark:/, `${file} must remain light-theme only.`);
}

has("worker/src/auth/password.ts", "PBKDF2_ITERATIONS = 100000", "PBKDF2 iteration count must remain 100000.");
has("worker/wrangler.toml", 'binding = "DB"', "D1 binding name changed or missing.");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed or missing.");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed or missing.");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding name changed or missing.");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed or missing.");

if (failures.length) {
  console.error("Sidebar and Command Center welcome verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Sidebar and Command Center welcome verification passed.");

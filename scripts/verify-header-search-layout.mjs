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
  if (!ok) failures.push(`${file}: ${message}`);
}

function hasNo(file, needle, message) {
  const text = read(file);
  const ok = needle instanceof RegExp ? !needle.test(text) : !text.includes(needle);
  if (!ok) failures.push(`${file}: ${message}`);
}

function before(file, first, second, message) {
  const text = read(file);
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) failures.push(`${file}: ${message}`);
}

function parsePixelWidth(className, breakpoint) {
  const escaped = breakpoint ? `${breakpoint}:w-\\[(\\d+)px\\]` : "(?<!:)w-\\[(\\d+)px\\]";
  const match = className.match(new RegExp(escaped));
  return match ? Number(match[1]) : 0;
}

const appShell = "frontend/src/layouts/AppShell.tsx";
const globalSearch = "frontend/src/components/global/GlobalSearch.tsx";
const notificationBell = "frontend/src/components/global/NotificationBell.tsx";
const searchRoute = "worker/src/routes/search.ts";
const dashboardPage = "frontend/src/pages/DashboardPage.tsx";
const sidebarWelcomeVerifier = "scripts/verify-sidebar-command-center-welcome.mjs";
const commandCenterVerifier = "scripts/verify-command-center-dashboard.mjs";

const globalSearchText = read(globalSearch);
const inputClassMatch = globalSearchText.match(/className="([^"]*w-\[280px\][^"]*)"/);
const inputClasses = inputClassMatch?.[1] ?? "";
const tabletWidth = parsePixelWidth(inputClasses, "");
const desktopWidth = parsePixelWidth(inputClasses, "xl");
const wideDesktopWidth = parsePixelWidth(inputClasses, "2xl");

has(globalSearch, 'className="relative min-w-0"', "Global search wrapper must be constrained to prevent viewport overflow.");
has(globalSearch, 'className="hidden lg:block"', "Expanded global search bar must be visible from tablet/desktop widths.");
has(globalSearch, "h-9", "Search input height must match nearby header controls.");
has(globalSearch, "max-w-[calc(100vw-20rem)]", "Search input must have viewport overflow protection.");
has(globalSearch, "pl-9 pr-16", "Search icon and keyboard hint spacing must remain aligned.");
has(globalSearch, "Ctrl K", "Keyboard search hint must remain present.");
has(globalSearch, "lg:hidden", "Mobile search must collapse to an icon button.");
has(globalSearch, "w-[min(92vw,38rem)]", "Search results popup must remain viewport constrained.");
has(globalSearch, "api.globalSearch", "Global search API behavior must remain intact.");
has(globalSearch, "flattenGroups", "Search component must keep client-side result flattening behavior.");
has(globalSearch, "openResult", "Search result navigation behavior must remain intact.");
has(searchRoute, "getSearchableModuleRegistry", "Disabled-module search filtering must remain in backend search route.");
has(searchRoute, "filterSearchResultsByPermission", "Permission-aware search filtering must remain in backend search route.");
has(searchRoute, "filterSearchResultsByScope", "Scope-aware search filtering must remain in backend search route.");

if (tabletWidth < 280) failures.push(`${globalSearch}: tablet search width must be at least 280px.`);
if (desktopWidth < 420) failures.push(`${globalSearch}: desktop search width must be at least 420px.`);
if (wideDesktopWidth < desktopWidth) failures.push(`${globalSearch}: wide desktop search width must not be smaller than desktop width.`);
if (wideDesktopWidth > 520) failures.push(`${globalSearch}: wide desktop search width must stay within the accepted 520px maximum.`);

has(appShell, "<GlobalSearch />", "AppShell header must render global search.");
has(appShell, "<NotificationBell />", "AppShell header must render notification bell.");
before(appShell, "<GlobalSearch />", "<NotificationBell />", "Global search must sit immediately before the notification badge/bell.");
has(appShell, "flex min-w-0 items-center gap-2", "Header control row must preserve compact alignment.");
has(appShell, "overflow-hidden", "App shell must preserve horizontal overflow control.");
has(notificationBell, 'size="icon"', "Notification bell button must remain icon-sized and aligned with search input height.");
has(notificationBell, "unreadCount", "Notification unread badge behavior must remain present.");
has(notificationBell, "api.listNotifications", "Notification dropdown behavior must remain present.");
has(notificationBell, "navigate(\"/notifications\")", "Notification center navigation must remain present.");

has(sidebarWelcomeVerifier, "openGroup", "Sidebar single-open verifier must remain present.");
has(sidebarWelcomeVerifier, "CommandCenterWelcome", "Command Center welcome regression verifier must remain present.");
has(commandCenterVerifier, "PriorityKpiIconStrip", "Priority KPI verifier coverage must remain present.");
has(dashboardPage, "CommandCenterWelcome", "Command Center welcome component must remain present.");
has(dashboardPage, "PriorityKpiIconStrip", "Priority KPI icons must remain present.");
hasNo(dashboardPage, "OmniCore Command Center", "Old Command Center title must not regress.");
hasNo(dashboardPage, "Enterprise people operations overview with live HR, attendance, payroll, compliance, and workflow indicators.", "Old Command Center description must not regress.");

for (const file of [appShell, globalSearch, notificationBell, searchRoute, dashboardPage]) {
  hasNo(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be introduced.");
  hasNo(file, /dark:/, "dark mode classes must not be introduced.");
}

has("worker/src/auth/password.ts", "PBKDF2_ITERATIONS = 100000", "PBKDF2 iteration count must remain 100000.");
has("worker/wrangler.toml", 'binding = "DB"', "D1 binding name changed or missing.");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed or missing.");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed or missing.");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding name changed or missing.");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed or missing.");

if (failures.length) {
  console.error("Header search layout verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Header search layout verification passed.");

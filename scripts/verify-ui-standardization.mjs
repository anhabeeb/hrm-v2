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
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function requireFile(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: missing required file`);
}

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};

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
  "verify:prompt17",
  "verify:prompt18",
  "verify:prompt19",
  "verify:prompt20",
  "verify:prompt21",
  "verify:prompt22",
  "verify:prompt23",
  "verify:cache-timeout",
  "verify:admin-help",
  "verify:ui-standardization"
].forEach((scriptName) => {
  if (!scripts[scriptName]) failures.push(`package.json: missing ${scriptName}`);
});

[
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/components/employee/EmployeeIdentityCell.tsx",
  "frontend/src/components/ui/page-shell.tsx",
  "frontend/src/components/ui/data-table.tsx",
  "frontend/src/components/ui/data-table-shell.tsx",
  "frontend/src/components/ui/status-badge.tsx",
  "frontend/src/components/ui/dialogs.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "frontend/vite.config.ts",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts"
].forEach(requireFile);

const shell = "frontend/src/layouts/AppShell.tsx";
[
  "h-screen overflow-hidden",
  "overflow-y-auto overflow-x-hidden",
  "SIDEBAR_GROUP_STATE_KEY",
  "activeGroupLabels",
  "ChevronDown",
  "lg:static",
  "Self-Service"
].forEach((marker) => has(shell, marker, `app shell/sidebar marker missing: ${marker}`));

const pageShell = "frontend/src/components/ui/page-shell.tsx";
[
  "PageShell",
  "PageHeader",
  "PageBreadcrumbs",
  "PageActions",
  "SectionCard",
  "SettingsCard",
  "StatCard",
  "SummaryCard",
  "QuickActionCard",
  "TaskListCard",
  "UpcomingActivityCard",
  "RecentActivityCard",
  "RecentTransactionCard",
  "ProfileCard",
  "FormSection",
  "NotificationBanner",
  "AlertBanner",
  "LoadingSkeleton",
  "PermissionDeniedState",
  "ModuleDisabledState",
  "NoSearchResultsState",
  "FilterBar",
  "FilterDrawer",
  "ActionBar",
  "ProgressBar",
  "FormWizard",
  "RepeaterFieldGroup",
  "ComboboxField",
  "InputField",
  "SelectField",
  "TextareaField",
  "CheckboxField",
  "SwitchField",
  "RadioGroupField",
  "FileUploadField",
  "FormFooter",
  "CommandPalette",
  "CommandSearch",
  "TabsShell",
  "AccordionSection",
  "TooltipHelp",
  "DatePickerField",
  "ExportActionBar",
  "DashboardWidget",
  "MobileListCard"
].forEach((marker) => has(pageShell, marker, `shared UI marker missing: ${marker}`));

const employeeIdentityComponent = "frontend/src/components/employee/EmployeeIdentityCell.tsx";
[
  "EmployeeIdentityCell",
  "AvatarWithFallback",
  "EmployeeProfileCard",
  "UserProfileCard",
  "ProfileMetaRow",
  "EmployeeAvatar",
  "rounded-full",
  "profilePhotoUrl",
  "showMetadata",
  "showStatus"
].forEach((marker) => has(employeeIdentityComponent, marker, `employee identity component marker missing: ${marker}`));

has("frontend/src/components/ui/data-table-shell.tsx", "DataTableShell", "DataTableShell missing");
has("frontend/src/components/ui/data-table-shell.tsx", "ResponsiveTableWrapper", "ResponsiveTableWrapper missing");
has("frontend/src/components/ui/dialogs.tsx", "DetailDrawer", "DetailDrawer missing");
has("frontend/src/components/ui/dialogs.tsx", "ConfirmDialog", "ConfirmDialog missing");
has("frontend/src/components/ui/dialogs.tsx", "requireReason", "ConfirmDialog reason support missing");

[
  "ACTIVE",
  "INACTIVE",
  "DRAFT",
  "PENDING",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "SENT_BACK",
  "CANCELLED",
  "COMPLETED",
  "FINALIZED",
  "LOCKED",
  "ARCHIVED",
  "OVERDUE",
  "WARNING",
  "CRITICAL",
  "SUCCESS",
  "ERROR",
  "DISABLED",
  "EXPIRED",
  "EXPIRING_SOON",
  "READY",
  "BLOCKED",
  "CLEARED",
  "WAIVED",
  "FAILED",
  "SYNCED",
  "OFFLINE",
  "IMPORTED",
  "PROCESSED",
  "PARTIAL"
].forEach((status) => has("frontend/src/components/ui/status-badge.tsx", status, `StatusBadge status missing: ${status}`));

[
  ["frontend/src/pages/EmployeeProfilePage.tsx", ["EmployeeProfileCard", "ResponsiveTabs", "EmployeeAvatar", "EmployeeProfilePhotoControls"]],
  ["frontend/src/pages/PayrollRunsPage.tsx", ["PageHeader", "FilterBar", "DataTableShell", "ConfirmDialog", "StatusBadge"]],
  ["frontend/src/pages/FinalSettlementPage.tsx", ["Exit Payroll", "Final Settlement", "Payment"]],
  ["frontend/src/pages/LifecyclePage.tsx", ["Onboarding", "Offboarding", "Task", "Timeline"]],
  ["frontend/src/pages/AttendanceDeviceOperationsPage.tsx", ["ZKTeco", "Import", "unmatched"]],
  ["frontend/src/pages/ReportsPage.tsx", ["ExportActionBar", "Report Center", "Export History", "DataTableFrame"]],
  ["frontend/src/pages/AdminSettingsPage.tsx", ["Admin Settings", "Production Controls", "Cache & Sync", "Permission Risks"]],
  ["frontend/src/pages/SelfServicePage.tsx", ["Self-Service", "Quick", "MobileListCard"]]
].forEach(([file, markers]) => markers.forEach((marker) => has(file, marker, `${marker} modernization marker missing`)));

[
  ["frontend/src/pages/EmployeesPage.tsx", ["EmployeeIdentityCell", "sticky left-0", "employee={employee}", "token={token}", "DataTableShell", "PageShell", "PageHeader"]],
  ["frontend/src/pages/EmployeeProfilePage.tsx", ["EmployeeProfileCard", "EmployeeProfilePhotoControls", "PageShell"]],
  ["frontend/src/pages/PayrollRunDetailPage.tsx", ["EmployeeIdentityCell", "sticky left-0", "payroll result"]],
  ["frontend/src/pages/PayrollPrompt11Pages.tsx", ["EmployeeIdentityCell", "Payslips", "Payment Register", "Payroll History"]],
  ["frontend/src/pages/PayrollAdminPages.tsx", ["EmployeeIdentityCell", "Payroll Advances", "Payroll Deductions", "Payroll Adjustments"]],
  ["frontend/src/pages/PayrollFoundationPages.tsx", ["EmployeeIdentityCell", "__employee", "employee_name_snapshot"]],
  ["frontend/src/pages/AttendanceRecordsPage.tsx", ["EmployeeIdentityCell", "Attendance Records"]],
  ["frontend/src/pages/AttendanceCalendarPage.tsx", ["EmployeeIdentityCell", "Attendance Calendar"]],
  ["frontend/src/pages/AttendanceCorrectionsPage.tsx", ["EmployeeIdentityCell", "Attendance Corrections"]],
  ["frontend/src/pages/RosterWeeklyPage.tsx", ["EmployeeIdentityCell", "Weekly Roster"]],
  ["frontend/src/pages/LeaveRequestsPage.tsx", ["EmployeeIdentityCell", "Leave Requests"]],
  ["frontend/src/pages/LeaveCalendarPage.tsx", ["EmployeeIdentityCell", "Leave Calendar"]],
  ["frontend/src/pages/FinalSettlementPage.tsx", ["EmployeeIdentityCell", "Final Settlement"]],
  ["frontend/src/pages/LifecyclePage.tsx", ["EmployeeIdentityCell", "Onboarding", "Offboarding"]],
  ["frontend/src/pages/AssetAssignmentsPage.tsx", ["EmployeeIdentityCell", "Asset Assignments"]],
  ["frontend/src/pages/AssetUniformAdvancedPages.tsx", ["EmployeeIdentityCell", "Uniform"]],
  ["frontend/src/pages/DocumentRegistryPage.tsx", ["EmployeeIdentityCell", "Document Registry"]],
  ["frontend/src/pages/DocumentCompliancePage.tsx", ["EmployeeIdentityCell", "Document Expiry & Compliance"]],
  ["frontend/src/pages/SelfServicePage.tsx", ["EmployeeIdentityCell", "Self-Service"]]
].forEach(([file, markers]) => markers.forEach((marker) => has(file, marker, `${marker} employee identity adoption marker missing`)));

[
  ["frontend/src/pages/EmployeesPage.tsx", ["PageShell", "PageHeader", "FilterBar", "DataTableShell"]],
  ["frontend/src/pages/PayrollRunsPage.tsx", ["PageShell", "PageHeader", "FilterBar", "DataTableShell"]],
  ["frontend/src/pages/ReportsPage.tsx", ["PageShell", "PageHeader", "ExportActionBar"]],
  ["frontend/src/pages/EmployeeProfilePage.tsx", ["PageShell", "ResponsiveTabs"]],
  ["frontend/src/pages/AdminSettingsPage.tsx", ["Admin Settings", "Production Controls"]],
  ["frontend/src/pages/FinalSettlementPage.tsx", ["Exit Payroll", "Final Settlement"]],
  ["frontend/src/pages/LifecyclePage.tsx", ["Onboarding", "Offboarding"]]
].forEach(([file, markers]) => markers.forEach((marker) => has(file, marker, `${marker} page/component adoption marker missing`)));

has("frontend/vite.config.ts", "manualChunks", "Prompt 13 manual chunk optimization missing");
has("frontend/vite.config.ts", "react-vendor", "react-vendor chunk missing");
has("frontend/vite.config.ts", "lucide-react", "ui-vendor chunk missing");

has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "const ITERATIONS = 100000", "PBKDF2 iterations must remain 100000");

const frontendFiles = [];
function collectFiles(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(rel);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) frontendFiles.push(rel.replace(/\\/g, "/"));
  }
}
collectFiles("frontend/src");

const browserPromptPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
const darkModePattern = /\bdark:|darkMode\b/;
const proprietaryPattern = /tailwindui|tailwind\s+admin\s+license|tailwind-admin-template|proprietary template/i;

frontendFiles.forEach((file) => {
  hasNo(file, browserPromptPattern, "browser alert/confirm/prompt usage is not allowed");
  hasNo(file, darkModePattern, "dark mode marker is not allowed");
  hasNo(file, proprietaryPattern, "proprietary Tailwind Admin template marker is not allowed");
});

const priorityUiPages = [
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/LeaveSettingsPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/RosterSettingsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/DataTransferPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetsItemsPage.tsx",
  "frontend/src/pages/AssetSettingsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx"
];

const rawControlExceptions = [];

function rawControlExceptionReason(file, control, lineText) {
  if (file.startsWith("frontend/src/components/ui/")) return "shared UI primitive owns native markup";
  if (control === "input" && /\btype=["']hidden["']/.test(lineText)) return "hidden input has no visible UI";
  return null;
}

function checkRawControls(file) {
  if (!exists(file)) return;
  const content = read(file);
  const lines = content.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    const matches = lineText.matchAll(/<(select|input|button|textarea|table)\b/g);
    for (const match of matches) {
      const control = match[1];
      const reason = rawControlExceptionReason(file, control, lineText);
      if (reason) {
        rawControlExceptions.push(`${file}:${index + 1}: <${control}> allowed because ${reason}`);
      } else {
        failures.push(`${file}:${index + 1}: raw <${control}> usage remains; use shared UI primitives such as Button, InputField, SelectField, TextareaField, CheckboxField, FileUploadField, DataTableShell, ResponsiveTableWrapper, or Table`);
      }
    }
  });
}

frontendFiles
  .filter((file) => file.startsWith("frontend/src/pages/") || file.startsWith("frontend/src/layouts/") || (file.startsWith("frontend/src/components/") && !file.startsWith("frontend/src/components/ui/")))
  .forEach(checkRawControls);

if (rawControlExceptions.length > 3) {
  failures.push("scripts/verify-ui-standardization.mjs: raw-control exception list is too broad");
}

if (rawControlExceptions.length) {
  console.log("UI standardization raw-control exceptions:");
  rawControlExceptions.forEach((exception) => console.log(`- ${exception}`));
}

if (failures.length) {
  console.error("UI standardization verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI standardization verification passed.");

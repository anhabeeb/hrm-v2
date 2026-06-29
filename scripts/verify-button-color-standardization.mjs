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

function listFiles(dir, extensions) {
  const absoluteDir = path.join(root, dir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((entry) => extensions.some((extension) => entry.endsWith(extension)))
    .map((entry) => `${dir}/${entry}`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function has(file, marker, message) {
  const content = read(file);
  assert(marker instanceof RegExp ? marker.test(content) : content.includes(marker), `${file}: ${message}`);
}

function scanFiles(files) {
  return files.map((file) => ({ file, content: read(file), lines: read(file).split(/\r?\n/) }));
}

const pkg = JSON.parse(read("package.json"));
assert(Boolean(pkg.scripts?.["verify:button-color-standardization"]), "package.json: missing verify:button-color-standardization script.");
[
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
].forEach((script) => assert(Boolean(pkg.scripts?.[script]), `package.json: missing ${script} regression script.`));

assert(exists("frontend/src/components/ui/button.tsx"), "frontend/src/components/ui/button.tsx is missing.");
assert(exists("frontend/src/components/ui/action-button.tsx"), "frontend/src/components/ui/action-button.tsx is missing.");
assert(exists("frontend/src/components/ui/row-action-button.tsx"), "frontend/src/components/ui/row-action-button.tsx is missing.");

[
  "actionCreate",
  "actionSave",
  "actionNeutral",
  "actionExport",
  "actionImport",
  "actionWarning",
  "actionDestructive",
  "actionDisabled"
].forEach((variant) => {
  has("frontend/src/components/ui/button.tsx", variant, `Button variant ${variant} is missing.`);
  has("frontend/src/components/ui/action-button.tsx", variant, `ActionButton mapping for ${variant} is missing.`);
});

[
  "rowActionNeutral",
  "rowActionView",
  "rowActionEdit",
  "rowActionCreate",
  "rowActionSave",
  "rowActionWarning",
  "rowActionDestructive",
  "rowActionExport",
  "rowActionImport",
  "rowActionDisabled"
].forEach((variant) => {
  has("frontend/src/components/ui/button.tsx", variant, `Row action variant ${variant} is missing.`);
});

const buttonSource = read("frontend/src/components/ui/button.tsx");
const actionButtonSource = read("frontend/src/components/ui/action-button.tsx");
has("frontend/src/components/ui/button.tsx", "export type RowActionIntent", "RowActionIntent type is missing.");
has("frontend/src/components/ui/button.tsx", "ROW_ACTION_VARIANT_BY_INTENT", "Row action intent mapping is missing.");
has("frontend/src/components/ui/button.tsx", "export function RowActionButton", "RowActionButton component is missing.");
has("frontend/src/components/ui/button.tsx", "export const ActionIconButton = RowActionButton", "ActionIconButton alias is missing.");
has("frontend/src/components/ui/row-action-button.tsx", "RowActionButton", "Row action re-export file is missing RowActionButton.");
has("frontend/src/components/ui/row-action-button.tsx", "ActionIconButton", "Row action re-export file is missing ActionIconButton.");
has("frontend/src/components/ui/action-button.tsx", "export function ActionTextButton", "ActionTextButton component is missing.");
has("frontend/src/components/ui/action-button.tsx", "ACTION_TEXT_INTENT_TO_BUTTON_INTENT", "ActionTextButton intent mapping is missing.");
["submit", "approve", "finalize", "send-back", "waive", "block", "manual-adjustment", "cancel-record", "upload", "import"].forEach((intent) => {
  assert(actionButtonSource.includes(intent), `ActionTextButton intent ${intent} is missing.`);
});
assert(actionButtonSource.includes('"submit": "save"') || actionButtonSource.includes("submit: \"save\""), "Submit text actions must map to green/save.");
assert(actionButtonSource.includes('"send-back": "warning"'), "Send back text actions must map to amber/warning.");
assert(actionButtonSource.includes('"manual-adjustment": "warning"'), "Manual adjustment text actions must map to amber/warning.");
assert(actionButtonSource.includes('"cancel-record": "destructive"'), "Cancel-record text actions must map to red/destructive.");
assert(actionButtonSource.includes('upload: "import"') && actionButtonSource.includes('import: "import"'), "Upload/import text actions must map to blue/import.");

[
  "view",
  "edit",
  "create",
  "save",
  "approve",
  "complete",
  "enable",
  "disable",
  "delete",
  "reject",
  "archive",
  "restore",
  "warning",
  "hold",
  "release",
  "download",
  "upload",
  "import",
  "export",
  "refresh",
  "calculate",
  "generate",
  "neutral"
].forEach((intent) => assert(buttonSource.includes(`| "${intent}"`) || buttonSource.includes(`${intent}:`), `RowActionButton intent ${intent} is missing.`));

[
  ["approve/confirm/complete row actions", "approve: \"rowActionSave\""],
  ["enable row actions", "enable: \"rowActionSave\""],
  ["release row actions", "release: \"rowActionSave\""],
  ["reject row actions", "reject: \"rowActionDestructive\""],
  ["delete row actions", "delete: \"rowActionDestructive\""],
  ["disable row actions", "disable: \"rowActionDestructive\""],
  ["archive row actions", "archive: \"rowActionDestructive\""],
  ["hold row actions", "hold: \"rowActionWarning\""],
  ["restore row actions", "restore: \"rowActionWarning\""],
  ["download/export row actions", "download: \"rowActionExport\""],
  ["upload/import row actions", "upload: \"rowActionImport\""],
  ["view/open/detail row actions", "view: \"rowActionView\""],
  ["edit row actions", "edit: \"rowActionEdit\""],
  ["generate/create row actions", "generate: \"rowActionCreate\""]
].forEach(([label, marker]) => assert(buttonSource.includes(marker), `RowActionButton mapping missing ${label}.`));

[
  ["create/add/new/issue actions", /create\|add\|new\|link\|start\|issue/],
  ["save/confirm/activate/approve/complete/return actions", /save\|confirm\|activate\|approve\|complete\|finalize\|return/],
  ["neutral refresh/settings/view/open actions", /refresh\|settings\|view\|open\|details\|more\|filter\|reset/],
  ["export/download actions", /export\|download/],
  ["import/upload actions", /import\|upload/],
  ["warning/send back/hold/reopen actions", /send back\|hold\|put on hold\|reopen\|needs review/],
  ["destructive delete/reject/disable/archive actions", /delete\|reject\|disable\|archive\|remove/]
].forEach(([label, pattern]) => has("frontend/src/components/ui/button.tsx", pattern, `Button intent inference is missing ${label}.`));

has("frontend/src/components/ui/button.tsx", "bg-primary text-primary-foreground", "Create/Add/New teal primary styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-emerald-600 text-white", "Save/Confirm/Approve green styling missing.");
has("frontend/src/components/ui/button.tsx", "border border-slate-300 bg-white text-slate-700", "Neutral outline styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-sky-600 text-white", "Export/Import blue styling missing.");
has("frontend/src/components/ui/button.tsx", "border border-amber-300 bg-amber-100 text-amber-900", "Warning amber styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-destructive text-destructive-foreground", "Destructive red styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-slate-100 text-slate-400", "Disabled grey styling missing.");
has("frontend/src/components/ui/button.tsx", "gap-2", "Consistent icon spacing missing from Button.");
has("frontend/src/components/ui/button.tsx", "h-8 px-3 text-xs", "Small button height marker missing.");
has("frontend/src/components/ui/button.tsx", "h-9 px-4 text-sm", "Default button height marker missing.");

has("frontend/src/components/ui/button.tsx", "EXACT_NEUTRAL_ACTION_LABELS", "Exact neutral action set missing.");
["cancel", "close", "dismiss", "back", "clear", "reset"].forEach((label) => {
  assert(buttonSource.includes(`"${label}"`), `Button exact-neutral mapping missing ${label}.`);
});
has("frontend/src/components/ui/button.tsx", "DESTRUCTIVE_CANCEL_ACTION_PATTERN", "Destructive cancel phrase pattern missing.");
["cancel\\s+", "leave", "payroll", "contract", "request", "row"].forEach((marker) => {
  assert(buttonSource.includes(marker), `Button destructive cancel pattern missing ${marker}.`);
});
assert(buttonSource.indexOf("EXACT_NEUTRAL_ACTION_LABELS.has(text)") < buttonSource.lastIndexOf('return "actionCreate";'), "Exact Cancel/Close/Dismiss must be checked before actionCreate fallback.");

const saveRule = buttonSource.match(/save\|confirm\|activate\|approve\|complete\|finalize[^\n]+/)?.[0] ?? "";
assert(saveRule.includes("return"), "Return actions must remain in green/save mapping.");
assert(!saveRule.includes("issue"), "Issue must not be listed in the save/green mapping.");
const createRule = buttonSource.match(/create\|add\|new\|link\|start[^\n]+/)?.[0] ?? "";
assert(createRule.includes("issue"), "Issue must be listed in create/teal mapping.");

has("frontend/src/components/ui/button.tsx", "ICON_ACTION_LABELS", "Icon-only action label mapping missing from Button.");
has("frontend/src/components/ui/button.tsx", "effectiveAriaLabel", "Icon-only Button aria-label fallback missing.");
has("frontend/src/components/ui/button.tsx", "size === \"icon\"", "Icon-only Button fallback must be size-aware.");
has("frontend/src/components/ui/button.tsx", "title ?? (size === \"icon\" ? effectiveAriaLabel", "Icon-only Button title fallback missing.");
has("frontend/src/components/ui/button.tsx", "title: string", "RowActionButton title must be required.");

const sourceFiles = [
  ...listFiles("frontend/src/pages", [".tsx"]),
  ...listFiles("frontend/src/components", [".tsx"])
];
const scanned = scanFiles(sourceFiles);
const combinedSources = scanned.map(({ content }) => content).join("\n");

const rowActionTags = [...combinedSources.matchAll(/<RowActionButton\b[\s\S]*?>/g)].map((match) => match[0]);
assert(rowActionTags.length > 20, "Expected real RowActionButton usage across table/list action columns.");
rowActionTags.forEach((tag, index) => {
  assert(/\btitle=/.test(tag) || /\baria-label=/.test(tag), `RowActionButton #${index + 1} is missing title/aria-label.`);
});

[
  ["green approve/confirm actions", /<RowActionButton\b[^>]*intent="(approve|complete|enable|release)"[^>]*title="[^"]*(Approve|Confirm|Complete|Enable|Return|Release|Verify|Activate|Submit)/i],
  ["red reject/delete/disable/archive/cancel actions", /<RowActionButton\b[^>]*intent="(reject|delete|disable|archive)"[^>]*title="[^"]*(Reject|Delete|Disable|Archive|Cancel|Remove|Soft delete|Permanent delete|Write off|Detach)/i],
  ["amber hold/reopen/restore actions", /<RowActionButton\b[^>]*intent="(hold|warning|restore)"[^>]*title="[^"]*(Hold|Pause|Reopen|Restore|Unlock|Damage|Lost|Waive|Mark bank notified|Block)/i],
  ["blue download/export/import/upload actions", /<RowActionButton\b[^>]*intent="(download|export|upload|import)"[^>]*title="[^"]*(Download|Export|Upload|Import|Replace|Files|Attachments|Version)/i],
  ["neutral view/open/detail actions", /<RowActionButton\b[^>]*intent="view"[^>]*title="[^"]*(View|Open|Details|Preview|History|Events|Versions)/i],
  ["teal edit actions", /<RowActionButton\b[^>]*intent="edit"[^>]*title="[^"]*Edit/i],
  ["teal generate/create actions", /<RowActionButton\b[^>]*intent="(create|generate)"[^>]*title="[^"]*(Generate|Assign|Issue|Add|Deduct|Attachments)/i]
].forEach(([label, pattern]) => assert(pattern.test(combinedSources), `Missing ${label} in real row-action usage.`));

const finalSettlementSource = read("frontend/src/pages/FinalSettlementPage.tsx");
[
  ["Submit", '<ActionTextButton intent="submit"'],
  ["Approve", '<ActionTextButton intent="approve"'],
  ["Reject", '<ActionTextButton intent="reject"'],
  ["Send back", '<ActionTextButton intent="send-back"'],
  ["Finalize", '<ActionTextButton intent="finalize"'],
  ["Manual adjustment", '<ActionTextButton intent="manual-adjustment"'],
  ["Prepare payment row", '<ActionTextButton intent="create" size="sm" onClick={() => onAction("payment")}'],
  ["Clear clearance", '<ActionTextButton intent="complete" size="sm" onClick={() => onClearance(item, "CLEARED")}'],
  ["Block clearance", '<ActionTextButton intent="block" size="sm" onClick={() => onClearance(item, "BLOCKED")}'],
  ["Waive clearance", '<ActionTextButton intent="waive" size="sm" onClick={() => onWaive(item)}']
].forEach(([label, marker]) => assert(finalSettlementSource.includes(marker), `FinalSettlementPage ${label} action must use ActionTextButton with standardized intent.`));
[
  'variant="outline" onClick={() => onAction("submit")}',
  'variant="outline" onClick={() => onAction("approve")}',
  'variant="outline" onClick={() => onAction("reject")}',
  'variant="outline" onClick={() => onAction("send-back")}',
  'variant="outline" onClick={() => onAction("finalize")}',
  'variant="outline" onClick={() => onAction("adjustment")}',
  'variant="outline" onClick={() => onAction("payment")}',
  'variant="outline" onClick={() => onClearance(item, "CLEARED")}',
  'variant="outline" onClick={() => onClearance(item, "BLOCKED")}',
  'variant="outline" onClick={() => onWaive(item)}'
].forEach((marker) => assert(!finalSettlementSource.includes(marker), `FinalSettlementPage workflow action still uses raw outline Button: ${marker}`));

const documentComplianceSource = read("frontend/src/pages/DocumentCompliancePage.tsx");
assert(/title="Cancel renewal case"[\s\S]*intent="delete"|intent="delete"[\s\S]*title="Cancel renewal case"/.test(documentComplianceSource), "DocumentCompliancePage cancel renewal case must be a red/destructive row action.");
assert(/title="Cancel waiver"[\s\S]*intent="delete"|intent="delete"[\s\S]*title="Cancel waiver"/.test(documentComplianceSource), "DocumentCompliancePage cancel waiver must be a red/destructive row action.");
assert(!/<Button\b[^>]*variant="ghost"[^>]*size="sm"[^>]*>Cancel<\/Button>/.test(documentComplianceSource), "DocumentCompliancePage text row Cancel actions must not use raw ghost Button.");

const attendanceRecordsSource = read("frontend/src/pages/AttendanceRecordsPage.tsx");
[
  ["Manual log", '<ActionTextButton intent="create" size="sm" onClick={() => setEditingLog(null)}'],
  ["Import raw logs", '<ActionTextButton intent="import" size="sm" onClick={() => setRawImportOpen(true)}'],
  ["Request correction", '<ActionTextButton intent="create" size="sm" onClick={() => setCorrectionOpen(true)}'],
  ["Manual record", '<ActionTextButton intent="create" size="sm" onClick={() => setEditing(null)}'],
  ["Import logs", '<ActionTextButton intent="import" onClick={() => void importRawLogs()}']
].forEach(([label, marker]) => assert(attendanceRecordsSource.includes(marker), `AttendanceRecordsPage ${label} button must use ActionTextButton.`));

const attendanceDeviceOperationsSource = read("frontend/src/pages/AttendanceDeviceOperationsPage.tsx");
[
  ["Save settings", '<ActionTextButton intent="save" disabled={!canManage || !moduleEnabled}'],
  ["Add mapping", '<ActionTextButton intent="create" size="sm" onClick={() => setEditing(null)}'],
  ["Upload CSV", '<ActionTextButton intent="import" type="submit"'],
  ["Resolve unmatched row", '<RowActionButton intent="save" size="sm" title="Resolve unmatched log"'],
  ["Resolve import error row", '<RowActionButton intent="save" size="sm" title="Resolve import error"'],
  ["Resolve locked-day warning row", '<RowActionButton intent="save" size="sm" title="Resolve locked-day warning"'],
  ["Add placeholder", '<ActionTextButton intent="create" size="sm" onClick={() => setCreating(true)}'],
  ["Test vendor integration", '<RowActionButton intent="neutral" size="sm" title="Test vendor integration"'],
  ["Device report export", '<ActionTextButton intent="export" size="sm" onClick={() => void exportCsv()}'],
  ["Save mapping", '<ActionTextButton intent="save" type="submit">Save mapping</ActionTextButton>'],
  ["Resolve modal", '<ActionTextButton intent="complete" type="submit">Resolve</ActionTextButton>'],
  ["Save placeholder", '<ActionTextButton intent="save" type="submit">Save placeholder</ActionTextButton>']
].forEach(([label, marker]) => assert(attendanceDeviceOperationsSource.includes(marker), `AttendanceDeviceOperationsPage ${label} action must use a standardized action component.`));
[
  'variant="outline" onClick={() => setSelected(row)}>Resolve',
  'variant="outline" onClick={() => void api.resolveAttendanceImportError',
  'variant="outline" onClick={() => void api.resolveAttendanceLockedDayWarning',
  'variant="outline" onClick={() => void api.testAttendanceVendorIntegration',
  '<Button type="submit">Save mapping</Button>',
  '<Button type="submit">Resolve</Button>',
  '<Button type="submit">Save placeholder</Button>'
].forEach((marker) => assert(!attendanceDeviceOperationsSource.includes(marker), `AttendanceDeviceOperationsPage still has generic action Button: ${marker}`));

const lifecycleSource = read("frontend/src/pages/LifecyclePage.tsx");
[
  ["Page refresh", '<ActionTextButton intent="refresh" size="sm" onClick={() => void load()}'],
  ["Create lifecycle case", '<ActionTextButton intent="create" size="sm" onClick={onCreate}>Create {kind} case</ActionTextButton>'],
  ["Export CSV", '<ActionTextButton intent="export" size="sm" onClick={onExport}>'],
  ["Submit activation", '<ActionTextButton intent="submit" size="sm" onClick={() => void run(() => api.submitOnboardingActivation'],
  ["Approve activation", '<ActionTextButton intent="approve" size="sm" onClick={() => void run(() => api.approveOnboardingActivation'],
  ["Submit finalization", '<ActionTextButton intent="submit" size="sm" onClick={() => void run(() => api.submitOffboardingFinalization'],
  ["Approve finalization", '<ActionTextButton intent="approve" size="sm" onClick={() => void run(() => api.approveOffboardingFinalization'],
  ["Complete task", '<ActionTextButton intent="complete" size="sm" onClick={() => void run(() => kind === "onboarding" ? api.completeOnboardingTask'],
  ["Waive task", '<ActionTextButton intent="waive" size="sm" onClick={() => askReason("Waive task"'],
  ["Workspace submit activation", '<ActionTextButton intent="submit" size="sm" onClick={() => void runWorkspaceAction(() => api.completeOnboardingWorkspace'],
  ["Workspace approve activation", '<ActionTextButton intent="approve" size="sm" onClick={() => void runWorkspaceAction(() => api.approveOnboardingActivation'],
  ["Reason confirm", '<ActionTextButton intent="confirm" type="submit">Confirm</ActionTextButton>']
].forEach(([label, marker]) => assert(lifecycleSource.includes(marker), `LifecyclePage ${label} action must use ActionTextButton.`));
[
  'variant="outline" onClick={() => void run(() => api.submitOnboardingActivation',
  'variant="outline" onClick={() => void run(() => api.approveOnboardingActivation',
  'variant="outline" onClick={() => void run(() => api.submitOffboardingFinalization',
  'variant="outline" onClick={() => void run(() => api.approveOffboardingFinalization',
  'variant="outline" onClick={() => void run(() => kind === "onboarding" ? api.completeOnboardingTask',
  'variant="outline" onClick={() => askReason("Waive task"',
  'variant="outline" size="sm" onClick={onExport}><FileDown',
  'variant="outline" onClick={() => void runWorkspaceAction(() => api.completeOnboardingWorkspace',
  'variant="outline" onClick={() => void runWorkspaceAction(() => api.approveOnboardingActivation'
].forEach((marker) => assert(!lifecycleSource.includes(marker), `LifecyclePage still has generic workflow/export Button: ${marker}`));

const employeeAuditPanelSource = read("frontend/src/components/audit/EmployeeAuditPanel.tsx");
assert(employeeAuditPanelSource.includes('<ActionTextButton intent="export" size="sm" onClick={() => void exportCsv()}'), "EmployeeAuditPanel export must use ActionTextButton export intent.");
assert(!employeeAuditPanelSource.includes('variant="outline" size="sm" onClick={() => void exportCsv()}'), "EmployeeAuditPanel export still uses generic outline Button.");

const contractsSource = read("frontend/src/pages/ContractsPage.tsx");
[
  ["Submit contract", '<ActionTextButton intent="submit" size="sm" onClick={() => onAction({ row, action: "submit-for-approval"'],
  ["Approve contract", '<ActionTextButton intent="approve" size="sm" onClick={() => onAction({ row, action: "approve"'],
  ["Activate contract", '<ActionTextButton intent="confirm" size="sm" onClick={() => onAction({ row, action: "activate"']
].forEach(([label, marker]) => assert(contractsSource.includes(marker), `ContractsPage ${label} action must use ActionTextButton.`));

const auditLogPageSource = read("frontend/src/pages/AuditLogPage.tsx");
assert(auditLogPageSource.includes("ExportMenu"), "AuditLogPage export must use the shared ExportMenu.");

const reportsPageSource = read("frontend/src/pages/ReportsPage.tsx");
assert(reportsPageSource.includes("ExportMenu"), "ReportsPage export must use the shared ExportMenu.");
assert(!/disabledExport\("(Excel|PDF)"\)/.test(reportsPageSource), "ReportsPage must not keep fake Excel/PDF placeholder export actions.");

const exportMenuSource = read("frontend/src/components/export/ExportMenu.tsx");
[
  ["menu trigger", '<ActionTextButton intent="export" size="sm" onClick={() => setOpen((value) => !value)}'],
  ["CSV export", 'onClick={() => void run("csv")}'],
  ["Excel export", 'onClick={() => void run("xlsx")}'],
  ["PDF export", 'onClick={() => void run("pdf")}']
].forEach(([label, marker]) => assert(exportMenuSource.includes(marker), `ExportMenu ${label} must use ActionTextButton export intent.`));
assert((exportMenuSource.match(/<ActionTextButton intent="export"/g) ?? []).length >= 4, "ExportMenu must color trigger, CSV, Excel, and PDF actions with export intent.");

[
  "frontend/src/components/assets/EmployeeAssetsPanel.tsx",
  "frontend/src/components/employee/EmployeeDocumentsPanel.tsx",
  "frontend/src/components/leave/EmployeeLeavePanel.tsx",
  "frontend/src/components/payroll/EmployeePayrollPanel.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx"
].forEach((file) => {
  has(file, "ActionTextButton", "Meaningful text action buttons must use ActionTextButton.");
});

const meaningfulActionWords = /\b(approve|confirm|complete|reject|delete|disable|archive|cancel|hold|release|restore|download|upload|import|export|edit|view|open|history|detach|mark bank notified|pause|resume|soft delete|permanent delete|generate|calculate|recalculate)\b/i;
const rawButtonPattern = /<Button\b[^>\n]*(?:variant="(?:ghost|outline)"[^>\n]*size="(?:icon|sm)"|size="(?:icon|sm)"[^>\n]*variant="(?:ghost|outline)")/;
const rowContextPattern = /\b(TableCell|rows\.map|actions=\{\(?row|<DataTable|<RowsTable)/;
const allowedChromePattern = /\b(Close|onClose|Previous month|Next month|Search|Notifications|Open navigation|sidebar|dialog|modal|Filter|Apply filters|Refresh diagnostics)\b/i;
const modalChromePattern = /\b(fixed inset|onClose|set[A-Z][A-Za-z0-9]*\(null\)|set[A-Z][A-Za-z0-9]*\(false\))|>\s*(Cancel|Close)\s*<\/Button>/;

scanned.forEach(({ file, lines }) => {
  const normalizedFile = file.replaceAll("\\", "/");
  if (normalizedFile.includes("/components/ui/") || normalizedFile.includes("/components/filters/") || normalizedFile.includes("/components/global/")) return;
  lines.forEach((line, index) => {
    if (!rawButtonPattern.test(line)) return;
    const context = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 5)).join(" ");
    const rowLikeLine = rowContextPattern.test(line);
    const rowLikeContext = rowContextPattern.test(context) && /\b(actions=\{\(?row|rows\.map)/.test(context);
    if (modalChromePattern.test(line)) return;
    if (allowedChromePattern.test(line) && !rowLikeLine && !rowLikeContext) return;
    if (meaningfulActionWords.test(line) && (rowLikeLine || rowLikeContext)) {
      failures.push(`${file}:${index + 1}: meaningful row/list action still uses raw ghost/outline Button instead of RowActionButton.`);
    }
  });
});

const meaningfulTextActionPattern = /\b(resolve|approve|submit|complete|finalize|export|import|upload|download|test|hold|send back|reject|delete)\b/i;
const specificMeaningfulTextPattern = /\b(save mapping|save placeholder|submit activation|approve activation|submit finalization|approve finalization|complete task|export csv)\b/i;
const allowedRawActionPattern = /^\s*(cancel|close|dismiss|back|clear|reset|view|open|details|filter|apply|run|refresh|cancel edit)\s*$/i;

scanned.forEach(({ file, content }) => {
  const normalizedFile = file.replaceAll("\\", "/");
  if (normalizedFile.includes("/components/ui/") || normalizedFile.includes("/components/filters/") || normalizedFile.includes("/components/global/")) return;
  const buttonBlocks = content.match(/<Button\b[\s\S]*?<\/Button>/g) ?? [];
  buttonBlocks.forEach((block) => {
    if (!/\bvariant="(?:outline|ghost)"/.test(block)) return;
    const innerText = block
      .replace(/<[^>]+>/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!innerText || allowedRawActionPattern.test(innerText)) return;
    if (meaningfulTextActionPattern.test(innerText) || specificMeaningfulTextPattern.test(innerText)) {
      failures.push(`${file}: meaningful text action "${innerText}" still uses generic outline/ghost Button.`);
    }
  });
});

const frontendSources = listFiles("frontend/src", [".ts", ".tsx"]).map((file) => read(file)).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendSources), "Frontend source must not use browser alert/confirm/prompt.");
assert(!/\bdark:\b|darkMode|setTheme\(["']dark["']\)/.test(frontendSources), "Dark mode markers must not be introduced.");

has("frontend/src/components/filters/index.tsx", "FilterResetButton", "Filter reset component missing.");
has("frontend/src/components/filters/index.tsx", "StandardFilterBar", "Standard filter bar missing.");
has("scripts/verify-frontend-static-assets.mjs", "index-UZP1m5JP.css", "CSS MIME/static asset stale hash guard missing.");
has("scripts/verify-frontend-bundle-integrity.mjs", "react-vendor", "Frontend bundle integrity React chunk guard missing.");
has("scripts/verify-filter-search-date-standardization.mjs", "Filter/search/date standardization", "Filter/search/date verifier missing.");
has("scripts/verify-command-center-dashboard.mjs", "Command Center", "Command Center verifier missing.");

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const workerSources = listFiles("worker/src", [".ts"]).map((file) => read(file)).join("\n");
assert(workerSources.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!workerSources.includes("PBKDF2_ITERATIONS = 210000"), "PBKDF2 iteration regression detected.");

if (failures.length > 0) {
  console.error("Button color standardization verifier failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Button color standardization verification passed.");

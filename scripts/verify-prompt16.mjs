import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    console.error(`Prompt 16 verification failed: missing ${file}`);
    process.exit(1);
  }
  return fs.readFileSync(target, "utf8");
}

function ok(condition, message) {
  if (!condition) {
    console.error(`Prompt 16 verification failed: ${message}`);
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
  "verify:prompt16"
].forEach((script) => ok(Boolean(scripts[script]), `package.json missing ${script}`));

hasAll("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS approval_workflow_settings",
  "CREATE TABLE IF NOT EXISTS approval_workflows",
  "CREATE TABLE IF NOT EXISTS approval_workflow_conditions",
  "CREATE TABLE IF NOT EXISTS approval_workflow_steps",
  "CREATE TABLE IF NOT EXISTS approval_instances",
  "CREATE TABLE IF NOT EXISTS approval_instance_steps",
  "CREATE TABLE IF NOT EXISTS approval_step_assignees",
  "CREATE TABLE IF NOT EXISTS approval_actions",
  "CREATE TABLE IF NOT EXISTS approval_delegation_rules",
  "CREATE TABLE IF NOT EXISTS approval_escalation_rules",
  "CREATE TABLE IF NOT EXISTS approval_notification_templates",
  "fallback_to_module_approval_if_no_workflow",
  "block_self_approval_by_default",
  "SEQUENTIAL",
  "PARALLEL",
  "ANY_ONE",
  "ALL_REQUIRED",
  "STEP_NAMES_ONLY",
  "EMAIL_PLACEHOLDER"
]);

hasAll("database/seed.sql", [
  "approval_workflow_settings_default",
  "approval_tpl_submitted",
  "approval_tpl_overdue",
  "approvals.view",
  "approvals.manage",
  "approvals.workflows.manage",
  "approvals.instances.approve",
  "approvals.instances.reject",
  "approvals.instances.send_back",
  "approvals.delegations.manage",
  "approvals.escalations.manage",
  "approvals.notification_templates.manage",
  "reports.approvals.view",
  "self_service.approvals.view"
]);

hasAll("worker/src/db/permissions.ts", [
  "approvals.view",
  "approvals.settings.manage",
  "approvals.workflows.manage",
  "approvals.instances.approve",
  "approvals.delegations.manage",
  "approvals.notification_templates.manage",
  "reports.approvals.view",
  "self_service.approvals.view"
]);

hasAll("worker/src/routes/approvals.ts", [
  "evaluateApprovalWorkflowConditions",
  "findMatchingApprovalWorkflow",
  "getApprovalConditionContext",
  "validateApprovalWorkflowCondition",
  "resolveApprovalStepApprovers",
  "resolveApproverByType",
  "canUserApproveStep",
  "isSelfApprovalBlocked",
  "getApprovalStepFallbackApprover",
  "createApprovalInstance",
  "submitApprovalInstance",
  "approveApprovalStep",
  "rejectApprovalStep",
  "sendBackApprovalStep",
  "cancelApprovalInstance",
  "completeApprovalInstanceIfReady",
  "getApprovalInstanceForEntity",
  "ensureApprovalInstanceForEntity",
  "getActiveApprovalDelegation",
  "applyApprovalDelegation",
  "canDelegateApprovalToUser",
  "refreshApprovalReminders",
  "refreshApprovalEscalations",
  "calculateApprovalDueAt",
  "calculateApprovalEscalationDueAt",
  "createApprovalEscalationAction",
  "renderApprovalNotificationTemplate",
  "queueApprovalNotification",
  "notifyApprovalSubmitted",
  "notifyApprovalDecision",
  "notifyApprovalEscalated",
  "notifyApprovalOverdue",
  "getApprovalAdapterForModuleAction",
  "createApprovalForModuleEntity",
  "getModuleEntityApprovalSummary",
  "applyApprovalDecisionToModuleEntity",
  "getModuleEntityApprovalPreview",
  "syncModuleApprovalStatusFromInstance",
  "previewApprovalWorkflowForEntity",
  "approvalRoutes",
  "selfServiceApprovalRoutes",
  "approvalReportRoutes"
]);

hasAll("worker/src/index.ts", [
  "approvalRoutes",
  "selfServiceApprovalRoutes",
  "approvalReportRoutes",
  "/api/v1/approvals",
  "/api/v1/self-service",
  "/api/v1/reports"
]);

hasAll("worker/src/routes/reports.ts", [
  "approvals/pending",
  "approvals/overdue",
  "approvals/history",
  "approvals/by-module",
  "approvals/by-department",
  "approvals/by-worksite",
  "approvals/escalations",
  "approvals/delegations",
  "approvals/workflow-usage",
  "approvals/turnaround-time",
  "getApprovalReport"
]);

hasAll("frontend/src/lib/api.ts", [
  "getApprovalSettings",
  "updateApprovalSettings",
  "listApprovalWorkflows",
  "createApprovalWorkflow",
  "updateApprovalWorkflow",
  "createApprovalWorkflowCondition",
  "createApprovalWorkflowStep",
  "listApprovalInbox",
  "approvalInstanceAction",
  "previewApprovalWorkflow",
  "listApprovalDelegations",
  "createApprovalDelegation",
  "refreshApprovalReminders",
  "refreshApprovalEscalations",
  "listApprovalNotificationTemplates",
  "updateApprovalNotificationTemplate",
  "getSelfServiceApprovals"
]);

hasAll("frontend/src/types/approvals.ts", [
  "ApprovalWorkflowSettings",
  "ApprovalWorkflow",
  "ApprovalWorkflowCondition",
  "ApprovalWorkflowStep",
  "ApprovalInstance",
  "ApprovalAction",
  "ApprovalDelegationRule",
  "ApprovalNotificationTemplate",
  "ApprovalPreview"
]);

hasAll("frontend/src/pages/ApprovalsPage.tsx", [
  "Central Approval Workflows",
  "Create a workflow",
  "Approver type",
  "Delegations",
  "Templates",
  "Reports",
  "fallback_to_module_approval_if_no_workflow",
  "Approve",
  "Send back",
  "Reject",
  "Refresh reminders",
  "Refresh reminders"
]);

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "ApprovalsPage",
  "approvals/workflows",
  "approvals/settings",
  "approvals/delegations",
  "approvals/templates",
  "approvals/reports",
  "self-service/approvals"
]);

hasAll("frontend/src/layouts/AppShell.tsx", [
  "Approvals",
  "/approvals",
  "approvals.inbox.view"
]);

for (const file of [
  "frontend/src/pages/ApprovalsPage.tsx"
]) {
  const text = read(file);
  ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} must not use browser alert/confirm/prompt`);
}

const approvalsRoute = read("worker/src/routes/approvals.ts");
ok(!/twilio|whatsapp|sendgrid|smtp|mailgun/i.test(approvalsRoute), "Prompt 16 should not implement external SMS/WhatsApp/email delivery");
ok(approvalsRoute.includes("FALLBACK_SAFE_NO_STATUS_SYNC") || approvalsRoute.includes("syncModuleApprovalStatusFromInstance"), "module adapter fallback marker missing");

const workerWrangler = read("worker/wrangler.toml");
ok(workerWrangler.includes('binding = "DB"'), "D1 DB binding missing");
ok(workerWrangler.includes('database_name = "hrm-v2"'), "D1 database name changed");
ok(workerWrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database id changed");
ok(workerWrangler.includes('binding = "DOCUMENTS_BUCKET"'), "R2 document bucket binding missing");
ok(workerWrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

const authText = read("worker/src/auth/password.ts");
ok(authText.includes("100000"), "PBKDF2 iteration ceiling must remain 100000");
ok(!authText.includes("210000"), "PBKDF2 must not return to 210000");

console.log("Prompt 16 verification passed.");

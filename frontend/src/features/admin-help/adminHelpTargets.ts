export const ADMIN_HELP_PERMISSION_KEYS = ["admin.help.view", "admin.help.manage"] as const;

export const contextualHelpTargets = {
  leave: "leave-configuration",
  payroll: "payroll-configuration",
  pension: "pension",
  bankLoans: "bank-loans",
  zkteco: "zkteco",
  finalSettlement: "final-settlement",
  approvals: "approval-workflow-builder",
  dataImport: "data-import",
  deployment: "deployment-maintenance",
  cacheTimeout: "hybrid-cache-timeout"
} as const;

export const ADMIN_HELP_PERMISSION_KEYS = ["admin.help.view", "admin.help.manage"] as const;

export const contextualHelpTargets = {
  moduleSettings: "module-settings",
  documentRules: "document-compliance",
  paymentMethods: "payment-methods",
  attendance: "attendance-configuration",
  leave: "leave-configuration",
  payroll: "payroll-configuration",
  pension: "pension",
  bankLoans: "bank-loans",
  zkteco: "zkteco",
  finalSettlement: "final-settlement",
  approvals: "approval-workflow-builder",
  onboardingDocuments: "onboarding",
  backgroundJobs: "background-jobs-performance",
  performance: "background-jobs-performance",
  reportsImportExport: "reports-exports",
  dataImport: "data-import",
  deployment: "deployment-maintenance",
  cacheTimeout: "hybrid-cache-timeout"
} as const;

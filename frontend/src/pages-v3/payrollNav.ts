import type { RouteNavItem } from "../components/ui/route-nav-switcher";

export const PAYROLL_NAV_ITEMS: RouteNavItem[] = [
  { key: "dashboard", label: "Dashboard", to: "/v3-preview/payroll", end: true, group: "Overview" },
  { key: "runs", label: "Runs", to: "/v3-preview/payroll/runs", group: "Overview" },
  { key: "periods", label: "Periods", to: "/v3-preview/payroll/periods", group: "Overview" },
  { key: "payslips", label: "Payslips", to: "/v3-preview/payroll/payslips", group: "Pay & deductions" },
  { key: "payment-register", label: "Payment register", to: "/v3-preview/payroll/payment-register", group: "Pay & deductions" },
  { key: "advances", label: "Advances", to: "/v3-preview/payroll/advances", group: "Pay & deductions" },
  { key: "deductions", label: "Deductions", to: "/v3-preview/payroll/deductions", group: "Pay & deductions" },
  { key: "adjustments", label: "Adjustments", to: "/v3-preview/payroll/adjustments", group: "Pay & deductions" },
  { key: "components", label: "Components", to: "/v3-preview/payroll/components", group: "Pay & deductions" },
  { key: "institutions", label: "Institutions", to: "/v3-preview/payroll/institutions", group: "Admin" },
  { key: "bank-loans", label: "Bank loans", to: "/v3-preview/payroll/bank-loans", group: "Pay & deductions" },
  { key: "custom-deductions", label: "Custom deductions", to: "/v3-preview/payroll/custom-deductions", group: "Pay & deductions" },
  { key: "pension", label: "Pension", to: "/v3-preview/payroll/pension", group: "Pay & deductions" },
  { key: "final-settlement", label: "Final settlement", to: "/v3-preview/payroll/final-settlement", group: "Admin" },
  { key: "history", label: "History", to: "/v3-preview/payroll/history", group: "Overview" },
  { key: "reports", label: "Reports", to: "/v3-preview/payroll/reports", group: "Admin" },
  { key: "settings", label: "Settings", to: "/v3-preview/payroll/settings", group: "Admin" }
];

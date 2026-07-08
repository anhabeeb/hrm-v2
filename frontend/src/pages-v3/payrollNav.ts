import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const PAYROLL_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "dashboard", label: "Dashboard", to: "/v3-preview/payroll", end: true },
  { key: "runs", label: "Runs", to: "/v3-preview/payroll/runs" },
  { key: "periods", label: "Periods", to: "/v3-preview/payroll/periods" },
  { key: "payslips", label: "Payslips", to: "/v3-preview/payroll/payslips" },
  { key: "payment-register", label: "Payment register", to: "/v3-preview/payroll/payment-register" },
  { key: "advances", label: "Advances", to: "/v3-preview/payroll/advances" },
  { key: "deductions", label: "Deductions", to: "/v3-preview/payroll/deductions" },
  { key: "adjustments", label: "Adjustments", to: "/v3-preview/payroll/adjustments" },
  { key: "components", label: "Components", to: "/v3-preview/payroll/components" },
  { key: "institutions", label: "Institutions", to: "/v3-preview/payroll/institutions" },
  { key: "bank-loans", label: "Bank loans", to: "/v3-preview/payroll/bank-loans" },
  { key: "custom-deductions", label: "Custom deductions", to: "/v3-preview/payroll/custom-deductions" },
  { key: "pension", label: "Pension", to: "/v3-preview/payroll/pension" },
  { key: "final-settlement", label: "Final settlement", to: "/v3-preview/payroll/final-settlement" },
  { key: "history", label: "History", to: "/v3-preview/payroll/history" },
  { key: "reports", label: "Reports", to: "/v3-preview/payroll/reports" },
  { key: "settings", label: "Settings", to: "/v3-preview/payroll/settings" }
];

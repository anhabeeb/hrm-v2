import type { RouteNavRailItem } from "../components/ui/route-nav-rail";

export const PAYROLL_NAV_ITEMS: RouteNavRailItem[] = [
  { key: "runs", label: "Runs", to: "/v3-preview/payroll/runs" },
  { key: "periods", label: "Periods", to: "/v3-preview/payroll/periods" },
  { key: "payslips", label: "Payslips", to: "/v3-preview/payroll/payslips" },
  { key: "payment-register", label: "Payment register", to: "/v3-preview/payroll/payment-register" },
  { key: "advances", label: "Advances", to: "/v3-preview/payroll/advances" },
  { key: "deductions", label: "Deductions", to: "/v3-preview/payroll/deductions" },
  { key: "adjustments", label: "Adjustments", to: "/v3-preview/payroll/adjustments" },
  { key: "institutions", label: "Institutions", to: "/v3-preview/payroll/institutions" },
  { key: "bank-loans", label: "Bank loans", to: "/v3-preview/payroll/bank-loans" },
  { key: "pension", label: "Pension", to: "/v3-preview/payroll/pension" },
  { key: "final-settlement", label: "Final settlement", to: "/v3-preview/payroll/final-settlement" },
  { key: "reports", label: "Reports", to: "/v3-preview/payroll/reports" }
];

import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLoader, PageLoader } from "../components/loading";
import { useAuth } from "../hooks/useAuth";
import { AppShell } from "../layouts/AppShell";

function lazyPage(loader: () => Promise<Record<string, unknown>>, exportName: string) {
  return lazy(async () => ({ default: (await loader())[exportName] as ComponentType<any> }));
}

const AttendanceCalendarPage = lazyPage(() => import("../pages/AttendanceCalendarPage"), "AttendanceCalendarPage");
const AttendanceCorrectionsPage = lazyPage(() => import("../pages/AttendanceCorrectionsPage"), "AttendanceCorrectionsPage");
const AttendanceDevicesPage = lazyPage(() => import("../pages/AttendanceDevicesPage"), "AttendanceDevicesPage");
const AttendanceDeviceOperationsPage = lazyPage(() => import("../pages/AttendanceDeviceOperationsPage"), "AttendanceDeviceOperationsPage");
const AttendanceRecordsPage = lazyPage(() => import("../pages/AttendanceRecordsPage"), "AttendanceRecordsPage");
const AttendanceReportsPage = lazyPage(() => import("../pages/AttendanceReportsPage"), "AttendanceReportsPage");
const AttendanceSettingsPage = lazyPage(() => import("../pages/AttendanceSettingsPage"), "AttendanceSettingsPage");
const AdminHelpGuidePage = lazyPage(() => import("../pages/AdminHelpGuidePage"), "AdminHelpGuidePage");
const AdminSettingsPage = lazyPage(() => import("../pages/AdminSettingsPage"), "AdminSettingsPage");
const ApprovalsPage = lazyPage(() => import("../pages/ApprovalsPage"), "ApprovalsPage");
const AssetAssignmentsPage = lazyPage(() => import("../pages/AssetAssignmentsPage"), "AssetAssignmentsPage");
const AssetSettingsPage = lazyPage(() => import("../pages/AssetSettingsPage"), "AssetSettingsPage");
const AssetUniformSettingsPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "AssetUniformSettingsPage");
const AssetsDashboardPage = lazyPage(() => import("../pages/AssetsDashboardPage"), "AssetsDashboardPage");
const AssetsItemsPage = lazyPage(() => import("../pages/AssetsItemsPage"), "AssetsItemsPage");
const AssetsReportsPage = lazyPage(() => import("../pages/AssetsReportsPage"), "AssetsReportsPage");
const UniformAssignmentsPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "UniformAssignmentsPage");
const UniformInventoryPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "UniformInventoryPage");
const UniformTypesPage = lazyPage(() => import("../pages/AssetUniformAdvancedPages"), "UniformTypesPage");
const AuditLogPage = lazyPage(() => import("../pages/AuditLogPage"), "AuditLogPage");
const ContractsPage = lazyPage(() => import("../pages/ContractsPage"), "ContractsPage");
const DashboardPage = lazyPage(() => import("../pages/DashboardPage"), "DashboardPage");
const DataTransferPage = lazyPage(() => import("../pages/DataTransferPage"), "DataTransferPage");
const DocumentCompliancePage = lazyPage(() => import("../pages/DocumentCompliancePage"), "DocumentCompliancePage");
const DocumentRegistryPage = lazyPage(() => import("../pages/DocumentRegistryPage"), "DocumentRegistryPage");
const DocumentSettingsPage = lazyPage(() => import("../pages/DocumentSettingsPage"), "DocumentSettingsPage");
const EmployeeNotesSettingsPage = lazyPage(() => import("../pages/EmployeeNotesSettingsPage"), "EmployeeNotesSettingsPage");
const EmployeeProfilePage = lazyPage(() => import("../pages/EmployeeProfilePage"), "EmployeeProfilePage");
const EmployeeSettingsPage = lazyPage(() => import("../pages/EmployeeSettingsPage"), "EmployeeSettingsPage");
const EmployeesPage = lazyPage(() => import("../pages/EmployeesPage"), "EmployeesPage");
const FinalSettlementPage = lazyPage(() => import("../pages/FinalSettlementPage"), "FinalSettlementPage");
const ImportMigrationPage = lazyPage(() => import("../pages/ImportMigrationPage"), "ImportMigrationPage");
const KycRequestsPage = lazyPage(() => import("../pages/KycRequestsPage"), "KycRequestsPage");
const LeaveCalendarPage = lazyPage(() => import("../pages/LeaveCalendarPage"), "LeaveCalendarPage");
const LeaveRequestsPage = lazyPage(() => import("../pages/LeaveRequestsPage"), "LeaveRequestsPage");
const LeaveSettingsPage = lazyPage(() => import("../pages/LeaveSettingsPage"), "LeaveSettingsPage");
const LifecyclePage = lazyPage(() => import("../pages/LifecyclePage"), "LifecyclePage");
const LoginPage = lazyPage(() => import("../pages/LoginPage"), "LoginPage");
const MissingDocumentsPage = lazyPage(() => import("../pages/MissingDocumentsPage"), "MissingDocumentsPage");
const NotificationCenterPage = lazyPage(() => import("../pages/NotificationCenterPage"), "NotificationCenterPage");
const OrganizationSettingsPage = lazyPage(() => import("../pages/OrganizationSettingsPage"), "OrganizationSettingsPage");
const PayrollAdjustmentsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollAdjustmentsPage");
const PayrollAdvancesPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollAdvancesPage");
const PayrollComponentsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollComponentsPage");
const PayrollDeductionsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollDeductionsPage");
const PayrollReportsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollReportsPage");
const PayrollSettingsPage = lazyPage(() => import("../pages/PayrollAdminPages"), "PayrollSettingsPage");
const PayrollDashboardPage = lazyPage(() => import("../pages/PayrollDashboardPage"), "PayrollDashboardPage");
const PayrollBankLoansPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollBankLoansPage");
const PayrollCustomDeductionsPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollCustomDeductionsPage");
const PayrollPaymentInstitutionsPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollPaymentInstitutionsPage");
const PayrollPensionPage = lazyPage(() => import("../pages/PayrollFoundationPages"), "PayrollPensionPage");
const PayrollPeriodsPage = lazyPage(() => import("../pages/PayrollPeriodsPage"), "PayrollPeriodsPage");
const PayrollHistoryPage = lazyPage(() => import("../pages/PayrollPrompt11Pages"), "PayrollHistoryPage");
const PayrollPaymentRegisterPage = lazyPage(() => import("../pages/PayrollPrompt11Pages"), "PayrollPaymentRegisterPage");
const PayrollPayslipsPage = lazyPage(() => import("../pages/PayrollPrompt11Pages"), "PayrollPayslipsPage");
const PayrollRunDetailPage = lazyPage(() => import("../pages/PayrollRunDetailPage"), "PayrollRunDetailPage");
const PayrollRunsPage = lazyPage(() => import("../pages/PayrollRunsPage"), "PayrollRunsPage");
const PlaceholderModulePage = lazyPage(() => import("../pages/PlaceholderModulePage"), "PlaceholderModulePage");
const ReportsPage = lazyPage(() => import("../pages/ReportsPage"), "ReportsPage");
const RosterReportsPage = lazyPage(() => import("../pages/RosterReportsPage"), "RosterReportsPage");
const RosterSettingsPage = lazyPage(() => import("../pages/RosterSettingsPage"), "RosterSettingsPage");
const RosterShiftTemplatesPage = lazyPage(() => import("../pages/RosterShiftTemplatesPage"), "RosterShiftTemplatesPage");
const RosterWeeklyPage = lazyPage(() => import("../pages/RosterWeeklyPage"), "RosterWeeklyPage");
const SelfServicePage = lazyPage(() => import("../pages/SelfServicePage"), "SelfServicePage");
const SelfServiceSettingsPage = lazyPage(() => import("../pages/SelfServiceSettingsPage"), "SelfServiceSettingsPage");
const SearchResultsPage = lazyPage(() => import("../pages/SearchResultsPage"), "SearchResultsPage");
const SettingsPage = lazyPage(() => import("../pages/SettingsPage"), "SettingsPage");
const SetupPage = lazyPage(() => import("../pages/SetupPage"), "SetupPage");
const UsersAccessPage = lazyPage(() => import("../pages/UsersAccessPage"), "UsersAccessPage");

function RequireAuth() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <AppLoader />;
  }
  if (bootstrap.setup_required) {
    return <Navigate to="/setup" replace />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function SetupGate() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <AppLoader />;
  }
  if (!bootstrap.setup_required) {
    return <Navigate to={user ? "/" : "/login"} replace />;
  }
  return <SetupPage />;
}

function LoginGate() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <AppLoader />;
  }
  if (bootstrap.setup_required) {
    return <Navigate to="/setup" replace />;
  }
  if (user) {
    return <Navigate to={defaultLandingPath(user)} replace />;
  }
  return <LoginPage />;
}

function defaultLandingPath(user: { permissions: string[]; employee_id?: string | null; is_owner?: boolean } | null) {
  if (!user) return "/";
  if (user.is_owner || user.permissions.includes("dashboard.view")) return "/";
  if (user.employee_id && (user.permissions.includes("self_service.view") || user.permissions.some((permission) => permission.startsWith("self_service.")))) return "/self-service";
  return "/";
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader title="Loading HRM page" description="Loading the requested workspace module." />}>
      <Routes>
        <Route path="/setup" element={<SetupGate />} />
        <Route path="/login" element={<LoginGate />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="command-center" element={<Navigate to="/dashboard" replace />} />
            <Route path="search" element={<SearchResultsPage />} />
            <Route path="notifications" element={<NotificationCenterPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/kyc-requests" element={<KycRequestsPage />} />
            <Route path="employees/settings" element={<EmployeeSettingsPage />} />
            <Route path="employees/:id" element={<EmployeeProfilePage />} />
            <Route path="onboarding" element={<LifecyclePage mode="onboarding-dashboard" />} />
            <Route path="onboarding/cases" element={<LifecyclePage mode="onboarding-cases" />} />
            <Route path="onboarding/alerts" element={<LifecyclePage mode="onboarding-alerts" />} />
            <Route path="onboarding/settings" element={<LifecyclePage mode="onboarding-settings" />} />
            <Route path="offboarding" element={<LifecyclePage mode="offboarding-dashboard" />} />
            <Route path="offboarding/cases" element={<LifecyclePage mode="offboarding-cases" />} />
            <Route path="offboarding/settings" element={<LifecyclePage mode="offboarding-settings" />} />
            <Route path="lifecycle/reports" element={<LifecyclePage mode="lifecycle-reports" />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="contracts/probation" element={<ContractsPage mode="probation" />} />
            <Route path="contracts/renewals" element={<ContractsPage mode="renewals" />} />
            <Route path="contracts/alerts" element={<ContractsPage mode="alerts" />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="approvals/submitted" element={<ApprovalsPage mode="submitted" />} />
            <Route path="approvals/overdue" element={<ApprovalsPage mode="overdue" />} />
            <Route path="approvals/escalated" element={<ApprovalsPage mode="escalated" />} />
            <Route path="approvals/delegated" element={<ApprovalsPage mode="delegated" />} />
            <Route path="approvals/history" element={<ApprovalsPage mode="history" />} />
            <Route path="approvals/workflows" element={<ApprovalsPage mode="workflows" />} />
            <Route path="approvals/settings" element={<ApprovalsPage mode="settings" />} />
            <Route path="approvals/delegations" element={<ApprovalsPage mode="delegations" />} />
            <Route path="approvals/templates" element={<ApprovalsPage mode="templates" />} />
            <Route path="approvals/reports" element={<ApprovalsPage mode="reports" />} />
            <Route path="attendance" element={<AttendanceRecordsPage />} />
            <Route path="attendance/records" element={<AttendanceRecordsPage />} />
            <Route path="attendance/calendar" element={<AttendanceCalendarPage />} />
            <Route path="attendance/corrections" element={<AttendanceCorrectionsPage />} />
            <Route path="attendance/devices" element={<AttendanceDevicesPage />} />
            <Route path="attendance/devices/settings" element={<AttendanceDeviceOperationsPage mode="settings" />} />
            <Route path="attendance/biometric-mappings" element={<AttendanceDeviceOperationsPage mode="mappings" />} />
            <Route path="attendance/imports" element={<AttendanceDeviceOperationsPage mode="imports" />} />
            <Route path="attendance/raw-logs" element={<AttendanceDeviceOperationsPage mode="raw-logs" />} />
            <Route path="attendance/unmatched-logs" element={<AttendanceDeviceOperationsPage mode="unmatched" />} />
            <Route path="attendance/import-errors" element={<AttendanceDeviceOperationsPage mode="errors" />} />
            <Route path="attendance/locked-day-import-warnings" element={<AttendanceDeviceOperationsPage mode="locked-warnings" />} />
            <Route path="attendance/device-diagnostics" element={<AttendanceDeviceOperationsPage mode="diagnostics" />} />
            <Route path="attendance/vendor-integrations" element={<AttendanceDeviceOperationsPage mode="vendor-integrations" />} />
            <Route path="attendance/device-reports" element={<AttendanceDeviceOperationsPage mode="reports" />} />
            <Route path="attendance/reports" element={<AttendanceReportsPage />} />
            <Route path="attendance/settings" element={<AttendanceSettingsPage />} />
            <Route path="leave" element={<LeaveRequestsPage />} />
            <Route path="leave/requests" element={<LeaveRequestsPage />} />
            <Route path="leave/approvals" element={<LeaveRequestsPage approvalsOnly />} />
            <Route path="leave/calendar" element={<LeaveCalendarPage />} />
            <Route path="leave/settings" element={<LeaveSettingsPage />} />
            <Route path="leave/workflows" element={<LeaveSettingsPage />} />
            <Route path="payroll" element={<PayrollDashboardPage />} />
            <Route path="payroll/periods" element={<PayrollPeriodsPage />} />
            <Route path="payroll/runs" element={<PayrollRunsPage />} />
            <Route path="payroll/runs/:id" element={<PayrollRunDetailPage />} />
            <Route path="payroll/advances" element={<PayrollAdvancesPage />} />
            <Route path="payroll/deductions" element={<PayrollDeductionsPage />} />
            <Route path="payroll/adjustments" element={<PayrollAdjustmentsPage />} />
            <Route path="payroll/components" element={<PayrollComponentsPage />} />
            <Route path="payroll/payslips" element={<PayrollPayslipsPage />} />
            <Route path="payroll/payment-register" element={<PayrollPaymentRegisterPage />} />
            <Route path="payroll/payment-institutions" element={<PayrollPaymentInstitutionsPage />} />
            <Route path="payroll/bank-loans" element={<PayrollBankLoansPage />} />
            <Route path="payroll/custom-deductions" element={<PayrollCustomDeductionsPage />} />
            <Route path="payroll/pension" element={<PayrollPensionPage />} />
            <Route path="payroll/history" element={<PayrollHistoryPage />} />
            <Route path="payroll/exit-payroll" element={<FinalSettlementPage />} />
            <Route path="payroll/settings" element={<PayrollSettingsPage />} />
            <Route path="payroll/reports" element={<PayrollReportsPage />} />
            <Route path="roster" element={<RosterWeeklyPage />} />
            <Route path="roster/weekly" element={<RosterWeeklyPage />} />
            <Route path="roster/shift-templates" element={<RosterShiftTemplatesPage />} />
            <Route path="roster/reports" element={<RosterReportsPage />} />
            <Route path="roster/settings" element={<RosterSettingsPage />} />
            <Route path="documents" element={<DocumentRegistryPage />} />
            <Route path="documents/registry" element={<DocumentRegistryPage />} />
            <Route path="documents/missing" element={<MissingDocumentsPage />} />
            <Route path="documents/compliance" element={<DocumentCompliancePage />} />
            <Route path="documents/compliance/missing" element={<DocumentCompliancePage mode="missing" />} />
            <Route path="documents/compliance/expiring" element={<DocumentCompliancePage mode="expiring" />} />
            <Route path="documents/compliance/expired" element={<DocumentCompliancePage mode="expired" />} />
            <Route path="documents/compliance/alerts" element={<DocumentCompliancePage mode="alerts" />} />
            <Route path="documents/compliance/renewal-cases" element={<DocumentCompliancePage mode="renewal-cases" />} />
            <Route path="documents/compliance/waivers" element={<DocumentCompliancePage mode="waivers" />} />
            <Route path="assets" element={<AssetsDashboardPage />} />
            <Route path="assets/items" element={<AssetsItemsPage />} />
            <Route path="assets/assignments" element={<AssetAssignmentsPage />} />
            <Route path="assets/uniforms" element={<UniformInventoryPage />} />
            <Route path="assets/uniform-assignments" element={<UniformAssignmentsPage />} />
            <Route path="assets/uniform-types" element={<UniformTypesPage />} />
            <Route path="assets/categories" element={<AssetSettingsPage mode="categories" />} />
            <Route path="assets/deduction-rules" element={<AssetSettingsPage mode="deduction-rules" />} />
            <Route path="assets/settings" element={<AssetUniformSettingsPage />} />
            <Route path="assets/reports" element={<AssetsReportsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/audit" element={<AuditLogPage />} />
            <Route path="self-service" element={<SelfServicePage />} />
            <Route path="self-service/profile" element={<SelfServicePage mode="profile" />} />
            <Route path="self-service/documents" element={<SelfServicePage mode="documents" />} />
            <Route path="self-service/attendance" element={<SelfServicePage mode="attendance" />} />
            <Route path="self-service/leave" element={<SelfServicePage mode="leave" />} />
            <Route path="self-service/roster" element={<SelfServicePage mode="roster" />} />
            <Route path="self-service/payroll" element={<SelfServicePage mode="payroll" />} />
            <Route path="self-service/payment-methods" element={<SelfServicePage mode="payment-methods" />} />
            <Route path="self-service/bank-loans" element={<SelfServicePage mode="bank-loans" />} />
            <Route path="self-service/pension" element={<SelfServicePage mode="pension" />} />
            <Route path="self-service/contracts" element={<SelfServicePage mode="contracts" />} />
            <Route path="self-service/onboarding" element={<SelfServicePage mode="onboarding" />} />
            <Route path="self-service/offboarding" element={<SelfServicePage mode="offboarding" />} />
            <Route path="self-service/assets" element={<SelfServicePage mode="assets" />} />
            <Route path="self-service/uniforms" element={<SelfServicePage mode="uniforms" />} />
            <Route path="self-service/approvals" element={<SelfServicePage mode="approvals" />} />
            <Route path="self-service/notifications" element={<SelfServicePage mode="notifications" />} />
            <Route path="self-service/kyc-requests" element={<SelfServicePage mode="kyc" />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/admin" element={<AdminSettingsPage />} />
            <Route path="admin/help" element={<AdminHelpGuidePage />} />
            <Route path="settings/admin/imports" element={<DataTransferPage mode="imports" />} />
            <Route path="settings/admin/import-templates" element={<DataTransferPage mode="templates" />} />
            <Route path="settings/admin/exports" element={<DataTransferPage mode="exports" />} />
            <Route path="settings/admin/backup-readiness" element={<DataTransferPage mode="backup" />} />
            <Route path="settings/admin/migration-readiness" element={<DataTransferPage mode="migration" />} />
            <Route path="settings/admin/remote-d1-apply-guide" element={<DataTransferPage mode="remote-d1" />} />
            <Route path="settings/admin/qa-test-matrix" element={<DataTransferPage mode="qa" />} />
            <Route path="settings/admin/smoke-tests" element={<DataTransferPage mode="smoke" />} />
            <Route path="settings/admin/deployment-readiness" element={<DataTransferPage mode="deployment" />} />
            <Route path="settings/admin/data-transfer-settings" element={<DataTransferPage mode="settings" />} />
            <Route path="settings/organization" element={<OrganizationSettingsPage />} />
            <Route path="settings/self-service" element={<SelfServiceSettingsPage />} />
            <Route path="settings/documents" element={<DocumentSettingsPage />} />
            <Route path="settings/documents/compliance" element={<DocumentCompliancePage mode="settings" />} />
            <Route path="settings/documents/compliance/types" element={<DocumentCompliancePage mode="type-settings" />} />
            <Route path="settings/contracts" element={<ContractsPage mode="settings" />} />
            <Route path="settings/employee-notes" element={<EmployeeNotesSettingsPage />} />
            <Route path="settings/import-migration" element={<ImportMigrationPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="users-access" element={<UsersAccessPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

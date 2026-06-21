import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../hooks/useAuth";
import { AppShell } from "../layouts/AppShell";
import { AttendanceCalendarPage } from "../pages/AttendanceCalendarPage";
import { AttendanceCorrectionsPage } from "../pages/AttendanceCorrectionsPage";
import { AttendanceDevicesPage } from "../pages/AttendanceDevicesPage";
import { AttendanceRecordsPage } from "../pages/AttendanceRecordsPage";
import { AttendanceReportsPage } from "../pages/AttendanceReportsPage";
import { AttendanceSettingsPage } from "../pages/AttendanceSettingsPage";
import { AssetAssignmentsPage } from "../pages/AssetAssignmentsPage";
import { AssetSettingsPage } from "../pages/AssetSettingsPage";
import { AssetsDashboardPage } from "../pages/AssetsDashboardPage";
import { AssetsItemsPage } from "../pages/AssetsItemsPage";
import { AssetsReportsPage } from "../pages/AssetsReportsPage";
import { AuditLogPage } from "../pages/AuditLogPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DocumentRegistryPage } from "../pages/DocumentRegistryPage";
import { DocumentSettingsPage } from "../pages/DocumentSettingsPage";
import { EmployeeProfilePage } from "../pages/EmployeeProfilePage";
import { EmployeeSettingsPage } from "../pages/EmployeeSettingsPage";
import { EmployeeNotesSettingsPage } from "../pages/EmployeeNotesSettingsPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { LeaveCalendarPage } from "../pages/LeaveCalendarPage";
import { LeaveRequestsPage } from "../pages/LeaveRequestsPage";
import { LeaveSettingsPage } from "../pages/LeaveSettingsPage";
import { ImportMigrationPage } from "../pages/ImportMigrationPage";
import { KycRequestsPage } from "../pages/KycRequestsPage";
import { LoginPage } from "../pages/LoginPage";
import { MissingDocumentsPage } from "../pages/MissingDocumentsPage";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";
import {
  PayrollAdjustmentsPage,
  PayrollAdvancesPage,
  PayrollComponentsPage,
  PayrollDeductionsPage,
  PayrollFinalSettlementsPage,
  PayrollReportsPage,
  PayrollSettingsPage
} from "../pages/PayrollAdminPages";
import { PayrollDashboardPage } from "../pages/PayrollDashboardPage";
import { PayrollPeriodsPage } from "../pages/PayrollPeriodsPage";
import { PayrollRunDetailPage } from "../pages/PayrollRunDetailPage";
import { PayrollRunsPage } from "../pages/PayrollRunsPage";
import { PlaceholderModulePage } from "../pages/PlaceholderModulePage";
import { RosterReportsPage } from "../pages/RosterReportsPage";
import { RosterSettingsPage } from "../pages/RosterSettingsPage";
import { RosterShiftTemplatesPage } from "../pages/RosterShiftTemplatesPage";
import { RosterWeeklyPage } from "../pages/RosterWeeklyPage";
import { ReportsPage } from "../pages/ReportsPage";
import { SelfServicePage } from "../pages/SelfServicePage";
import { SettingsPage } from "../pages/SettingsPage";
import { SetupPage } from "../pages/SetupPage";
import { UsersAccessPage } from "../pages/UsersAccessPage";

function RequireAuth() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <LoadingScreen />;
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
    return <LoadingScreen />;
  }
  if (!bootstrap.setup_required) {
    return <Navigate to={user ? "/" : "/login"} replace />;
  }
  return <SetupPage />;
}

function LoginGate() {
  const { loading, bootstrap, user } = useAuth();
  if (loading || !bootstrap) {
    return <LoadingScreen />;
  }
  if (bootstrap.setup_required) {
    return <Navigate to="/setup" replace />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupGate />} />
      <Route path="/login" element={<LoginGate />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/kyc-requests" element={<KycRequestsPage />} />
          <Route path="employees/settings" element={<EmployeeSettingsPage />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          <Route path="attendance" element={<AttendanceRecordsPage />} />
          <Route path="attendance/records" element={<AttendanceRecordsPage />} />
          <Route path="attendance/calendar" element={<AttendanceCalendarPage />} />
          <Route path="attendance/corrections" element={<AttendanceCorrectionsPage />} />
          <Route path="attendance/devices" element={<AttendanceDevicesPage />} />
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
          <Route path="payroll/settings" element={<PayrollSettingsPage />} />
          <Route path="payroll/reports" element={<PayrollReportsPage />} />
          <Route path="payroll/final-settlements" element={<PayrollFinalSettlementsPage />} />
          <Route path="roster" element={<RosterWeeklyPage />} />
          <Route path="roster/weekly" element={<RosterWeeklyPage />} />
          <Route path="roster/shift-templates" element={<RosterShiftTemplatesPage />} />
          <Route path="roster/reports" element={<RosterReportsPage />} />
          <Route path="roster/settings" element={<RosterSettingsPage />} />
          <Route path="documents" element={<DocumentRegistryPage />} />
          <Route path="documents/registry" element={<DocumentRegistryPage />} />
          <Route path="documents/missing" element={<MissingDocumentsPage />} />
          <Route path="assets" element={<AssetsDashboardPage />} />
          <Route path="assets/items" element={<AssetsItemsPage />} />
          <Route path="assets/assignments" element={<AssetAssignmentsPage />} />
          <Route path="assets/categories" element={<AssetSettingsPage mode="categories" />} />
          <Route path="assets/deduction-rules" element={<AssetSettingsPage mode="deduction-rules" />} />
          <Route path="assets/reports" element={<AssetsReportsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/audit" element={<AuditLogPage />} />
          <Route path="self-service" element={<SelfServicePage />} />
          <Route path="self-service/profile" element={<SelfServicePage mode="profile" />} />
          <Route path="self-service/documents" element={<SelfServicePage mode="documents" />} />
          <Route path="self-service/attendance" element={<SelfServicePage mode="attendance" />} />
          <Route path="self-service/leave" element={<SelfServicePage mode="leave" />} />
          <Route path="self-service/payroll" element={<SelfServicePage mode="payroll" />} />
          <Route path="self-service/assets" element={<SelfServicePage mode="assets" />} />
          <Route path="self-service/kyc-requests" element={<SelfServicePage mode="kyc" />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/organization" element={<OrganizationSettingsPage />} />
          <Route path="settings/documents" element={<DocumentSettingsPage />} />
          <Route path="settings/employee-notes" element={<EmployeeNotesSettingsPage />} />
          <Route path="settings/import-migration" element={<ImportMigrationPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="users-access" element={<UsersAccessPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

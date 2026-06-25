import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { accessScopeRoutes } from "./routes/access-scopes";
import { adminReportRoutes, adminRoutes } from "./routes/admin";
import { approvalReportRoutes, approvalRoutes, selfServiceApprovalRoutes } from "./routes/approvals";
import { authRoutes } from "./routes/auth";
import { assetUniformAdvancedRoutes, employeeAssetUniformRoutes, selfServiceAssetUniformRoutes, uniformRoutes } from "./routes/asset-uniforms-advanced";
import { assetRoutes, auditRoutes, employeeAssetRoutes, employeeNoteCategoryRoutes, employeeNoteRoutes } from "./routes/assets-notes-audit";
import { attendanceDeviceSyncRoutes, employeeAttendanceDeviceSyncRoutes, selfServiceAttendanceDeviceSyncRoutes } from "./routes/attendance-devices-zkteco";
import { attendanceRoutes, employeeAttendanceRoutes } from "./routes/attendance";
import { bootstrapRoutes } from "./routes/bootstrap";
import { dashboardRoutes } from "./routes/dashboard";
import { dataExportRoutes, dataImportRoutes, dataTransferAdminRoutes } from "./routes/data-transfer";
import { contractRoutes, employeeContractRoutes, selfServiceContractRoutes } from "./routes/contracts";
import { documentComplianceRoutes, employeeDocumentComplianceRoutes, selfServiceDocumentComplianceRoutes } from "./routes/document-compliance";
import { documentRoutes, employeeDocumentRoutes } from "./routes/documents";
import { employeeRoutes } from "./routes/employees";
import { employeeFinalSettlementRoutes, finalSettlementRoutes } from "./routes/final-settlement";
import { healthRoutes } from "./routes/health";
import { employeeLeaveRoutes, leaveRoutes } from "./routes/leave";
import { employeeLifecycleRoutes, lifecycleRoutes, offboardingRoutes, onboardingRoutes, selfServiceLifecycleRoutes } from "./routes/lifecycle";
import { migrationRoutes } from "./routes/migration";
import { permissionRoutes } from "./routes/permissions";
import { organizationRoutes } from "./routes/organization";
import { employeePayrollRoutes, payrollRoutes } from "./routes/payroll";
import { employeePayrollFoundationRoutes, payrollFoundationRoutes, selfServicePayrollFoundationRoutes } from "./routes/payroll-foundations";
import { realtimeRoutes } from "./routes/realtime";
import { reportRoutes } from "./routes/reports";
import { roleMappingRoutes } from "./routes/role-mappings";
import { roleRoutes } from "./routes/roles";
import { employeeRosterRoutes, rosterRoutes } from "./routes/roster";
import { kycRoutes, selfServiceRoutes } from "./routes/self-service";
import { userRoutes } from "./routes/users";
import type { AppBindings } from "./types";
import { fail } from "./utils/http";

const app = new Hono<AppBindings>();

app.use("*", async (c, next) => {
  const configuredOrigin = c.env.CORS_ORIGIN;
  const allowedOrigins = configuredOrigin
    ? configuredOrigin.split(",").map((origin) => origin.trim())
    : ["http://localhost:5173", "http://127.0.0.1:5173"];

  const middleware = cors({
    origin: (origin) => {
      if (!origin) {
        return null;
      }
      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400
  });

  return middleware(c, next);
});

app.route("/api/v1/health", healthRoutes);
app.route("/api/v1/bootstrap", bootstrapRoutes);
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/users", userRoutes);
app.route("/api/v1/roles", roleRoutes);
app.route("/api/v1/permissions", permissionRoutes);
app.route("/api/v1/role-mappings", roleMappingRoutes);
app.route("/api/v1/access-scopes", accessScopeRoutes);
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/admin", dataTransferAdminRoutes);
app.route("/api/v1/approvals", approvalRoutes);
app.route("/api/v1/dashboard", dashboardRoutes);
app.route("/api/v1/organization", organizationRoutes);
app.route("/api/v1/employees", employeeAssetUniformRoutes);
app.route("/api/v1/employees", employeeAssetRoutes);
app.route("/api/v1/employees", employeeNoteRoutes);
app.route("/api/v1/employees", employeeLifecycleRoutes);
app.route("/api/v1/employees", employeeRoutes);
app.route("/api/v1/employees", employeeContractRoutes);
app.route("/api/v1/employees", employeeDocumentComplianceRoutes);
app.route("/api/v1/employees", employeeDocumentRoutes);
app.route("/api/v1/employees", employeeLeaveRoutes);
app.route("/api/v1/employees", employeeAttendanceDeviceSyncRoutes);
app.route("/api/v1/employees", employeeAttendanceRoutes);
app.route("/api/v1/employees", employeeRosterRoutes);
app.route("/api/v1/employees", employeePayrollRoutes);
app.route("/api/v1/employees", employeePayrollFoundationRoutes);
app.route("/api/v1/employees", employeeFinalSettlementRoutes);
app.route("/api/v1/documents", documentComplianceRoutes);
app.route("/api/v1/documents", documentRoutes);
app.route("/api/v1/leave", leaveRoutes);
app.route("/api/v1/attendance", attendanceDeviceSyncRoutes);
app.route("/api/v1/attendance", attendanceRoutes);
app.route("/api/v1/onboarding", onboardingRoutes);
app.route("/api/v1/offboarding", offboardingRoutes);
app.route("/api/v1/lifecycle", lifecycleRoutes);
app.route("/api/v1/roster", rosterRoutes);
app.route("/api/v1/payroll", payrollRoutes);
app.route("/api/v1/payroll", payrollFoundationRoutes);
app.route("/api/v1/final-settlement", finalSettlementRoutes);
app.route("/api/v1/contracts", contractRoutes);
app.route("/api/v1/assets", assetUniformAdvancedRoutes);
app.route("/api/v1/assets", assetRoutes);
app.route("/api/v1/uniforms", uniformRoutes);
app.route("/api/v1/employee-notes", employeeNoteCategoryRoutes);
app.route("/api/v1/audit", auditRoutes);
app.route("/api/v1/data-import", dataImportRoutes);
app.route("/api/v1/data-export", dataExportRoutes);
app.route("/api/v1/reports", reportRoutes);
app.route("/api/v1/reports", approvalReportRoutes);
app.route("/api/v1/reports/admin", adminReportRoutes);
app.route("/api/v1/self-service", selfServiceAssetUniformRoutes);
app.route("/api/v1/self-service", selfServiceAttendanceDeviceSyncRoutes);
app.route("/api/v1/self-service", selfServiceLifecycleRoutes);
app.route("/api/v1/self-service", selfServiceRoutes);
app.route("/api/v1/self-service", selfServiceApprovalRoutes);
app.route("/api/v1/self-service", selfServiceContractRoutes);
app.route("/api/v1/self-service", selfServicePayrollFoundationRoutes);
app.route("/api/v1/self-service", selfServiceDocumentComplianceRoutes);
app.route("/api/v1/kyc-requests", kycRoutes);
app.route("/api/v1/migration", migrationRoutes);
app.route("/api/v1/realtime", realtimeRoutes);

app.notFound((c) => fail(c, 404, "NOT_FOUND", "Route not found."));

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return fail(c, error.status, "HTTP_ERROR", error.message);
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: error instanceof Error ? error.message : "Unhandled error",
      path: c.req.path
    })
  );
  return fail(c, 500, "INTERNAL_ERROR", "Something went wrong.");
});

export default app;

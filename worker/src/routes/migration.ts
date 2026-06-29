import { Hono } from "hono";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import type { AppBindings } from "../types";
import { getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

export const migrationRoutes = new Hono<AppBindings>();

migrationRoutes.use("*", requireAuth);

const supportedPlaceholders = [
  "employees",
  "organization",
  "documents_metadata",
  "payroll_opening_balances",
  "leave_balances"
];

migrationRoutes.get("/status", requirePermission("settings.view"), (c) => {
  return ok(c, {
    automatic_migration_enabled: false,
    validation_only: true,
    source: "old_hrm_reference_only",
    warning: "Import/migration should be performed only after OmniCore - HR core setup is complete and backups are available.",
    supported_placeholders: supportedPlaceholders
  });
});

migrationRoutes.post("/validate-csv-placeholder", requirePermission("settings.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const importType = readString(body.import_type) || "unknown";
  const filename = readString(body.filename) || null;
  const actor = c.get("currentUser");

  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "migration.validation_placeholder_triggered",
    module: "settings",
    entityType: "migration_placeholder",
    entityId: importType,
    newValue: {
      import_type: importType,
      filename,
      automatic_import_performed: false
    },
    reason: "Validation placeholder only. No data was imported.",
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });

  return ok(c, {
    accepted: true,
    import_type: importType,
    filename,
    validation_only: true,
    imported_rows: 0,
    warnings: [
      "This endpoint is a production-readiness placeholder.",
      "No old HRM data was imported or modified.",
      "Backups and CSV mapping review are required before a future import."
    ]
  });
});

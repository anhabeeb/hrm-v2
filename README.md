# HRM v2

Clean HRM v2 foundation with a React/Vite frontend, Cloudflare Worker API, Cloudflare D1 schema, and first Owner/Super Admin bootstrap flow.

REST remains the primary API for setup, auth, users, roles, employees, documents, leave, attendance, payroll, roster, reports, and settings.
WebSockets are prepared under `/api/v1/realtime/ws` for future live notifications and dashboard/device updates. 

## Local setup

```bash
npm install
Copy-Item .dev.vars.example worker/.dev.vars
npm run dev:worker
npm run dev:frontend
```

Frontend local URL: `http://localhost:5173`

Worker local URL: `http://localhost:8787`

## D1 schema

```bash
cd worker
npx wrangler d1 execute hrm-v2 --local --file ../database/schema.sql
npx wrangler d1 execute hrm-v2 --local --file ../database/seed.sql
npx wrangler d1 execute hrm-v2 --remote --file ../database/schema.sql
npx wrangler d1 execute hrm-v2 --remote --file ../database/seed.sql
```

## R2 documents bucket

The Worker expects a private R2 binding named `DOCUMENTS_BUCKET`.

```bash
cd worker
npx wrangler r2 bucket create hrm-v2-documents
```

## Build checks

```bash
npm run build:frontend
npm run build:worker
npm run typecheck
```

## Realtime placeholder

Authenticated WebSocket endpoint:

```text
GET /api/v1/realtime/ws
```

Browser clients should offer the neutral protocol plus the token protocol:

```ts
new WebSocket("ws://localhost:8787/api/v1/realtime/ws", [
  "hrm-v2",
  `hrm-v2.token.${token}`
]);
```

Prepared channels: `dashboard`, `notifications`, `leave`, `attendance`, `roster`, `documents`, `payroll`, `assets`, `audit`, `devices`.
Current implementation supports authenticated connection readiness, `ping`, `subscribe`, and `unsubscribe` acknowledgements only.

## Users & Access

REST endpoints are available for users, roles, and permission registry:

```text
GET /api/v1/users
POST /api/v1/users
PATCH /api/v1/users/:id
POST /api/v1/users/:id/assign-roles
POST /api/v1/users/:id/disable
POST /api/v1/users/:id/enable
POST /api/v1/users/:id/lock
POST /api/v1/users/:id/unlock
POST /api/v1/users/:id/reset-password

GET /api/v1/roles
POST /api/v1/roles
PATCH /api/v1/roles/:id
PATCH /api/v1/roles/:id/permissions
POST /api/v1/roles/:id/disable
POST /api/v1/roles/:id/enable

GET /api/v1/permissions
```

Protected Owner rules are enforced in the Worker, including critical permission locks and last-active-Owner protections.

## Organization Foundation

Organization master data lives under Settings > Organization and requires `organization.view`.
Create/update/enable/disable actions require `organization.manage`.

```text
GET /api/v1/organization/company
POST /api/v1/organization/company
PATCH /api/v1/organization/company

GET /api/v1/organization/locations
GET /api/v1/organization/locations/:id
POST /api/v1/organization/locations
PATCH /api/v1/organization/locations/:id
POST /api/v1/organization/locations/:id/enable
POST /api/v1/organization/locations/:id/disable

GET /api/v1/organization/departments
GET /api/v1/organization/departments/:id
POST /api/v1/organization/departments
PATCH /api/v1/organization/departments/:id
POST /api/v1/organization/departments/:id/enable
POST /api/v1/organization/departments/:id/disable

GET /api/v1/organization/job-levels
GET /api/v1/organization/job-levels/:id
POST /api/v1/organization/job-levels
PATCH /api/v1/organization/job-levels/:id
POST /api/v1/organization/job-levels/:id/enable
POST /api/v1/organization/job-levels/:id/disable

GET /api/v1/organization/positions
GET /api/v1/organization/positions/:id
POST /api/v1/organization/positions
PATCH /api/v1/organization/positions/:id
POST /api/v1/organization/positions/:id/enable
POST /api/v1/organization/positions/:id/disable
```

Schema tables: `companies`, `locations`, `departments`, `job_levels`, and `positions`.
Organization mutations audit under module `organization` and publish placeholder realtime events such as `organization.changed`, `locations.changed`, `departments.changed`, `positions.changed`, and `job_levels.changed`.

## Employee 360 Foundation

Employee 360 is available at `/employees` and `/employees/:id`.
Settings for statuses and numbering are available at `/employees/settings`.

Core permissions:

```text
employees.view
employees.create
employees.update
employees.archive
employees.status.manage
employees.numbering.manage
employees.sensitive.view
employees.sensitive.update
employees.job_history.view
employees.job_history.manage
employees.contacts.view
employees.contacts.manage
employees.onboarding.manage
```

REST endpoints:

```text
GET /api/v1/employees
GET /api/v1/employees/:id
POST /api/v1/employees
PATCH /api/v1/employees/:id
POST /api/v1/employees/:id/archive
POST /api/v1/employees/:id/status
GET /api/v1/employees/:id/overview

GET /api/v1/employees/:id/contacts
POST /api/v1/employees/:id/contacts
PATCH /api/v1/employees/:id/contacts/:contactId
POST /api/v1/employees/:id/contacts/:contactId/archive

GET /api/v1/employees/:id/job-history
POST /api/v1/employees/:id/job-history

GET /api/v1/employees/:id/onboarding
PATCH /api/v1/employees/:id/onboarding/:taskId

GET /api/v1/employees/:id/audit

GET /api/v1/employees/settings/statuses
POST /api/v1/employees/settings/statuses
PATCH /api/v1/employees/settings/statuses/:id
POST /api/v1/employees/settings/statuses/:id/enable
POST /api/v1/employees/settings/statuses/:id/disable

GET /api/v1/employees/settings/numbering
PATCH /api/v1/employees/settings/numbering
GET /api/v1/employees/settings/numbering/preview
```

Schema tables: `employees`, `employee_statuses`, `employee_number_settings`, `employee_job_history`, `employee_contacts`, `employee_addresses`, `employee_onboarding_tasks`, and `employee_profile_field_settings`.
Employee mutations audit under module `employees` and publish placeholder realtime events such as `employees.changed`, `employee.created`, `employee.updated`, `employee.status_changed`, `employee.archived`, and `employee.onboarding_changed`.

## Document Tracking

Document tracking is available at `/documents`, `/documents/missing`, `/settings/documents`, and the Employee 360 Documents tab.
Files are stored privately in R2 through `env.DOCUMENTS_BUCKET`; metadata, versions, required rules, and audit records remain in D1.

Core permissions:

```text
documents.view
documents.upload
documents.download
documents.archive
documents.delete
documents.sensitive.view
documents.sensitive.download
documents.settings.manage
documents.reports.view
documents.reports.export
documents.registry.view
documents.required_rules.manage
documents.permanent_delete
```

REST endpoints:

```text
GET /api/v1/documents/categories
POST /api/v1/documents/categories
PATCH /api/v1/documents/categories/:id
POST /api/v1/documents/categories/:id/enable
POST /api/v1/documents/categories/:id/disable

GET /api/v1/documents/types
GET /api/v1/documents/types/:id
POST /api/v1/documents/types
PATCH /api/v1/documents/types/:id
POST /api/v1/documents/types/:id/enable
POST /api/v1/documents/types/:id/disable

GET /api/v1/documents/required-rules
POST /api/v1/documents/required-rules
PATCH /api/v1/documents/required-rules/:id
POST /api/v1/documents/required-rules/:id/enable
POST /api/v1/documents/required-rules/:id/disable

GET /api/v1/documents/registry
GET /api/v1/documents/missing
GET /api/v1/documents/expiring
GET /api/v1/documents/reports
GET /api/v1/documents/reports/export.csv
GET /api/v1/documents/dashboard

GET /api/v1/employees/:employeeId/documents
POST /api/v1/employees/:employeeId/documents/upload
POST /api/v1/employees/:employeeId/documents/:documentId/replace
PATCH /api/v1/employees/:employeeId/documents/:documentId
POST /api/v1/employees/:employeeId/documents/:documentId/archive
POST /api/v1/employees/:employeeId/documents/:documentId/restore
POST /api/v1/employees/:employeeId/documents/:documentId/soft-delete
DELETE /api/v1/employees/:employeeId/documents/:documentId/permanent-delete
GET /api/v1/employees/:employeeId/documents/:documentId/download
GET /api/v1/employees/:employeeId/documents/:documentId/versions

POST /api/v1/employees/:employeeId/profile-photo
DELETE /api/v1/employees/:employeeId/profile-photo
GET /api/v1/employees/:employeeId/profile-photo
```

Schema tables: `document_categories`, `document_types`, `employee_documents`, `employee_document_versions`, `document_required_rules`, `document_retention_rules`, and `document_report_exports`.
Document mutations audit under module `documents` and publish placeholder realtime events such as `documents.changed`, `document.uploaded`, `document.replaced`, `document.archived`, `document.restored`, `document.soft_deleted`, `document.permanently_deleted`, and `employee.profile_photo_changed`.

## Dashboard, Reports, and Self-Service

Main dashboard endpoint:

```text
GET /api/v1/dashboard
```

The dashboard returns permission-safe summaries for employees, documents, attendance, leave, roster, payroll, assets, and recent audit activity. Unauthorized sections return as omitted/null on the client rather than exposing restricted counters.

Report Center endpoints:

```text
GET /api/v1/reports/dashboard
GET /api/v1/reports/employees
GET /api/v1/reports/employees/export.csv
GET /api/v1/reports/documents
GET /api/v1/reports/documents/export.csv
GET /api/v1/reports/attendance
GET /api/v1/reports/attendance/export.csv
GET /api/v1/reports/leave
GET /api/v1/reports/leave/export.csv
GET /api/v1/reports/payroll
GET /api/v1/reports/payroll/export.csv
GET /api/v1/reports/roster
GET /api/v1/reports/roster/export.csv
GET /api/v1/reports/assets
GET /api/v1/reports/assets/export.csv
GET /api/v1/reports/audit
GET /api/v1/reports/audit/export.csv
```

Report exports require export permission and write `report.exported` audit entries. CSV exports use the same filters as the visible report table and avoid password hashes, tokens, R2 keys, private URLs, restricted note content, and unauthorized sensitive document metadata.

Self-service endpoints:

```text
GET /api/v1/self-service/me
GET /api/v1/self-service/profile
GET /api/v1/self-service/documents
GET /api/v1/self-service/attendance
POST /api/v1/self-service/attendance/corrections
GET /api/v1/self-service/leave
GET /api/v1/self-service/payroll
GET /api/v1/self-service/assets
GET /api/v1/self-service/kyc-requests
POST /api/v1/self-service/kyc-requests
GET /api/v1/kyc-requests
POST /api/v1/kyc-requests/:id/approve
POST /api/v1/kyc-requests/:id/reject
```

Self-service derives `employee_id` from the authenticated user. It never accepts a user-supplied employee id for own-record views. Standalone Owner/Super Admin accounts can continue using the admin shell without an employee profile; self-service shows a clear unavailable message.

New schema table:

```text
employee_kyc_update_requests
```

New permissions:

```text
reports.export
self_service.view
self_service.kyc_request
self_service.leave_request
self_service.attendance_correction
```

## Architecture Notes

HRM v2 is a new clean app. The old HRM app is reference-only and is not a dependency.

REST is the source of truth for normal CRUD/system operations. WebSocket/realtime placeholders remain available for future live notifications, dashboard refresh hints, device sync, leave approvals, roster alerts, payroll status updates, asset alerts, and audit/security alerts.

Document uploads are HR/Admin-managed initially. Employee self-upload, OCR/AI extraction, e-signatures, email/SMS/WhatsApp automation, statutory payroll finalization, bank payment generation, and a full mobile app remain future phases.

## Import / Migration Placeholder

Import/migration tooling is intentionally validation-only in this phase. The old HRM application may be used as a reference or backup source, but HRM v2 does not depend on it and does not automatically import from it.

```text
GET /api/v1/migration/status
POST /api/v1/migration/validate-csv-placeholder
```

`GET /api/v1/migration/status` requires `settings.view`. `POST /api/v1/migration/validate-csv-placeholder` requires `settings.manage`, records an audit entry, and returns a no-import validation placeholder response. Prepared placeholder areas are employees, organization data, document metadata, payroll opening balances, and leave balances.

Frontend route:

```text
/settings/import-migration
```

## Production Environment

Required Worker secret:

```text
JWT_SECRET
```

Optional Worker variables:

```text
CORS_ORIGIN
ENVIRONMENT
```

Frontend Pages variable:

```text
VITE_API_BASE_URL=https://your-worker-domain.example.com
```

Do not commit `.env`, `.env.local`, `.dev.vars`, tokens, private keys, R2 object keys, or production secrets. Use `.dev.vars.example` only as a local template.

## Cloudflare Bindings

The Worker keeps these bindings in both `worker/wrangler.toml` and the root `wrangler.toml`. The root config exists so Cloudflare Workers Builds can run `npx wrangler deploy` from the repository root without workspace auto-detection errors.

```toml
[[d1_databases]]
binding = "DB"
database_name = "hrm-v2"
database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"

[[r2_buckets]]
binding = "DOCUMENTS_BUCKET"
bucket_name = "hrm-v2-documents"
```

Backend code uses `env.DB` and `env.DOCUMENTS_BUCKET`.

Create the private R2 bucket once:

```bash
cd worker
npx wrangler r2 bucket create hrm-v2-documents
```

Apply D1 locally:

```bash
npx wrangler d1 execute hrm-v2 --local --config worker/wrangler.toml --file database/schema.sql
npx wrangler d1 execute hrm-v2 --local --config worker/wrangler.toml --file database/seed.sql
```

Apply D1 remotely:

```bash
npx wrangler d1 execute hrm-v2 --remote --config worker/wrangler.toml --file database/schema.sql
npx wrangler d1 execute hrm-v2 --remote --config worker/wrangler.toml --file database/seed.sql
```

## Deployment Commands

Install and verify from the project root:

```bash
npm ci
npm run typecheck
npm run build
```

Run the Worker locally:

```bash
Copy-Item .dev.vars.example worker/.dev.vars
npm run dev:worker
```

Run the frontend locally:

```bash
npm run dev:frontend
```

Worker dry-run and deployment:

```bash
npm --workspace worker run build
npx wrangler deploy --dry-run
cd worker
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

When deploying from Cloudflare Workers Builds with repository root as the working directory, use:

```bash
npm run build
npx wrangler deploy
```

Cloudflare Pages deployment:

```text
Root directory: frontend
Build command: npm run build
Build output directory: dist
Environment variable: VITE_API_BASE_URL
```

## Bootstrap Sequence

1. Create/configure D1 and R2.
2. Set Worker secrets and optional CORS origin.
3. Apply `database/schema.sql`, then `database/seed.sql`.
4. Deploy or run the Worker.
5. Deploy or run the frontend.
6. Open the frontend and complete first Owner/Super Admin setup.
7. Use Users & Access to create roles and users after bootstrap.

## Final Verification Checklist

```text
npm ci
npm run typecheck
npm run build
npx wrangler d1 execute hrm-v2 --local --config worker/wrangler.toml --file database/schema.sql
npx wrangler d1 execute hrm-v2 --local --config worker/wrangler.toml --file database/seed.sql
```

Confirm bootstrap, login, protected app shell, Users & Access, Organization Settings, Employee 360, Document Tracking, Leave, Attendance, Roster, Payroll, Assets & Uniforms, Employee Notes, Audit, Report Center, Self-Service, health, and realtime status routes remain available. Confirm sensitive document metadata is masked unless `documents.sensitive.view` is present and that permission checks are enforced by the Worker, not only by frontend visibility.

## Known Limitations

Automatic migration/import from the old HRM app is not enabled. Employee self-upload for documents, OCR/AI extraction, e-signature workflows, email/SMS/WhatsApp automation, statutory payroll submission, bank payment generation, biometric/device live sync, and a dedicated mobile app are prepared as future phases.

## Cleanup ZIP Rules

Before packaging, remove generated/runtime/source-control artifacts:

```text
.git/
node_modules/
.wrangler/
dist/
build/
.cache/
.turbo/
coverage/
*.log
*.zip inside the package
.env
.env.local
.dev.vars
```

Keep source, package files and lockfiles, `database/schema.sql`, `database/seed.sql`, `worker/wrangler.toml`, `.dev.vars.example`, README, and TypeScript/Tailwind/Vite config files. Create ZIPs with forward-slash paths such as `frontend/src/main.tsx` and `worker/src/index.ts`.

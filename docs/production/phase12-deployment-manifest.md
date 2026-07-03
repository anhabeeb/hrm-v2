# Phase 12 Deployment Manifest

Baseline ZIP: `HRM-v2-performance-observability-phase11-clean.zip`

Phase 12 output ZIP: `HRM-v2-production-readiness-phase12-clean.zip`

## Target Domains

- Frontend: `https://hr.cafeasiana.com.mv`
- API: `https://hr.api.cafeasiana.com.mv`

## Cloudflare Bindings

- D1 binding: `DB`
- D1 database name: `hrm-v2`
- D1 database id: `97f9966e-4fe5-4999-aed7-dc20d75fc89e`
- R2 binding: `DOCUMENTS_BUCKET`
- R2 bucket name: `hrm-v2-documents`

## Required Environment Variables

Names only. Do not store values in source control.

- `CORS_ORIGIN`
- `ENVIRONMENT`
- Auth/session secrets configured in the Cloudflare dashboard or trusted secret store.

## Performance Phase Tables

- `document_upload_sessions`
- `background_jobs`
- `background_job_events`
- `app_events`
- `report_export_artifacts`
- `attendance_summary_snapshots`
- `payroll_summary_snapshots`
- `dashboard_summary_snapshots`
- `performance_api_metrics`
- `performance_frontend_metrics`
- `performance_job_metrics`
- `performance_build_metrics`

## Key Production Endpoints

- `GET /api/v1/health`
- `GET /api/v1/bootstrap/status`
- `GET /api/v1/app-events/since`
- `GET /api/v1/background-jobs`
- `GET /api/v1/performance/overview`
- `POST /api/v1/documents/uploads/prepare`
- `POST /api/v1/documents/uploads/complete`
- `GET /api/v1/reports/artifacts/:artifactId/download`

## Verification Commands

```bash
npm run verify:production-readiness-phase12
npm run audit:production-readiness-phase12
npm run audit:security-permissions-phase12
npm run verify:production-remote-schema-phase12
npm run smoke:production-deployment-phase12
npm run loadtest:production-readiness-phase12
npm run smoke:production-readiness
```

## Rollback Notes

- Roll back Worker and Pages deployments through Cloudflare deployment history.
- Do not remove expanded D1 schema after code has written to it.
- Keep D1/R2 backups outside the repository.

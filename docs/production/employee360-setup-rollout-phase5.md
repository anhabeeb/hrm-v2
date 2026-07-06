# Employee 360 Setup Rollout Phase 5

Phase 5 migrates existing onboarding setup work into the Employee 360 setup readiness model. Employee 360 is now the primary operational path for pending setup, final verification, approval, and activation.

## Operational Routing

- Use **Employees > Employee Setup** to review employees in `PENDING_SETUP`, `PENDING_FINAL_VERIFICATION`, `PENDING_APPROVAL`, and legacy pre-activation statuses.
- Employee rows and setup queue rows open `/employees/:id?setup=1`.
- Legacy onboarding case routes redirect to the Employee 360 setup queue with the legacy case id preserved as a hint when available.
- Old onboarding case records remain available as history and are not dropped or destructively changed.

## Migration Script

Run `npm run migrate:onboarding-to-employee360-setup` for a dry run. Writes require both:

- `HRM_MIGRATE_ONBOARDING_TO_EMPLOYEE360=true`
- `HRM_MIGRATE_CONFIRM=YES`

Optional target variables:

- `HRM_MIGRATE_CASE_ID`
- `HRM_MIGRATE_EMPLOYEE_ID`
- `HRM_MIGRATE_BATCH_LIMIT`
- `HRM_MIGRATE_DRY_RUN=true`

The script writes:

- `docs/production/onboarding-to-employee360-migration-report.md`
- `docs/production/onboarding-to-employee360-migration-summary.json`

## Live Verification

Use `npm run verify:live-employee360-setup-rollout` with production URL and login credentials from environment variables only. The verifier never prints passwords or tokens, does not activate employees, and skips final verification writes unless explicitly enabled for a test employee.

## Activation Safety

Activation still requires the Employee 360 final server verifier. Setup readiness alone is not enough to activate an employee.

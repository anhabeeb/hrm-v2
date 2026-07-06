# Document Requirement Decisions Diagnostics

Generated: 2026-07-06T06:46:24.188Z

## Summary

This diagnostic validates the Phase 3 Employee 360 document requirement decision gate from source. It does not read or write production data.

| Check | Status |
| --- | --- |
| Decision table | PASS |
| Waiver/exemption rule fields | PASS |
| Granular permissions | PASS |
| Decision list builder | PASS |
| Not-required action | PASS |
| Waiver/exemption action | PASS |
| Revoke action | PASS |
| Upload sync | PASS |
| Activation verifier gate | PASS |
| Employee 360 routes | PASS |
| Setup status update returned | PASS |
| Final verification marked stale | PASS |
| Employee 360 evaluator uses gate | PASS |
| Onboarding evaluator uses gate | PASS |
| Employee 360 UI decision table | PASS |

## Operational Notes

- Use `GET /api/v1/employees/:employeeId/document-requirements` to inspect the effective decision list for an employee.
- Missing or expired hard-required documents should stay blocked until a valid document is uploaded.
- Not-required, waived, and exempted decisions are audit logged and mark Employee 360 final verification stale.
- Upload, replace, metadata update, archive, restore, soft-delete, and permanent-delete paths synchronize decision status.
- Visa and Work Permit local/foreign behavior is derived from `document_required_rules`, not hardcoded document type codes.

## Suggested Live Checks

1. Open Employee 360 > Documents for a local employee and confirm foreign-only document rules show Not required.
2. Open Employee 360 > Documents for a foreign employee and confirm Passport/Visa/Work Permit rules block until uploaded or waived.
3. Mark a non-hard requirement Not required and confirm the Documents section updates while Final Verification becomes stale.
4. Upload a required document and confirm the same requirement row changes to Uploaded.
5. Revoke a waiver/not-required decision and confirm the row returns to Missing when no active document exists.

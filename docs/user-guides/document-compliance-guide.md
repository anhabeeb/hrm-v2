# Document Compliance Guide

## Document Types vs Required Document Rules

Document Types define metadata and upload rules. Required Document Rules decide which employees must provide which documents.

## Uploading Documents

Upload one file per document row. Batch upload supports multiple document rows, row-level progress, and retry. Multiple active files are allowed only for document types configured to allow them.

## Expiry and Metadata Rules

Document types can require document number, issue date, expiry date, file upload, allowed MIME types, allowed extensions, max file size, and renewal/expiry warnings.

## Local, Foreign, Other, and Any-Scope Rules

- Local employee example: ID Card, Employment Contract, Medical if configured.
- Foreign employee example: Passport, Visa, Work Permit, Employment Contract, Medical, Insurance, Police Report if configured.
- Other employee rules can be configured separately.
- Any-scope rules apply regardless of local/foreign status.

## Visa and Work Permit Behavior

Visa and Work Permit are foreigner-only by default. Local employees are not blocked by Visa or Work Permit unless a custom rule explicitly requires them. Foreign employees are blocked only when the relevant rules are enabled and required.

## Onboarding Checklist

The onboarding checklist combines default rules, employee-specific overrides, uploaded official documents, waivers, Not Applicable statuses, and disabled module behavior.

## Background Compliance

Document uploads can trigger non-blocking compliance/readiness recalculation. Orphan upload cleanup handles expired pending uploads and failed completion safely.


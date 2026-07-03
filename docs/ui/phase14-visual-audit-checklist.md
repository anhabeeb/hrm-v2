# Phase 14 Visual Audit Checklist

Use this checklist during manual QA after deployment or before accepting a Phase 14 ZIP.

## Global Layout

- Page headers show title, description, and page-level actions without overlapping.
- Page action buttons wrap cleanly on smaller screens.
- Filters sit below headers and keep compact widths.
- No page creates horizontal body overflow.
- Long labels truncate or wrap only where intended.

## Tables and Lists

- Wide tables scroll inside their card/container.
- Header cells do not wrap into uneven multi-line clusters.
- Long status/reference/document text uses a badge, truncation, or controlled wrapping.
- Empty states use the shared empty-state pattern.
- Loading states use skeletons or the shared loader, not raw "Loading..." text.

## Dialogs and Drawers

- Dialogs fit within the viewport.
- Long dialog content scrolls inside the body.
- Dialog headers and footers remain visible where practical.
- Action buttons stay aligned and accessible.
- No dialog uses browser `alert()`, `confirm()`, or `prompt()`.

## Labels and Badges

- Raw system codes are not shown as visible text.
- Statuses such as `READY_FOR_REVIEW` display as "Ready for review".
- Module keys such as `DOCUMENT_COMPLIANCE` display as "Document compliance".
- `NOT_APPLICABLE` displays as "Not applicable".
- Role-like labels such as `SUPER_ADMIN` display as "Super Admin".

## Onboarding Popup

- Employee information remains in the right-side panel.
- Setup sections remain in the sidebar.
- Checklist and approval timeline are not reintroduced into the popup body.
- Required-section completion ticks remain visible.
- Activation stays disabled while readiness is updating.

## Accepted Systems

- Sidebar single-open submenu behavior remains intact.
- Command Center header and KPI icon row remain intact.
- Header search and notification controls remain aligned.
- Global popup alerts auto-dismiss.
- Disabled modules remain hidden/not required as configured.
- Self-service routes remain active-employee enforced.
- Performance phases 1-13 verifier scripts remain available.

## Packaging

- Final ZIP uses forward-slash paths.
- Final ZIP excludes `.git/`, `node_modules/`, generated build folders, logs, env files, secrets, and nested ZIPs.

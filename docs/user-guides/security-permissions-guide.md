# Security and Permissions Guide

## Roles and Permissions

Roles grant actions. Access scopes restrict which employees, departments, locations, and records a user can access.

## Common User Types

- Super Admin: protected account with full administrative authority.
- HR/Admin: manages employee records and configured HR modules.
- Manager: scoped access for own team, department, or location.
- Employee/Self-Service: SELF_ONLY access to own records.

## Employee-User Linking

Employee self-service requires a linked active employee profile and active user account. Super Admin-only accounts may be standalone.

## Sensitive Data Protection

Payroll, bank loan, pension, final settlement, documents, audit logs, report artifacts, and app events require specific permissions and scope enforcement.

## Cache and Isolation

Authenticated HR API responses must not be public cached. Cross-tenant/company data isolation and app event scoping must be preserved.


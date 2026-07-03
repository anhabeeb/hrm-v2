# Troubleshooting Guide

## Login or CORS Issue

Check allowed production origin, credentials behavior, and allowed headers. The x-request-id preflight header must be allowed by CORS.

## Static Assets Returning HTML

Ensure index.html is no-cache and hashed assets are immutable. Purge or refresh deployment cache if a stale index references deleted CSS/JS.

## Disabled Module Not Visible

Check main module toggle, submodule toggle, permission, and direct route blocking. Settings may remain visible for authorized users.

## Search Missing Optional Records

Global search and optional sections filter disabled modules and permissions. Enable the module or grant permission if the record should be visible.

## Attendance Disabled and Payroll

Payroll must not use Attendance data while Attendance is disabled. Use manual payroll adjustments or imports if deductions are required.

## Document Upload Failed

Review row-level status, metadata, file type, file size, document type rule, local/foreign eligibility, and Retry. Do not re-upload repeatedly without checking duplicate rules.

## Background Job Stuck

Check job drawer, retry count, last error, and performance dashboard. Retry only if safe.

## Report Export Not Ready

Large exports run in background. Wait for the artifact status or retry if the job failed.

## Import Validation Errors

Open validation preview, fix row-level errors, upload a corrected file, and apply only valid rows.

## Remote D1 Schema Mismatch

Run remote schema audit/generate/review/apply flow. Use additive repairs only. Do not run destructive SQL or drop production tables from the browser.

## Missing D1 Table, Column, or Index

Generate additive repair SQL after audit confirms the missing object. Review before applying remotely.

## R2 Upload or Object Issue

Check R2 bucket binding, upload status, object existence, and cleanup logs. Do not expose raw R2 keys or private object URLs.

## No Notifications

Check Notification module, rules, routing scope, receive permissions, and alert severity permissions.

## Self-Service Account Not Linked

Link the user to an active employee profile and confirm self-service permissions.

## Role or Permission Denied

Review role permissions, role mapping, access scopes, protected Super Admin rules, and module disabled state.

## Popup or Layout Overflow

Use supported browsers, refresh stale assets, and report the page/modal where overflow occurs.


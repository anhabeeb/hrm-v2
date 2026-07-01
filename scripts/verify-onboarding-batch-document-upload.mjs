import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function check(message, condition) {
  if (!condition) failures.push(message);
}

function includes(file, marker, message) {
  const content = read(file);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function excludes(file, marker, message) {
  const content = read(file);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function blockAfter(file, marker, length = 8000) {
  const content = read(file);
  const start = content.indexOf(marker);
  if (start < 0) {
    failures.push(`${file}: missing block marker ${marker}`);
    return "";
  }
  return content.slice(start, start + length);
}

const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const api = "frontend/src/lib/api.ts";
const lifecycleRoute = "worker/src/routes/lifecycle.ts";
const documentsRoute = "worker/src/routes/documents.ts";
const schema = "database/schema.sql";
const seed = "database/seed.sql";
const wrangler = "worker/wrangler.toml";
const password = "worker/src/auth/password.ts";

const lifecyclePageText = read(lifecyclePage);
const documentFormBlock = blockAfter(lifecyclePage, "function DocumentsWorkspaceForm", 11000);
const lifecycleRouteText = read(lifecycleRoute);
const batchRouteBlock = blockAfter(lifecycleRoute, 'onboardingRoutes.post("/cases/:caseId/documents/batch"', 9000);
const documentsRouteText = read(documentsRoute);
const packageJson = JSON.parse(read("package.json"));

includes(api, "uploadOnboardingWorkspaceDocumentBatch", "frontend API exposes onboarding batch document upload helper");
includes(api, "/api/v1/onboarding/cases/${caseId}/documents/batch", "frontend API calls onboarding batch endpoint");
includes(lifecyclePage, "uploadOnboardingWorkspaceDocumentBatch", "Documents workspace uses batch upload helper");
includes(lifecyclePage, "Add multiple document rows and upload the batch in one action.", "batch upload guidance is visible");
includes(lifecyclePage, "createDocumentBatchRow", "batch rows can be added");
includes(lifecyclePage, "removeRow", "batch rows can be removed");
includes(lifecyclePage, "rowErrors", "batch upload tracks row-level errors");
includes(lifecyclePage, "validateRows", "batch upload validates rows before submit");
includes(lifecyclePage, "form.set(\"metadata\"", "batch upload sends metadata array");
includes(lifecyclePage, "form.set(`file_${index}`", "batch upload sends indexed file fields");
includes(lifecyclePage, "serverErrorsForRows", "server validation errors are mapped to document rows");
includes(lifecyclePage, "documentTypeAllowedMimeTypes", "frontend validates allowed MIME types");
includes(lifecyclePage, "documentTypeMaxFileSizeBytes", "frontend validates max file size");
includes(lifecyclePage, "requiredNumber(type)", "document number is required when document type requires it");
includes(lifecyclePage, "requiredIssue(type)", "issue date is required when document type requires it");
includes(lifecyclePage, "requiredExpiry(type)", "expiry date is required when document type requires it");
includes(lifecyclePage, "expiry_date < row.issue_date", "expiry date cannot be before issue date");
includes(lifecyclePage, "This document type allows only one active file. Remove duplicate rows", "frontend blocks duplicate single-active document rows before upload");
check(`${lifecyclePage}: file inputs must remain single-file per row`, !/<Input[^>]+type="file"[^>]+multiple/.test(documentFormBlock));
check(`${lifecyclePage}: submit button must be disabled while uploading`, /disabled=\{uploading\}/.test(documentFormBlock));
check(`${lifecyclePage}: upload button must not use raw loading text`, !/Uploading\.\.\./.test(documentFormBlock));

includes(lifecycleRoute, '"/cases/:caseId/documents/batch"', "backend batch route exists");
includes(lifecycleRoute, "parseDocumentBatchMetadata", "backend parses metadata array");
includes(lifecycleRoute, "DOCUMENT_BATCH_VALIDATION_FAILED", "backend returns row-level validation envelope");
includes(lifecycleRoute, "file_${rowIndex}", "backend maps each metadata row to an indexed file");
includes(lifecycleRoute, "prepareEmployeeDocumentUpload", "backend reuses official document validation");
includes(lifecycleRoute, "savePreparedEmployeeDocumentUpload", "backend reuses official document save path");
includes(lifecycleRoute, "cleanupEmployeeDocumentUploads", "backend cleans up partial batch saves");
includes(lifecycleRoute, "DUPLICATE_DOCUMENT_TYPE_IN_BATCH", "backend blocks duplicate single-active document rows in a batch");
includes(lifecycleRoute, "onboarding.workspace.documents_batch_uploaded", "batch upload is audited");
includes(lifecycleRoute, "getEmployeeOnboardingReadiness", "batch upload returns refreshed readiness");
includes(lifecycleRoute, "loadOnboardingWorkspace", "batch upload returns refreshed workspace");
includes(lifecycleRoute, "ensureOnboardingDocumentUploadEnabled", "batch upload respects disabled document modules");
check(`${lifecycleRoute}: batch route must validate before storing files`, batchRouteBlock.indexOf("if (validationErrors.length)") < batchRouteBlock.indexOf("savePreparedEmployeeDocumentUpload"));
check(`${lifecycleRoute}: batch route must use all-or-nothing cleanup on save failure`, /catch \(error\)[\s\S]+cleanupEmployeeDocumentUploads/.test(batchRouteBlock));

includes(documentsRoute, "export async function prepareEmployeeDocumentUpload", "document upload preparation helper is exported");
includes(documentsRoute, "export async function savePreparedEmployeeDocumentUpload", "document upload save helper is exported");
includes(documentsRoute, "export async function cleanupEmployeeDocumentUploads", "document upload cleanup helper is exported");
includes(documentsRoute, "validateMetadataIssue", "official metadata rules are reusable");
includes(documentsRoute, "validateFileIssue", "official file rules are reusable");
includes(documentsRoute, "await c.env.DOCUMENTS_BUCKET.put", "R2 file is written by official document flow");
includes(documentsRoute, "await c.env.DOCUMENTS_BUCKET.delete(key).catch", "R2 file is removed when DB write fails");
includes(documentsRoute, "DUPLICATE_DOCUMENT", "existing active single-file document types are still protected");
includes(documentsRoute, "refreshDocumentComplianceQuietly", "document compliance refresh remains active");

includes(schema, "allowed_mime_types TEXT", "document type upload MIME rules are schema-backed");
includes(schema, "allow_multiple_files INTEGER", "document types support single/multiple active file rules");
includes(seed, "doc_required_rule_foreign_visa", "foreign Visa document rule remains seeded");
includes(seed, "doc_required_rule_foreign_work_permit", "foreign Work Permit document rule remains seeded");
includes(seed, "doc_required_rule_local_id_card", "local ID Card document rule remains seeded");
check(`${seed}: Visa rule must remain FOREIGN only`, /doc_required_rule_foreign_visa'[^;]+doc_type_visa'[^;]+'FOREIGN'/.test(read(seed)));
check(`${seed}: Work Permit rule must remain FOREIGN only`, /doc_required_rule_foreign_work_permit'[^;]+doc_type_work_permit'[^;]+'FOREIGN'/.test(read(seed)));

for (const file of [lifecyclePage, api, lifecycleRoute, documentsRoute]) {
  excludes(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be introduced");
  excludes(file, /dark:/, "dark mode classes must not be introduced");
}

includes(password, "ITERATIONS = 100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");

for (const script of [
  "verify:onboarding-batch-document-upload",
  "verify:onboarding-document-payroll-validation",
  "verify:onboarding-workspace",
  "verify:form-action-validation-hardening",
  "verify:global-popup-alerts"
]) {
  check(`package.json: missing ${script} script`, Boolean(packageJson.scripts?.[script]));
}

if (failures.length) {
  console.error("Onboarding batch document upload verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding batch document upload verification passed.");

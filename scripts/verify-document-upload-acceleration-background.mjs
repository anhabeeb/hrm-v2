import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readOptional(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function check(message, condition) {
  if (!condition) failures.push(message);
}

function includes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(content) : content.includes(marker));
}

function excludes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(content) : !content.includes(marker));
}

function readTree(relativeDir) {
  const root = path.join(rootDir, relativeDir);
  if (!fs.existsSync(root)) return "";
  const chunks = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) chunks.push(fs.readFileSync(full, "utf8"));
    }
  }
  return chunks.join("\n");
}

const packageJson = JSON.parse(read("package.json"));
const schema = read("database/schema.sql");
const documentsRoute = read("worker/src/routes/documents.ts");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const hook = read("frontend/src/hooks/useDocumentUploadBatch.ts");
const uploadProgress = read("frontend/src/lib/uploadProgress.ts");
const documentUploadApi = read("frontend/src/lib/documentUploadApi.ts");
const cors = readOptional("worker/src/middleware/cors.ts") + read("worker/src/index.ts");
const http = read("worker/src/utils/http.ts") + read("worker/src/utils/performance.ts");
const password = read("worker/src/auth/password.ts");
const wrangler = read("worker/wrangler.toml");
const frontend = readTree("frontend/src");

check("package.json: verify:document-upload-acceleration-background script is registered", packageJson.scripts?.["verify:document-upload-acceleration-background"] === "node scripts/verify-document-upload-acceleration-background.mjs");

includes("database/schema.sql", "document_upload_sessions", "pending upload tracking table exists");
includes("database/schema.sql", "idx_document_upload_sessions_expiry", "stale upload cleanup index exists");

for (const marker of [
  '"/uploads/prepare"',
  '"/uploads/complete"',
  '"/uploads/:uploadId/file"',
  "prepareDocumentUploadSessions",
  "validatePreparedUploadRow",
  "validateDocumentEmployeeCompatibility",
  "completeDocumentUploadSessions",
  "commitUploadedDocumentSession",
  "cleanupStalePendingDocumentUploads",
  "DOCUMENTS_BUCKET.put",
  "DOCUMENTS_BUCKET.delete",
  "refreshComplianceAfterDocumentChange",
  "runDocumentBackgroundTask",
  "waitUntil",
  "safeDocumentUploadLog"
]) {
  check(`worker/src/routes/documents.ts: ${marker} marker exists`, documentsRoute.includes(marker));
}

for (const marker of [
  '"/cases/:caseId/documents/uploads/prepare"',
  '"/cases/:caseId/documents/uploads/complete"',
  '"/cases/:caseId/documents/batch"',
  "runLifecycleBackgroundTask",
  "onboarding.workspace.documents_background_recalculation",
  "readiness_updating",
  "targeted_workspace_slices"
]) {
  check(`worker/src/routes/lifecycle.ts: ${marker} marker exists`, lifecycleRoute.includes(marker));
}

includes("frontend/src/lib/uploadProgress.ts", "XMLHttpRequest", "frontend upload progress uses XMLHttpRequest for row-level progress");
includes("frontend/src/lib/uploadProgress.ts", "xhr.upload.onprogress", "frontend tracks upload progress events");
includes("frontend/src/lib/documentUploadApi.ts", "prepareOnboardingDocumentUploads", "frontend exposes prepare upload API");
includes("frontend/src/lib/documentUploadApi.ts", "completeOnboardingDocumentUploads", "frontend exposes complete upload API");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Pending", "row status includes Pending");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Preparing", "row status includes Preparing");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Uploading", "row status includes Uploading");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Processing", "row status includes Processing");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Uploaded", "row status includes Uploaded");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Failed", "row status includes Failed");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "Retry", "row status includes Retry");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "fallbackBatchUpload", "legacy batch upload fallback remains wired");
includes("frontend/src/hooks/useDocumentUploadBatch.ts", "direct_r2", "direct R2 mode is guarded");
includes("frontend/src/pages/LifecyclePage.tsx", "useDocumentUploadBatch", "onboarding document workspace uses accelerated upload hook");
includes("frontend/src/pages/LifecyclePage.tsx", "Retry", "failed rows expose retry action");
includes("frontend/src/pages/LifecyclePage.tsx", "Saved. Updating readiness", "UI communicates non-blocking readiness recalculation");
includes("frontend/src/pages/LifecyclePage.tsx", "readinessUpdating", "activation is aware of background readiness state");
includes("frontend/src/pages/LifecyclePage.tsx", "invalidateOnboardingWorkspaceSlices", "upload success refreshes targeted workspace slices");
excludes("frontend/src/pages/LifecyclePage.tsx", "invalidateQueries()", "document upload must not invalidate all app queries");

includes("docs/performance/document-upload-acceleration-phase5.md", "worker_proxy", "Phase 5 documentation covers Worker fallback mode");
includes("docs/performance/document-upload-acceleration-phase5.md", "direct_r2", "Phase 5 documentation covers direct R2 mode as deferred/guarded");
includes("docs/performance/document-upload-acceleration-phase5.md", "Orphan Cleanup", "Phase 5 documentation covers orphan cleanup");

check("frontend code must not expose R2 access keys", !/R2_(ACCESS|SECRET|TOKEN)|AWS_ACCESS_KEY|AWS_SECRET/i.test(frontend));
check("CORS hotfix keeps x-request-id allowed", /x-request-id/i.test(cors));
check("authenticated HR API responses remain private/no-store", /private,\s*no-store/i.test(http + cors + read("worker/src/index.ts")));
check("worker/wrangler.toml: D1 binding name remains DB", /binding\s*=\s*"DB"/.test(wrangler));
check("worker/wrangler.toml: R2 binding name remains DOCUMENTS_BUCKET", /binding\s*=\s*"DOCUMENTS_BUCKET"/.test(wrangler));
check("worker/src/auth/password.ts: PBKDF2 iterations remain 100000", /100000/.test(password));
check("frontend: no browser alert/confirm/prompt", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontend));
check("frontend: dark mode was not introduced", !/\bdark:/.test(frontend));

if (failures.length) {
  console.error("Document upload acceleration/background verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Document upload acceleration/background verifier passed.");

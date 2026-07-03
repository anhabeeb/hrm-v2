import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function readOptional(relativePath) {
  const file = path.join(root, relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function readTree(relativeDir) {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) return "";
  const chunks = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "build", ".wrangler"].includes(entry.name)) stack.push(full);
      } else if (/\.(ts|tsx|js|mjs|md|toml|json)$/.test(entry.name)) {
        chunks.push(fs.readFileSync(full, "utf8"));
      }
    }
  }
  return chunks.join("\n");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function order(content, first, second) {
  const left = content.indexOf(first);
  const right = content.indexOf(second);
  return left >= 0 && right >= 0 && left < right;
}

function lastOrder(content, first, second) {
  const left = content.lastIndexOf(first);
  const right = content.lastIndexOf(second);
  return left >= 0 && right >= 0 && left < right;
}

const packageJson = JSON.parse(read("package.json"));
const helper = read("worker/src/utils/r2-direct-upload.ts");
const documents = read("worker/src/routes/documents.ts");
const admin = read("worker/src/routes/admin.ts");
const adminPage = read("frontend/src/pages/AdminBackupRetentionPage.tsx");
const hook = read("frontend/src/hooks/useDocumentUploadBatch.ts");
const progress = read("frontend/src/lib/uploadProgress.ts");
const documentApi = read("frontend/src/lib/documentUploadApi.ts");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const directDocs = read("docs/performance/direct-r2-uploads-phase18.md");
const phase5Docs = read("docs/performance/document-upload-acceleration-phase5.md");
const operationsDocs = read("docs/user-guides/production-operations-runbook.md");
const phase16Docs = read("docs/production/phase16-backup-restore-disaster-recovery.md");
const r2CorsVerifier = read("scripts/verify-r2-cors-direct-upload-phase18.mjs");
const r2Inventory = read("scripts/backup-r2-inventory-phase16.mjs");
const r2Readiness = read("scripts/verify-r2-restore-readiness-phase16.mjs");
const frontendSource = readTree("frontend/src");

check(packageJson.scripts?.["verify:direct-r2-uploads-phase18"] === "node scripts/verify-direct-r2-uploads-phase18.mjs", "package.json: verify:direct-r2-uploads-phase18 script missing");
check(packageJson.scripts?.["verify:r2-cors-direct-upload-phase18"] === "node scripts/verify-r2-cors-direct-upload-phase18.mjs", "package.json: verify:r2-cors-direct-upload-phase18 script missing");

for (const marker of [
  "DocumentUploadMode",
  '"worker_proxy"',
  '"direct_r2"',
  '"auto"',
  "HRM_DOCUMENT_UPLOAD_MODE",
  "HRM_R2_DIRECT_UPLOAD_ENABLED",
  "HRM_R2_PRESIGN_ENDPOINT",
  "HRM_R2_PRESIGN_ACCESS_KEY_ID",
  "HRM_R2_PRESIGN_SECRET_ACCESS_KEY",
  "HRM_R2_PRESIGN_BUCKET",
  "HRM_R2_PRESIGN_REGION",
  "HRM_R2_PRESIGN_URL_TTL_SECONDS",
  "HRM_R2_DIRECT_UPLOAD_MAX_BYTES",
  "isDirectR2UploadConfigured",
  "resolveDocumentUploadMode",
  "createSecureDocumentObjectKey",
  "createDirectR2PresignedPutUrl",
  "AWS4-HMAC-SHA256",
  "UNSIGNED-PAYLOAD"
]) {
  check(helper.includes(marker), `worker/src/utils/r2-direct-upload.ts: missing ${marker}`);
}

check(/return "worker_proxy";[\s\S]*createDirectR2PresignedPutUrl/.test(helper) || helper.includes("return \"worker_proxy\";"), "direct upload helper must preserve worker_proxy fallback");
check(!/secretAccessKey\s*[:=]\s*["'][^"']+["']/.test(helper), "direct upload helper must not hardcode secret access keys");
check(!/accessKeyId\s*[:=]\s*["'][^"']+["']/.test(helper), "direct upload helper must not hardcode access key ids");
check(!/hrm-v2-documents/.test(helper), "direct upload helper must not hardcode bucket name");

check(schema.includes("document_upload_sessions"), "schema: upload session tracking table missing");
check(schema.includes("upload_mode TEXT"), "schema: upload session upload_mode missing");
check(schema.includes("r2_key TEXT NOT NULL"), "schema: upload session r2_key missing");
check(schema.includes("expires_at TEXT NOT NULL"), "schema: upload session expiry missing");
check(schema.includes("created_by_user_id TEXT"), "schema: upload session actor missing");

for (const marker of [
  "validatePreparedUploadRow",
  "validateDocumentEmployeeCompatibility",
  "DUPLICATE_DOCUMENT_TYPE_IN_BATCH",
  "INSERT INTO document_upload_sessions",
  "resolveDocumentUploadMode",
  "createDirectR2PresignedPutUrl",
  "object_key_ref",
  "pending_object_reference",
  "DOCUMENT_UPLOAD_MODE_MISMATCH",
  "DOCUMENTS_BUCKET.head",
  "DOCUMENT_UPLOAD_OBJECT_MISSING",
  "DOCUMENT_UPLOAD_SIZE_MISMATCH",
  "DOCUMENT_UPLOAD_MIME_MISMATCH",
  "DOCUMENT_UPLOAD_EXPIRED",
  "cleanupStalePendingDocumentUploads",
  "document.upload.prepare_modes",
  "document.upload.direct_presign_failed"
]) {
  check(documents.includes(marker), `worker/src/routes/documents.ts: missing ${marker}`);
}

check(order(documents, "validatePreparedUploadRow", "INSERT INTO document_upload_sessions"), "prepare must validate rows before creating upload sessions");
check(lastOrder(documents, "INSERT INTO document_upload_sessions", "createDirectR2PresignedPutUrl"), "prepare must create D1 session before returning direct upload URL");
check(!documents.includes("object_key: key"), "prepare response must not return raw object_key");
check(!/readString\(body\.object_key|body\.r2_key|body\.storage_key/.test(documents), "complete endpoint must not accept arbitrary object keys from request body");
check(/session\.upload_mode === "direct_r2"[\s\S]*DOCUMENTS_BUCKET\.head/.test(documents), "complete must verify direct R2 object before commit");
check(/isExpiredIso\(session\.expires_at\)[\s\S]*DOCUMENT_UPLOAD_EXPIRED/.test(documents), "expired sessions must be rejected before commit");

for (const marker of [
  "direct_r2",
  "bodyMode: \"raw\"",
  "method: upload.method ?? \"PUT\"",
  "includeRequestId: false",
  "/r2/direct-document-upload",
  "isExpiredUploadTarget",
  "Retry"
]) {
  check(hook.includes(marker), `frontend upload hook: missing ${marker}`);
}

for (const marker of [
  "XMLHttpRequest",
  "xhr.upload.onprogress",
  "method?: \"POST\" | \"PUT\"",
  "bodyMode?: \"form\" | \"raw\"",
  "xhr.send(options.file)"
]) {
  check(progress.includes(marker), `frontend upload progress helper: missing ${marker}`);
}

check(documentApi.includes('"auto"'), "frontend document upload API must accept auto prepare response mode");
check(!/HRM_R2_PRESIGN|R2_PRESIGN|SECRET_ACCESS_KEY|accessKeyId|secretAccessKey/.test(frontendSource), "frontend must not expose R2 presign settings or secrets");
check(!/console\.(log|debug|warn|error)\([^)]*upload_url/i.test(frontendSource), "frontend must not log presigned upload URLs");

for (const marker of [
  "getDocumentUploadModeStatus",
  "document_upload_mode",
  "Document upload mode",
  "Direct configured",
  "Fallback active",
  "R2 CORS check"
]) {
  check((admin + adminPage).includes(marker), `admin upload mode status missing ${marker}`);
}
check(!/(secret|access key|presigned url)/i.test(adminPage.replace(/no secrets|without showing secrets|presigned URLs/gi, "")), "admin upload mode panel must not display secret or URL fields");

for (const marker of [
  "direct upload architecture",
  "Worker fallback",
  "HRM_DOCUMENT_UPLOAD_MODE",
  "HRM_R2_PRESIGN_ENDPOINT",
  "R2 CORS",
  "Object Key Safety",
  "orphan",
  "Troubleshooting",
  "Deferred"
]) {
  check(directDocs.toLowerCase().includes(marker.toLowerCase()), `Phase 18 direct upload docs missing ${marker}`);
}

check(phase5Docs.includes("worker_proxy") && phase5Docs.includes("direct_r2"), "Phase 5 document upload docs regressed");
check(operationsDocs.includes("verify:direct-r2-uploads-phase18"), "operations runbook missing Phase 18 verifier command");
check(phase16Docs.includes("document_upload_sessions.upload_mode"), "Phase 16 backup/restore docs must mention direct upload session classification");
check(r2Inventory.includes("direct_upload_object_pattern"), "Phase 16 R2 inventory must classify direct upload object pattern");
check(r2Readiness.includes("document_upload_sessions.upload_mode"), "Phase 16 R2 restore readiness must check direct upload session mode");
check(r2CorsVerifier.includes("https://hr.cafeasiana.com.mv") && r2CorsVerifier.includes("content-type") && r2CorsVerifier.includes("put"), "R2 CORS verifier must inspect origin/method/header readiness");

check(/private,\s*no-store/i.test(read("worker/src/utils/performance.ts") + read("worker/src/routes/admin.ts") + read("worker/src/index.ts")), "authenticated HR API data must remain private/no-store");
check(/x-request-id/i.test(readOptional("worker/src/middleware/cors.ts") + read("worker/src/index.ts")), "CORS request-id hotfix regressed");
check(read("scripts/verify-cloudflare-queues-phase17.mjs").includes("BACKGROUND_JOB_QUEUE"), "Phase 17 queue verifier missing");
check(read("scripts/verify-backup-restore-retention-phase16.mjs").includes("verify:r2-restore-readiness-phase16"), "Phase 16 backup/restore verifier missing");
check(read("scripts/verify-document-upload-acceleration-background.mjs").includes("useDocumentUploadBatch"), "Phase 5 upload verifier missing");

check(/binding\s*=\s*"DB"/.test(wrangler) && /database_name\s*=\s*"hrm-v2"/.test(wrangler), "D1 binding changed");
check(/binding\s*=\s*"DOCUMENTS_BUCKET"/.test(wrangler), "R2 binding changed");
check(/100000/.test(password), "PBKDF2 iterations changed");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendSource), "browser alert/confirm/prompt was introduced");
check(!/\bdark:/.test(frontendSource), "dark mode classes were introduced");

if (failures.length) {
  console.error("Phase 18 direct R2 upload verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 18 direct R2 upload verification passed.");

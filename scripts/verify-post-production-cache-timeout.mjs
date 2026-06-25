import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function contains(relativePath, marker) {
  check(read(relativePath).includes(marker), `${relativePath} is missing marker: ${marker}`);
}

const packageJson = JSON.parse(read("package.json"));
const requiredScripts = [
  "verify:baseline-prompts1-5",
  "verify:prompt8",
  "verify:prompt9",
  "verify:recovery-prompts6-9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final",
  "verify:prompt13",
  "verify:prompt14",
  "verify:prompt15",
  "verify:prompt16",
  "verify:prompt17",
  "verify:prompt18",
  "verify:prompt19",
  "verify:prompt20",
  "verify:prompt21",
  "verify:prompt22",
  "verify:prompt23"
];

for (const script of requiredScripts) {
  check(Boolean(packageJson.scripts?.[script]), `package.json missing script ${script}`);
}

check(packageJson.scripts?.["verify:cache-timeout"] === "node scripts/verify-post-production-cache-timeout.mjs", "package.json missing verify:cache-timeout script");

[
  "frontend/src/lib/cache/cacheKeys.ts",
  "frontend/src/lib/cache/indexedDbCache.ts",
  "frontend/src/lib/cache/cacheInvalidation.ts",
  "frontend/src/lib/cache/hrmCache.ts",
  "frontend/src/hooks/useIdleTimeout.tsx",
  "worker/src/auth/session.ts",
  "worker/src/db/sync.ts",
  "worker/src/routes/sync.ts"
].forEach((file) => check(exists(file), `${file} must exist`));

contains("frontend/src/lib/cache/hrmCache.ts", "HRM frontend cache is server-authoritative and IndexedDB-assisted");
contains("frontend/src/lib/cache/hrmCache.ts", "getBootstrapPayload");
contains("frontend/src/lib/cache/hrmCache.ts", "getModuleScopedData");
contains("frontend/src/lib/cache/hrmCache.ts", "hydratePageCache");
contains("frontend/src/lib/cache/hrmCache.ts", "refreshModuleCache");
contains("frontend/src/lib/cache/hrmCache.ts", "refreshEntityCache");
contains("frontend/src/lib/cache/hrmCache.ts", "clearSensitiveIndexedDbCaches");
contains("frontend/src/lib/cache/hrmCache.ts", "clearCacheOnPermissionChange");
contains("frontend/src/lib/cache/hrmCache.ts", "getFrontendCacheDiagnostics");
contains("frontend/src/lib/cache/cacheInvalidation.ts", "invalidateCacheForChange");
contains("frontend/src/lib/cache/cacheInvalidation.ts", "invalidateEmployeeCaches");
contains("frontend/src/lib/cache/cacheInvalidation.ts", "invalidateModuleCaches");
contains("frontend/src/lib/cache/cacheInvalidation.ts", "invalidateSelfServiceCaches");
contains("frontend/src/lib/cache/cacheKeys.ts", "CACHE_SCHEMA_VERSION");
contains("frontend/src/lib/cache/cacheKeys.ts", "APP_CACHE_VERSION");

contains("frontend/src/hooks/useAuth.tsx", "clearSensitiveIndexedDbCaches");
contains("frontend/src/hooks/useAuth.tsx", "clearCacheOnPermissionChange");
contains("frontend/src/hooks/useIdleTimeout.tsx", "IdleTimeoutProvider");
contains("frontend/src/hooks/useIdleTimeout.tsx", "useIdleTimeout");
contains("frontend/src/hooks/useIdleTimeout.tsx", "Session timeout warning");
contains("frontend/src/hooks/useIdleTimeout.tsx", "You were logged out due to inactivity.");
contains("frontend/src/app/App.tsx", "IdleTimeoutProvider");

contains("worker/src/auth/session.ts", "getSecuritySessionSettings");
contains("worker/src/auth/session.ts", "validateSessionExpiry");
contains("worker/src/auth/session.ts", "updateSessionLastSeen");
contains("worker/src/auth/session.ts", "expireSessionForIdleTimeout");
contains("worker/src/auth/session.ts", "createSessionTimeoutSecurityEvent");
contains("worker/src/middleware/auth.ts", "validateSessionExpiry");
contains("worker/src/routes/auth.ts", "/session-settings");
contains("worker/src/routes/auth.ts", "/session-timeout");

contains("worker/src/db/sync.ts", "createSyncChangeLogEntry");
contains("worker/src/db/sync.ts", "getChangesSinceVersion");
contains("worker/src/db/sync.ts", "filterSyncChangesForUserScope");
contains("worker/src/db/sync.ts", "pullChangedEntitiesForUser");
contains("worker/src/db/sync.ts", "getCurrentSyncVersion");
contains("worker/src/db/sync.ts", "createSyncTombstone");
contains("worker/src/db/sync.ts", "syncWriteMetadata");
contains("worker/src/routes/sync.ts", "/bootstrap");
contains("worker/src/routes/sync.ts", "/module/:moduleKey");
contains("worker/src/routes/sync.ts", "/entity/:entityType/:entityId");
contains("worker/src/routes/sync.ts", "/changes");
contains("worker/src/routes/sync.ts", "/pull");
contains("worker/src/routes/sync.ts", "/pull-entities");
contains("worker/src/index.ts", "/api/v1/sync");

contains("database/schema.sql", "CREATE TABLE IF NOT EXISTS sync_change_log");
contains("database/schema.sql", "idle_timeout_enabled INTEGER NOT NULL DEFAULT 1");
contains("database/schema.sql", "idle_timeout_minutes INTEGER NOT NULL DEFAULT 15");
contains("database/schema.sql", "warn_before_logout_seconds INTEGER NOT NULL DEFAULT 60");
contains("database/schema.sql", "sensitive_page_idle_timeout_minutes INTEGER NOT NULL DEFAULT 10");
contains("database/seed.sql", "'security_settings_default', 480, 1, 15, 60");

contains("frontend/src/pages/AdminSettingsPage.tsx", "Cache & Sync");
contains("frontend/src/pages/AdminSettingsPage.tsx", "Idle timeout enabled");
contains("frontend/src/pages/AdminSettingsPage.tsx", "Clear current browser cache");
contains("frontend/src/pages/AdminSettingsPage.tsx", "Server-authoritative hybrid cache");

contains("worker/wrangler.toml", 'database_name = "hrm-v2"');
contains("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"');
contains("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"');
contains("worker/src/auth/password.ts", "MAX_WORKER_PBKDF2_ITERATIONS = 100000");
contains("frontend/vite.config.ts", "manualChunks");
contains("frontend/src/components/ui/page-shell.tsx", "PageHeader");

const frontendFiles = [];
function collectFrontend(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFrontend(full);
    if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) frontendFiles.push(full);
  }
}
collectFrontend(path.join(root, "frontend/src"));
const browserDialogPattern = /(^|[^\w.])(window\.)?(alert|confirm|prompt)\s*\(/;
for (const file of frontendFiles) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (browserDialogPattern.test(line)) {
      failures.push(`${path.relative(root, file)}:${index + 1} contains a browser dialog call`);
    }
  });
}

if (failures.length) {
  console.error("Post-production cache/timeout verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Post-production cache/timeout verification passed.");

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listFiles(dir, extension) {
  const absoluteDir = path.join(root, dir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { recursive: true })
    .filter((entry) => String(entry).endsWith(extension))
    .map((entry) => path.join(dir, String(entry)).replaceAll("\\", "/"));
}

function getAssetReferences(indexHtml) {
  return Array.from(indexHtml.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)).map((match) => match[1].replace(/^\/+/, ""));
}

function assetSize(assetPath) {
  return fs.statSync(path.join(root, "frontend", "dist", assetPath)).size;
}

function uniqueVersionsFromLock(packageName) {
  const lock = JSON.parse(read("package-lock.json"));
  const versions = new Set();
  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    if (packagePath === `node_modules/${packageName}` || packagePath.endsWith(`/node_modules/${packageName}`)) {
      if (metadata && typeof metadata === "object" && "version" in metadata) {
        versions.add(String(metadata.version));
      }
    }
  }
  return versions;
}

function staticImports(source) {
  const imports = [];
  const importPattern = /\bimport\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  let match;
  while ((match = importPattern.exec(source))) imports.push(match[1]);
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicPattern.exec(source))) imports.push(match[1]);
  return imports;
}

function hasPath(start, target, graph, seen = new Set()) {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  for (const next of graph.get(start) ?? []) {
    if (hasPath(next, target, graph, seen)) return true;
  }
  return false;
}

function buildChunkGraph() {
  const builtAssets = listFiles("frontend/dist/assets", ".js");
  const graph = new Map();
  const chunkByBaseName = new Map(builtAssets.map((file) => [path.basename(file), file]));
  for (const file of builtAssets) {
    const source = read(file);
    const importedChunks = new Set();
    for (const specifier of staticImports(source)) {
      if (specifier.startsWith("./")) {
        const resolved = path.basename(specifier);
        if (chunkByBaseName.has(resolved)) importedChunks.add(chunkByBaseName.get(resolved));
      }
    }
    graph.set(file, importedChunks);
  }
  return { builtAssets, graph };
}

const packageJson = JSON.parse(read("package.json"));
assert(packageJson.scripts?.["audit:frontend-bundle-performance"] === "node scripts/audit-frontend-bundle-performance.mjs", "audit:frontend-bundle-performance script is missing.");
assert(packageJson.scripts?.["verify:frontend-bundle-performance-phase10"] === "node scripts/verify-frontend-bundle-performance-phase10.mjs", "verify:frontend-bundle-performance-phase10 script is missing.");
assert(exists("scripts/audit-frontend-bundle-performance.mjs"), "Frontend bundle audit script is missing.");
assert(exists("docs/performance/frontend-bundle-phase10.md"), "Frontend bundle Phase 10 report is missing; run npm run audit:frontend-bundle-performance.");

const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
assert(appRoutes.includes("import { lazy") && appRoutes.includes("lazy(load)"), "AppRoutes must use React lazy route splitting.");
assert(appRoutes.includes("lazyPage"), "AppRoutes must keep preload-capable lazyPage route splitting.");
assert(appRoutes.includes("Suspense"), "AppRoutes must keep a Suspense boundary for lazy routes.");
for (const marker of [
  "EmployeeProfilePage",
  "LifecyclePage",
  "AttendanceRecordsPage",
  "RosterWeeklyPage",
  "PayrollDashboardPage",
  "PayrollRunDetailPage",
  "PayrollAdminPages",
  "DataTransferPage",
  "ReportsPage",
  "AdminSettingsPage",
  "AuditLogPage"
]) {
  assert(appRoutes.includes(`../pages/${marker}`), `${marker} must remain lazy-routed.`);
}
for (const preloadKey of [
  "employee-profile",
  "employees",
  "attendance",
  "roster",
  "payroll",
  "reports",
  "data-transfer",
  "documents",
  "settings",
  "self-service"
]) {
  assert(appRoutes.includes(`"${preloadKey}"`), `Route preload key ${preloadKey} is missing.`);
}

const useAuth = read("frontend/src/hooks/useAuth.tsx");
assert(useAuth.includes("../lib/authApi"), "Auth startup must use the slim auth API wrapper.");
assert(!useAuth.includes("../lib/api\"") && !useAuth.includes("../lib/api'"), "Auth startup must not statically import the broad HRM API.");
assert(/import\(\s*["']\.\.\/lib\/preloadReferenceData["']\s*\)/.test(useAuth), "Reference data preload must be lazy-loaded after auth.");

assert(read("frontend/src/components/global/GlobalSearch.tsx").includes("../../lib/globalSearchApi"), "Global search must use a slim startup API wrapper.");
assert(read("frontend/src/components/global/NotificationBell.tsx").includes("../../lib/notificationsApi"), "Notification bell must use a slim startup API wrapper.");
assert(read("frontend/src/lib/appEventsApi.ts").includes("./apiClient"), "App events API must use apiClient directly.");
assert(read("frontend/src/lib/backgroundJobsApi.ts").includes("./apiClient"), "Background jobs API must use apiClient directly.");
assert(read("frontend/src/hooks/useIdleTimeout.tsx").includes("../lib/sessionApi"), "Idle timeout must use the slim session API wrapper.");
const hrmCache = read("frontend/src/lib/cache/hrmCache.ts");
assert(!/import\s+\{\s*api\s*\}\s+from\s+["']\.\.\/api["']/.test(hrmCache), "HRM cache must not statically import the broad HRM API.");
assert(hrmCache.includes('import("../api")'), "HRM cache should lazy-load the broad HRM API only when needed.");

const backgroundJobIndicator = read("frontend/src/components/jobs/BackgroundJobIndicator.tsx");
assert(backgroundJobIndicator.includes("lazy("), "Background job drawer must be lazy-loaded.");
assert(backgroundJobIndicator.includes("BackgroundJobDrawer"), "Background job drawer lazy marker missing.");

const routePreload = read("frontend/src/lib/routePreload.ts");
for (const marker of ["preloadRouteChunk", "canPrefetchRouteChunks", "prefetchedRouteChunks", "saveData", "effectiveType", "slow-2g"]) {
  assert(routePreload.includes(marker), `Route prefetch guard ${marker} is missing.`);
}
const appShell = read("frontend/src/layouts/AppShell.tsx");
for (const marker of ["preloadLikelyRoute", "preloadKey", "onMouseEnter", "onFocus", "requestIdleCallback"]) {
  assert(appShell.includes(marker), `AppShell route prefetch marker ${marker} is missing.`);
}

const viteConfig = read("frontend/vite.config.ts");
assert(viteConfig.includes('["react", "react-dom", "scheduler"].includes(packageName)'), "React, React DOM, and scheduler must share react-vendor.");
assert(!viteConfig.includes('id.includes("react")') && !viteConfig.includes("id.includes('react')"), "Vite manualChunks must not substring-match react.");
assert(viteConfig.includes('packageName.startsWith("@radix-ui/")'), "Radix/shadcn dependencies should stay in ui-vendor.");

const reactVersions = uniqueVersionsFromLock("react");
const reactDomVersions = uniqueVersionsFromLock("react-dom");
assert(reactVersions.size === 1, `Expected one React version, found ${Array.from(reactVersions).join(", ") || "none"}.`);
assert(reactDomVersions.size === 1, `Expected one React DOM version, found ${Array.from(reactDomVersions).join(", ") || "none"}.`);
assert(Array.from(reactVersions)[0].split(".")[0] === Array.from(reactDomVersions)[0].split(".")[0], "React and React DOM major versions must match.");

assert(exists("frontend/dist/index.html"), "frontend/dist/index.html is missing. Run npm run build first.");
const indexHtml = read("frontend/dist/index.html");
const references = getAssetReferences(indexHtml);
assert(references.length > 0, "Built index.html has no JS/CSS asset references.");
for (const reference of references) {
  assert(exists(path.join("frontend/dist", reference)), `Built index.html references missing asset ${reference}.`);
}
const mainEntry = references.find((reference) => /^assets\/index-.*\.js$/.test(reference));
assert(mainEntry, "Main app entry asset is missing from index.html.");
const initialJs = references.filter((reference) => reference.endsWith(".js"));
const initialJsBytes = initialJs.reduce((sum, reference) => sum + assetSize(reference), 0);
const initialCssBytes = references.filter((reference) => reference.endsWith(".css")).reduce((sum, reference) => sum + assetSize(reference), 0);
const mainEntryBytes = assetSize(mainEntry);
assert(mainEntryBytes <= 165000, `Main entry is too large for Phase 10 budget: ${mainEntryBytes} bytes.`);
assert(initialJsBytes <= 500000, `Initial JS referenced by index.html is too large: ${initialJsBytes} bytes.`);
assert(initialCssBytes <= 80000, `Initial CSS referenced by index.html is too large: ${initialCssBytes} bytes.`);

const assets = listFiles("frontend/dist/assets", ".js");
for (const marker of ["EmployeeProfilePage", "LifecyclePage", "PayrollRunDetailPage", "PayrollAdminPages", "DataTransferPage", "AttendanceRecordsPage", "RosterWeeklyPage"]) {
  assert(assets.some((asset) => path.basename(asset).startsWith(marker)), `Lazy route chunk for ${marker} is missing.`);
}
assert(assets.some((asset) => path.basename(asset).startsWith("api-")), "The broad HRM API must be split into its own lazy chunk.");
const mainSource = read(path.join("frontend/dist", mainEntry));
for (const forbidden of ["/api/v1/payroll/runs", "/api/v1/data-transfer/imports", "createDataImportBatch", "listEmployeeDocuments", "listEmployeeNotes"]) {
  assert(!mainSource.includes(forbidden), `Main app entry still contains broad API/page code marker ${forbidden}.`);
}

const { builtAssets, graph } = buildChunkGraph();
const reactVendorChunks = builtAssets.filter((file) => path.basename(file).startsWith("react-vendor-"));
const vendorChunks = builtAssets.filter((file) => path.basename(file).startsWith("vendor-"));
assert(reactVendorChunks.length === 1, `Expected one react-vendor chunk, found ${reactVendorChunks.length}.`);
assert(vendorChunks.length === 1, `Expected one vendor chunk, found ${vendorChunks.length}.`);
assert(!hasPath(reactVendorChunks[0], vendorChunks[0], graph), "react-vendor must not import vendor.");
assert(!(hasPath(vendorChunks[0], reactVendorChunks[0], graph) && hasPath(reactVendorChunks[0], vendorChunks[0], graph)), "Circular chunk dependency detected between vendor and react-vendor.");
assert(read(reactVendorChunks[0]).includes("useLayoutEffect"), "react-vendor chunk should contain React hook exports, including useLayoutEffect.");

const allBuiltJs = builtAssets.map(read).join("\n");
assert(!/ReactQueryDevtools|@tanstack\/react-query-devtools/.test(allBuiltJs), "React Query devtools must not ship in production chunks.");

const headers = read("frontend/public/_headers");
assert(/\/index\.html[\s\S]*Cache-Control:\s*no-cache/s.test(headers), "index.html no-cache header is missing.");
assert(/(^|\n)\/\*[\s\S]*Cache-Control:\s*no-cache/s.test(headers), "SPA route no-cache header is missing.");
assert(/\/assets\/\*[\s\S]*Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/s.test(headers), "Immutable hashed asset cache header is missing.");
const redirects = read("frontend/public/_redirects");
assert(redirects.indexOf("/assets/* /assets/:splat 200") !== -1, "Static asset redirect guard is missing.");
assert(redirects.indexOf("/* /index.html 200") > redirects.indexOf("/assets/* /assets/:splat 200"), "SPA fallback must not intercept hashed assets.");

const apiClient = read("frontend/src/lib/apiClient.ts");
assert(apiClient.includes('"X-Request-ID"') && apiClient.includes("createApiRequestId"), "Request ID instrumentation must be preserved.");
assert(apiClient.includes("recordApiRequestTiming"), "API timing instrumentation must be preserved.");
assert(apiClient.includes('cache: method === "GET" ? "no-store"'), "Authenticated GET requests must remain no-store.");
const workerPerformance = read("worker/src/utils/performance.ts");
assert(workerPerformance.includes("private, no-store"), "Authenticated Worker timing middleware must remain private/no-store.");

for (const script of [
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:d1-query-payload-optimization",
  "verify:document-upload-acceleration-background",
  "verify:large-list-table-performance",
  "verify:background-jobs-phase7",
  "verify:reports-imports-snapshots-phase8",
  "verify:realtime-events-phase9",
  "verify:cors-request-id-hotfix",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity"
]) {
  assert(packageJson.scripts?.[script], `${script} script is missing.`);
}

const frontendSources = listFiles("frontend/src", ".tsx").concat(listFiles("frontend/src", ".ts")).map((file) => read(file)).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendSources), "Frontend source must not use browser alert/confirm/prompt.");
assert(!/dark:/.test(frontendSources), "Frontend source must not introduce dark mode classes.");

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('binding = "DB"'), "D1 binding changed.");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('binding = "DOCUMENTS_BUCKET"'), "R2 binding changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const workerSources = listFiles("worker/src", ".ts").map((file) => read(file)).join("\n");
assert(workerSources.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!workerSources.includes("PBKDF2_ITERATIONS = 210000"), "PBKDF2 iteration regression detected.");

console.log(`Frontend bundle Phase 10 verification passed. Main entry ${mainEntryBytes} bytes, initial JS ${initialJsBytes} bytes.`);

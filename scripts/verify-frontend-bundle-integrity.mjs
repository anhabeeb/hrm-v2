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
  if (!condition) {
    throw new Error(message);
  }
}

function listFiles(dir, extension) {
  const absoluteDir = path.join(root, dir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { recursive: true })
    .filter((entry) => String(entry).endsWith(extension))
    .map((entry) => path.join(dir, String(entry)).replaceAll("\\", "/"));
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
  while ((match = importPattern.exec(source))) {
    imports.push(match[1]);
  }
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicPattern.exec(source))) {
    imports.push(match[1]);
  }
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

const viteConfig = read("frontend/vite.config.ts");
assert(viteConfig.includes("getNodeModulePackageName"), "Vite config must classify chunks by package name.");
assert(!viteConfig.includes('id.includes("react")'), "Vite manualChunks must not substring-match react.");
assert(!viteConfig.includes("id.includes('react')"), "Vite manualChunks must not substring-match react.");
assert(viteConfig.includes('["react", "react-dom", "scheduler"].includes(packageName)'), "React, React DOM, and scheduler must share react-vendor.");
assert(viteConfig.includes('packageName.startsWith("@radix-ui/")'), "Radix/shadcn dependencies must not be accidentally placed in react-vendor by substring matching.");

const reactVersions = uniqueVersionsFromLock("react");
const reactDomVersions = uniqueVersionsFromLock("react-dom");
assert(reactVersions.size === 1, `Expected one React version, found ${Array.from(reactVersions).join(", ") || "none"}.`);
assert(reactDomVersions.size === 1, `Expected one React DOM version, found ${Array.from(reactDomVersions).join(", ") || "none"}.`);
const [reactVersion] = reactVersions;
const [reactDomVersion] = reactDomVersions;
assert(reactVersion.split(".")[0] === reactDomVersion.split(".")[0], `React ${reactVersion} and React DOM ${reactDomVersion} must be compatible major versions.`);

assert(exists("frontend/dist/index.html"), "frontend/dist/index.html is missing; run npm run build first.");
const distIndex = read("frontend/dist/index.html");
const assetReferences = Array.from(distIndex.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)).map((match) => match[1]);
assert(assetReferences.length > 0, "Built index.html does not reference JS/CSS assets.");
for (const asset of assetReferences) {
  assert(exists(path.join("frontend/dist", asset)), `Built index.html references missing asset ${asset}.`);
}

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

const reactVendorChunks = builtAssets.filter((file) => path.basename(file).startsWith("react-vendor-"));
const vendorChunks = builtAssets.filter((file) => path.basename(file).startsWith("vendor-"));
assert(reactVendorChunks.length === 1, `Expected one react-vendor chunk, found ${reactVendorChunks.length}.`);
assert(vendorChunks.length === 1, `Expected one vendor chunk, found ${vendorChunks.length}.`);
const [reactVendorChunk] = reactVendorChunks;
const [vendorChunk] = vendorChunks;
assert(!hasPath(reactVendorChunk, vendorChunk, graph), "react-vendor must not import vendor.");
assert(!(hasPath(vendorChunk, reactVendorChunk, graph) && hasPath(reactVendorChunk, vendorChunk, graph)), "Circular chunk dependency detected between vendor and react-vendor.");

const reactVendorSource = read(reactVendorChunk);
assert(reactVendorSource.includes("useLayoutEffect"), "react-vendor chunk should contain React hook exports, including useLayoutEffect.");

const headers = read("frontend/public/_headers");
assert(/\/index\.html\s+Cache-Control:\s*no-cache/s.test(headers), "index.html no-cache header is missing.");
assert(/(^|\n)\/\*\s+Cache-Control:\s*no-cache/s.test(headers), "SPA route wildcard no-cache header is missing.");
assert(/\/index\.html\s+Cache-Control:[^\n]*no-store/s.test(headers), "index.html no-store header is missing.");
assert(/(^|\n)\/\*\s+Cache-Control:[^\n]*no-store/s.test(headers), "SPA route wildcard no-store header is missing.");
assert(/\/index\.html[\s\S]*Pragma:\s*no-cache/s.test(headers), "index.html Pragma no-cache header is missing.");
assert(/\/index\.html[\s\S]*Expires:\s*0/s.test(headers), "index.html Expires 0 header is missing.");
assert(/(^|\n)\/\*[\s\S]*Pragma:\s*no-cache/s.test(headers), "SPA route wildcard Pragma no-cache header is missing.");
assert(/(^|\n)\/\*[\s\S]*Expires:\s*0/s.test(headers), "SPA route wildcard Expires 0 header is missing.");
assert(/\/assets\/\*\s+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/s.test(headers), "immutable asset cache header is missing.");
assert(/\/assets\/\*[\s\S]*X-Content-Type-Options:\s*nosniff/s.test(headers), "asset nosniff header is missing.");
assert(/\/favicon\.ico\s+Cache-Control:\s*public,\s*max-age=86400/s.test(headers), "favicon cache header is missing.");

assert(exists("frontend/public/_redirects"), "frontend/public/_redirects is missing.");
const redirects = read("frontend/public/_redirects");
const assetRedirectIndex = redirects.indexOf("/assets/* /assets/:splat 200");
const faviconRedirectIndex = redirects.indexOf("/favicon.ico /favicon.ico 200");
const spaFallbackIndex = redirects.indexOf("/* /index.html 200");
assert(assetRedirectIndex !== -1, "Pages redirects must include an /assets/* static asset guard.");
assert(faviconRedirectIndex !== -1, "Pages redirects must include a favicon static asset guard.");
assert(spaFallbackIndex !== -1, "Pages redirects must include the SPA fallback.");
assert(assetRedirectIndex < spaFallbackIndex, "The /assets/* redirect guard must appear before the SPA fallback.");
assert(faviconRedirectIndex < spaFallbackIndex, "The favicon redirect guard must appear before the SPA fallback.");
assert(exists("frontend/dist/_headers"), "Built Pages output must include _headers.");
assert(exists("frontend/dist/_redirects"), "Built Pages output must include _redirects.");

const frontendSources = listFiles("frontend/src", ".tsx").concat(listFiles("frontend/src", ".ts")).map((file) => `${file}\n${read(file)}`).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendSources), "Frontend source must not use browser alert/confirm/prompt.");
assert(!/dark:/.test(frontendSources), "Frontend source must not introduce dark mode classes.");

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const workerSources = listFiles("worker/src", ".ts").map(read).join("\n");
assert(workerSources.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!workerSources.includes("PBKDF2_ITERATIONS = 210000"), "PBKDF2 iteration regression detected.");

assert(exists("scripts/verify-command-center-dashboard.mjs"), "Command Center verifier is missing.");
assert(exists("scripts/verify-filter-search-date-standardization.mjs"), "Filter/search/date verifier is missing.");

console.log("Frontend bundle integrity verification passed.");

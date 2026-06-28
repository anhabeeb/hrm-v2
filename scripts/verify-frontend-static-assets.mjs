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

const headersPath = "frontend/public/_headers";
const redirectsPath = "frontend/public/_redirects";
const faviconPath = "frontend/public/favicon.ico";
const indexPath = "frontend/index.html";
const distIndexPath = "frontend/dist/index.html";

assert(exists(headersPath), "frontend/public/_headers is missing.");
assert(exists(redirectsPath), "frontend/public/_redirects is missing.");
assert(exists(faviconPath), "frontend/public/favicon.ico is missing.");
assert(exists(indexPath), "frontend/index.html is missing.");
assert(exists(distIndexPath), "frontend/dist/index.html is missing. Run npm run build before this verifier.");

const headers = read(headersPath);
const wildcardHeaderIndex = headers.indexOf("/*");
const assetsHeaderIndex = headers.indexOf("/assets/*");
const indexHeaderIndex = headers.indexOf("/index.html");
const faviconHeaderIndex = headers.indexOf("/favicon.ico");

assert(wildcardHeaderIndex !== -1, "_headers must include /* for SPA document routes.");
assert(assetsHeaderIndex !== -1, "_headers must include /assets/*.");
assert(indexHeaderIndex !== -1, "_headers must include /index.html.");
assert(faviconHeaderIndex !== -1, "_headers must include /favicon.ico.");
assert(assetsHeaderIndex > wildcardHeaderIndex, "/assets/* header rule must appear after /* so immutable asset cache wins.");
assert(faviconHeaderIndex > wildcardHeaderIndex, "/favicon.ico header rule must appear after /* so the icon cache rule wins.");
assert(/\/\*[\s\S]*?Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/.test(headers), "SPA wildcard route must be no-cache, no-store, must-revalidate.");
assert(/\/\*[\s\S]*?X-Content-Type-Options:\s*nosniff/.test(headers), "SPA wildcard route must set nosniff.");
assert(/\/\*[\s\S]*?Referrer-Policy:\s*strict-origin-when-cross-origin/.test(headers), "SPA wildcard route must set Referrer-Policy.");
assert(/\/assets\/\*[\s\S]*?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/.test(headers), "/assets/* must use immutable caching.");
assert(/\/assets\/\*[\s\S]*?X-Content-Type-Options:\s*nosniff/.test(headers), "/assets/* must set nosniff.");
assert(/\/index\.html[\s\S]*?Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/.test(headers), "/index.html must be no-cache, no-store, must-revalidate.");
assert(/\/favicon\.ico[\s\S]*?Cache-Control:\s*public,\s*max-age=86400/.test(headers), "/favicon.ico cache rule is missing.");
assert(/\/favicon\.ico[\s\S]*?X-Content-Type-Options:\s*nosniff/.test(headers), "/favicon.ico must set nosniff.");

const redirects = read(redirectsPath);
const assetRedirectIndex = redirects.indexOf("/assets/* /assets/:splat 200");
const faviconRedirectIndex = redirects.indexOf("/favicon.ico /favicon.ico 200");
const spaFallbackIndex = redirects.indexOf("/* /index.html 200");
assert(assetRedirectIndex !== -1, "_redirects must prevent /assets/* from falling through to /index.html.");
assert(faviconRedirectIndex !== -1, "_redirects must serve /favicon.ico before the SPA fallback.");
assert(spaFallbackIndex !== -1, "_redirects must include SPA fallback /* /index.html 200.");
assert(assetRedirectIndex < spaFallbackIndex, "/assets/* redirect must be before SPA fallback.");
assert(faviconRedirectIndex < spaFallbackIndex, "/favicon.ico redirect must be before SPA fallback.");

const favicon = fs.readFileSync(path.join(root, faviconPath));
assert(favicon.length > 22, "favicon.ico is unexpectedly small.");
assert(favicon[0] === 0 && favicon[1] === 0 && favicon[2] === 1 && favicon[3] === 0, "favicon.ico is not a valid ICO file.");
assert(read(indexPath).includes('<link rel="icon" href="/favicon.ico" />'), "frontend/index.html must reference /favicon.ico.");

const distIndex = read(distIndexPath);
assert(distIndex.includes('href="/favicon.ico"'), "Built index.html must reference /favicon.ico.");
const assetReferences = Array.from(distIndex.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)).map((match) => match[1]);
assert(assetReferences.length > 0, "Built index.html does not reference CSS/JS assets.");
for (const asset of assetReferences) {
  assert(exists(path.join("frontend/dist", asset)), `Built index.html references missing asset ${asset}.`);
}

const cssAssets = listFiles("frontend/dist/assets", ".css");
const jsAssets = listFiles("frontend/dist/assets", ".js");
assert(cssAssets.length > 0, "Built frontend/dist/assets has no CSS assets.");
assert(jsAssets.length > 0, "Built frontend/dist/assets has no JS assets.");

assert(exists("frontend/dist/_headers"), "Built Pages output must include _headers.");
assert(exists("frontend/dist/_redirects"), "Built Pages output must include _redirects.");

const frontendSources = listFiles("frontend/src", ".tsx").concat(listFiles("frontend/src", ".ts")).map((file) => read(file)).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendSources), "Frontend source must not use browser alert/confirm/prompt.");

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const workerSources = listFiles("worker/src", ".ts").map((file) => read(file)).join("\n");
assert(workerSources.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!workerSources.includes("PBKDF2_ITERATIONS = 210000"), "PBKDF2 iteration regression detected.");

console.log("Frontend static asset verification passed.");

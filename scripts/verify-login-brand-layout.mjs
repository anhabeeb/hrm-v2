import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function hash(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath(relativePath))).digest("hex").toUpperCase();
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function has(relativePath, marker, message) {
  if (!exists(relativePath)) {
    failures.push(`${relativePath}: missing file`);
    return;
  }
  const source = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(source) : source.includes(marker);
  check(ok, `${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  if (!exists(relativePath)) return;
  const source = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(source) : !source.includes(marker);
  check(ok, `${relativePath}: ${message}`);
}

function collectFiles(dir) {
  const fullDir = filePath(dir);
  if (!fs.existsSync(fullDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".wrangler"].includes(entry.name)) continue;
    const relative = path.join(dir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...collectFiles(relative));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const pkg = JSON.parse(read("package.json"));
check(pkg.scripts?.["verify:login-brand-layout"] === "node scripts/verify-login-brand-layout.mjs", "package.json: missing verify:login-brand-layout script.");

const animationPath = "frontend/public/brand/omnicore-logo-animation.svg";
const faviconPath = "frontend/public/brand/omnicore-favicon.svg";
check(exists(animationPath), "animated OmniCore logo asset is missing.");
check(exists(faviconPath), "SVG favicon asset is missing.");

if (exists(animationPath)) {
  const animation = read(animationPath);
  check(hash(animationPath) === "C257AD68F7046667D33B8CABBB0DCAD64631F2439106629460A673427A4C7753", "animated logo SVG hash changed; the supplied animation must remain unmodified.");
  check(animation.includes("<svg"), "animated logo must remain an SVG.");
  check(/<animate|<animateTransform/.test(animation), "animated logo must retain SVG animation elements.");
}

if (exists(faviconPath)) {
  const favicon = read(faviconPath);
  check(hash(faviconPath) === "97FB06126E6314F3F418D9B20F9143541DEF2CAF2D4716B57A738CCCD683097B", "favicon SVG hash changed; the supplied artwork must remain unmodified.");
  check(favicon.includes("<svg"), "favicon must remain an SVG.");
}

has("frontend/index.html", '<link rel="icon" type="image/svg+xml" href="/brand/omnicore-favicon.svg" />', "SVG favicon link missing.");
has("frontend/index.html", '<link rel="icon" href="/favicon.ico" />', "ICO fallback favicon link missing.");
has("frontend/index.html", "<title>OmniCore - HR</title>", "browser title must remain OmniCore - HR.");
has("frontend/index.html", 'name="application-name" content="OmniCore - HR"', "application metadata must remain OmniCore - HR.");
has("frontend/index.html", "Enterprise HR, payroll, attendance, onboarding, and workforce operations platform.", "meta description changed.");

has("frontend/public/_headers", "/brand/*", "brand asset cache header missing.");
has("frontend/public/_headers", /\/brand\/\*\s+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable\s+X-Content-Type-Options:\s*nosniff/s, "brand assets must use immutable cache and nosniff.");
has("frontend/public/_redirects", "/brand/* /brand/:splat 200", "brand asset redirect must prevent SVG fallback to index.html.");

has("frontend/src/components/brand/LoginBrandPanel.tsx", "/brand/omnicore-logo-animation.svg", "brand panel must use the public animated logo path.");
has("frontend/src/components/brand/LoginBrandPanel.tsx", 'alt="OmniCore - HR logo"', "animated logo alt text missing.");
has("frontend/src/components/brand/LoginBrandPanel.tsx", "rounded-2xl", "animated logo must be inside a separate rounded container.");
has("frontend/src/components/brand/LoginBrandPanel.tsx", "shadow-panel", "animated logo container should use accepted panel styling.");
has("frontend/src/components/brand/LoginBrandPanel.tsx", "object-contain", "animated logo must preserve aspect ratio.");
has("frontend/src/components/brand/LoginBrandPanel.tsx", "APP_BRANDING.loginSubtitle", "brand panel subtitle should use branding config.");

has("frontend/src/pages/LoginPage.tsx", "LoginBrandPanel", "login page must render LoginBrandPanel.");
has("frontend/src/pages/LoginPage.tsx", "lg:grid-cols-[minmax(0,1fr)_1px_minmax(420px,520px)]", "desktop login layout must be left logo, separator, right form.");
has("frontend/src/pages/LoginPage.tsx", 'aria-hidden="true"', "decorative center separator must be aria-hidden.");
has("frontend/src/pages/LoginPage.tsx", "h-[min(560px,72vh)] w-px bg-slate-200", "desktop vertical separator missing.");
has("frontend/src/pages/LoginPage.tsx", 'aria-label="Sign in form"', "right-side sign-in form section should be labelled.");
has("frontend/src/pages/LoginPage.tsx", "lg:px-0", "right-side form column must have desktop-specific layout.");
has("frontend/src/pages/LoginPage.tsx", "grid-cols-1", "mobile layout must stack.");
has("frontend/src/pages/LoginPage.tsx", "lg:grid-cols", "desktop layout must switch to columns.");
has("frontend/src/pages/LoginPage.tsx", "APP_BRANDING.loginTitle", "login title must still use branding config.");
has("frontend/src/pages/LoginPage.tsx", "APP_BRANDING.loginSubtitle", "login subtitle must still use branding config.");
has("frontend/src/pages/LoginPage.tsx", "alerts.showValidationError", "login validation alert integration regressed.");
has("frontend/src/pages/LoginPage.tsx", "alerts.showSuccess", "login success alert integration regressed.");
has("frontend/src/pages/LoginPage.tsx", "alerts.showApiError", "login API error alert integration regressed.");
has("frontend/src/pages/LoginPage.tsx", "loading={submitting}", "login button loading state regressed.");
has("frontend/src/pages/LoginPage.tsx", "loadingLabel=\"Signing in\"", "login button loading label regressed.");
hasNo("frontend/src/pages/LoginPage.tsx", "HRM v2", "legacy HRM v2 branding must not return.");

if (exists("frontend/dist/index.html")) {
  has("frontend/dist/index.html", "/brand/omnicore-favicon.svg", "built index must reference SVG favicon.");
  has("frontend/dist/_headers", "/brand/*", "built Pages headers must include /brand/*.");
  has("frontend/dist/_redirects", "/brand/* /brand/:splat 200", "built Pages redirects must include /brand/*.");
  check(exists("frontend/dist/brand/omnicore-logo-animation.svg"), "built output missing animated logo SVG.");
  check(exists("frontend/dist/brand/omnicore-favicon.svg"), "built output missing favicon SVG.");
}

const frontendSources = collectFiles("frontend/src");
for (const file of frontendSources) {
  const source = read(file);
  if (/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)) failures.push(`${file}: browser alert/confirm/prompt is not allowed.`);
  if (/\bdark:|darkMode\b/.test(source)) failures.push(`${file}: dark mode marker is not allowed.`);
}

[
  "verify:branding-standardization",
  "verify:disabled-module-global-sweep",
  "verify:client-side-speed-polish",
  "verify:onboarding-dashboard-kpis",
  "verify:dependency-security-cleanup",
  "verify:professional-app-loader",
  "verify:global-popup-alerts",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "verify:button-color-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
].forEach((scriptName) => {
  check(Boolean(pkg.scripts?.[scriptName]), `package.json: missing regression script ${scriptName}.`);
});

has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database_name changed.");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed.");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket name changed.");
has("worker/src/auth/password.ts", "MAX_WORKER_PBKDF2_ITERATIONS = 100000", "PBKDF2 max iterations must remain 100000.");

if (failures.length) {
  console.error("Login brand layout verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Login brand layout verification passed.");

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

function check(condition, message) {
  if (!condition) failures.push(message);
}

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
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

function sectionAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const end = source.indexOf("</section>", start);
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

const pkg = JSON.parse(read("package.json"));
check(pkg.scripts?.["verify:login-brand-layout"] === "node scripts/verify-login-brand-layout.mjs", "package.json: missing verify:login-brand-layout script.");

const animationPath = "frontend/public/brand/omnicore-logo-animation.svg";
const faviconPath = "frontend/public/brand/omnicore-favicon.svg";
const cafeLogoPath = "frontend/public/brand/cafe-asiana-logo.jpg";
check(exists(animationPath), "animated OmniCore logo asset is missing.");
check(exists(faviconPath), "SVG favicon asset is missing.");
check(exists(cafeLogoPath), "Cafe Asiana logo asset is missing.");
if (exists(cafeLogoPath)) {
  check(fs.statSync(filePath(cafeLogoPath)).size > 30000, "Cafe Asiana logo asset looks too small or incomplete.");
}

const appPalette = ["#0F172A", "#12324F", "#0F766E", "#14B8A6", "#0891B2"];
const rejectedLogoColors = ["#06B6D4", "#22D3EE", "#22C55E", "#10B981", "#84CC16"];

if (exists(animationPath)) {
  const animation = read(animationPath);
  check(animation.includes("<svg"), "animated logo must remain an SVG.");
  check(/<animate|<animateTransform/.test(animation), "animated logo must retain SVG animation elements.");
  check(animation.includes('id="appPaletteColorMatch"'), "animated logo must include the app palette color-match filter.");
  check(animation.includes('filter="url(#appPaletteColorMatch)"'), "animated logo artwork must use the app palette color-match filter.");
  check(animation.includes('id="appPaletteMarker"'), "animated logo must include an app palette marker for review.");
  appPalette.forEach((color) => check(animation.includes(color), `animated logo missing app palette color ${color}.`));
  rejectedLogoColors.forEach((color) => check(!animation.includes(color), `animated logo must not retain rejected bright/green-heavy color ${color}.`));
  check(!animation.includes("0.10 0.18 0.04"), "animated logo must not retain the previous teal-heavy color matrix.");
  check(!animation.includes("0.08 0.10 0.05"), "animated logo must not retain the previous still-too-bright color matrix.");
  check(animation.includes("0.04 0.06 0.03"), "animated logo must use the darker premium color matrix.");
  check(animation.includes('flood-color="#0891B2"'), "animated logo glow should use controlled cyan, not bright cyan.");
  check(animation.includes('flood-opacity="0.08"'), "animated logo glow should use the softer refined opacity.");
  check(animation.includes('values="0.08;0.18;0.08"'), "animated logo glow animation should use the refined controlled pulse.");
  check(countOccurrences(animation, "#0891B2") <= 2, "controlled cyan must remain a small accent in the animated logo.");
  check(countOccurrences(animation, "#0F172A") + countOccurrences(animation, "#12324F") >= 2, "animated logo must be anchored by deep slate/navy colors.");
}

if (exists(faviconPath)) {
  const favicon = read(faviconPath);
  check(favicon.includes("<svg"), "favicon must remain an SVG.");
  check(favicon.includes('id="appPaletteColorMatch"'), "favicon must include the app palette color-match filter.");
  check(favicon.includes('filter="url(#appPaletteColorMatch)"'), "favicon artwork must use the app palette color-match filter.");
  check(favicon.includes('id="appPaletteMarker"'), "favicon must include an app palette marker for review.");
  appPalette.forEach((color) => check(favicon.includes(color), `favicon missing app palette color ${color}.`));
  rejectedLogoColors.forEach((color) => check(!favicon.includes(color), `favicon must not retain rejected bright/green-heavy color ${color}.`));
  check(!favicon.includes("0.10 0.18 0.04"), "favicon must not retain the previous teal-heavy color matrix.");
  check(!favicon.includes("0.08 0.10 0.05"), "favicon must not retain the previous still-too-bright color matrix.");
  check(favicon.includes("0.04 0.06 0.03"), "favicon must use the darker premium color matrix.");
  check(countOccurrences(favicon, "#0891B2") <= 1, "controlled cyan must remain a small accent in the favicon.");
}

has("frontend/index.html", '<link rel="icon" type="image/svg+xml" href="/brand/omnicore-favicon.svg" />', "SVG favicon link missing.");
has("frontend/index.html", '<link rel="icon" href="/favicon.ico" />', "ICO fallback favicon link missing.");
has("frontend/index.html", "<title>OmniCore - HR</title>", "browser title must remain OmniCore - HR.");
has("frontend/index.html", 'name="application-name" content="OmniCore - HR"', "application metadata must remain OmniCore - HR.");
has("frontend/index.html", "Enterprise HR, payroll, attendance, onboarding, and workforce operations platform.", "meta description changed.");

has("frontend/public/_headers", "/brand/*", "brand asset cache header missing.");
has("frontend/public/_headers", /\/brand\/\*\s+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable\s+X-Content-Type-Options:\s*nosniff/s, "brand assets must use immutable cache and nosniff.");
has("frontend/public/_redirects", "/brand/* /brand/:splat 200", "brand asset redirect must prevent SVG/image fallback to index.html.");

has("frontend/src/config/branding.ts", 'appLogoAnimation: "/brand/omnicore-logo-animation.svg"', "branding config must expose animated logo path.");
has("frontend/src/config/branding.ts", 'appLogoIcon: "/brand/omnicore-favicon.svg"', "branding config must expose app icon logo path.");
has("frontend/src/config/branding.ts", 'appLogoStatic: "/brand/omnicore-favicon.svg"', "branding config must expose static fallback logo path.");

const brandPanelPath = "frontend/src/components/brand/LoginBrandPanel.tsx";
has(brandPanelPath, "APP_BRANDING.appLogoAnimation", "brand panel must use the configured animated logo path.");
has(brandPanelPath, 'alt="OmniCore - HR logo"', "animated logo alt text missing.");
has(brandPanelPath, "rounded-2xl", "animated logo must be inside a separate rounded container.");
has(brandPanelPath, "shadow-panel", "animated logo container should use accepted panel styling.");
has(brandPanelPath, "object-contain", "animated logo must preserve aspect ratio.");
has(brandPanelPath, "max-w-[640px]", "left-side brand panel must use the balanced container width.");
has(brandPanelPath, "lg:max-w-[560px]", "left-side animated logo must be enlarged on desktop.");
has(brandPanelPath, "xl:max-w-[600px]", "left-side animated logo must scale up on wide desktop.");
has(brandPanelPath, "sm:max-w-[420px]", "left-side animated logo must be sized for tablet.");
has(brandPanelPath, "max-w-[300px]", "left-side animated logo must remain usable on mobile.");
has(brandPanelPath, "lg:min-h-[620px]", "left-side brand panel must have the larger balanced desktop presence.");
has(brandPanelPath, "APP_BRANDING.appName", "OmniCore - HR app name must appear under the animation.");
has(brandPanelPath, "text-slate-900", "left-side app name must use a deep slate enterprise color.");
hasNo(brandPanelPath, "APP_BRANDING.loginSubtitle", "left-side animation description must be removed.");
hasNo(brandPanelPath, "Enterprise HR", "left-side descriptive copy must not appear under the animation.");

const loginPagePath = "frontend/src/pages/LoginPage.tsx";
has(loginPagePath, "LoginBrandPanel", "login page must render LoginBrandPanel.");
has(loginPagePath, "lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]", "desktop login layout must use balanced left/right containers with a separator.");
has(loginPagePath, 'aria-hidden="true"', "decorative center separator must be aria-hidden.");
has(loginPagePath, "h-[min(560px,72vh)] w-px bg-slate-200", "desktop vertical separator missing.");
has(loginPagePath, 'aria-label="Sign in form"', "right-side sign-in form section should be labelled.");
has(loginPagePath, "grid-cols-1", "mobile layout must stack.");
has(loginPagePath, "lg:grid-cols", "desktop layout must switch to columns.");
has(loginPagePath, "max-w-[640px]", "right-side login card must match the left-side balanced container width.");
has(loginPagePath, "rounded-2xl", "right-side login card must use the same rounded container style as the left panel.");
has(loginPagePath, "border border-slate-200", "right-side login card must use the same border style as the left panel.");
has(loginPagePath, "shadow-panel", "right-side login card must use the same panel shadow as the left panel.");
has(loginPagePath, "lg:min-h-[620px]", "right-side login card must match the left panel desktop height.");
has(loginPagePath, "/brand/cafe-asiana-logo.jpg", "right-side login panel must show Cafe Asiana logo.");
has(loginPagePath, 'alt="Cafe Asiana logo"', "Cafe Asiana logo alt text missing.");
has(loginPagePath, "max-h-28", "Cafe Asiana logo must be larger on mobile.");
has(loginPagePath, "max-w-[320px]", "Cafe Asiana logo must have a larger mobile width cap.");
has(loginPagePath, "sm:max-h-36", "Cafe Asiana logo must be larger on tablet.");
has(loginPagePath, "sm:max-w-[400px]", "Cafe Asiana logo must have a larger tablet width cap.");
has(loginPagePath, "lg:max-h-44", "Cafe Asiana logo must be significantly larger on desktop.");
has(loginPagePath, "lg:max-w-[460px]", "Cafe Asiana logo must have the larger desktop width cap.");
has(loginPagePath, "Welcome to Cafe Asiana&apos;s HRM System", "right-side login panel must show the exact Cafe Asiana welcome message.");
has(loginPagePath, "alerts.showValidationError", "login validation alert integration regressed.");
has(loginPagePath, "alerts.showSuccess", "login success alert integration regressed.");
has(loginPagePath, "alerts.showApiError", "login API error alert integration regressed.");
has(loginPagePath, "loading={submitting}", "login button loading state regressed.");
has(loginPagePath, 'loadingLabel="Signing in"', "login button loading label regressed.");
hasNo(loginPagePath, "HRM v2", "legacy HRM v2 branding must not return.");
hasNo(loginPagePath, "APP_BRANDING.loginTitle", "right-side login title must not use OmniCore product copy.");
hasNo(loginPagePath, "APP_BRANDING.loginSubtitle", "right-side login subtitle must not use OmniCore product copy.");
hasNo(loginPagePath, "lucide-react", "right-side login panel should use the Cafe Asiana logo instead of a generic login icon.");

if (exists(loginPagePath)) {
  const loginPage = read(loginPagePath);
  const rightPanel = sectionAfter(loginPage, 'aria-label="Sign in form"');
  check(rightPanel.includes("/brand/cafe-asiana-logo.jpg"), "right-side login panel is missing the Cafe Asiana logo.");
  check(rightPanel.includes("Welcome to Cafe Asiana&apos;s HRM System"), "right-side login panel is missing the Cafe Asiana welcome message.");
  check(!/OmniCore|APP_BRANDING\.loginTitle|APP_BRANDING\.loginSubtitle/.test(rightPanel), "right-side login panel must not mention OmniCore product copy.");
  check(rightPanel.indexOf("/brand/cafe-asiana-logo.jpg") < rightPanel.indexOf("Welcome to Cafe Asiana&apos;s HRM System"), "Cafe Asiana logo must appear above the welcome message.");
  check(rightPanel.indexOf("Welcome to Cafe Asiana&apos;s HRM System") < rightPanel.indexOf("<form"), "Cafe Asiana welcome message must appear above the login form.");
}

has("frontend/src/layouts/AppShell.tsx", "APP_BRANDING.appLogoIcon", "AppShell/sidebar must use the configured app logo icon.");
hasNo("frontend/src/layouts/AppShell.tsx", ">OC<", "AppShell/sidebar must not use text initials as the logo.");
has("frontend/src/components/loading/AppLoader.tsx", "APP_BRANDING.appLogoIcon", "AppLoader must use the configured app logo icon.");
hasNo("frontend/src/components/loading/AppLoader.tsx", "ShieldCheck", "AppLoader must not use a generic shield as the brand mark.");
has("frontend/src/components/loading/PageLoader.tsx", "APP_BRANDING.appLogoIcon", "PageLoader must use the configured app logo icon.");
has("frontend/src/components/loading/PageLoader.tsx", "InlineSpinner", "PageLoader must retain a visible loading spinner.");

if (exists("frontend/dist/index.html")) {
  has("frontend/dist/index.html", "/brand/omnicore-favicon.svg", "built index must reference SVG favicon.");
  has("frontend/dist/_headers", "/brand/*", "built Pages headers must include /brand/*.");
  has("frontend/dist/_redirects", "/brand/* /brand/:splat 200", "built Pages redirects must include /brand/*.");
  check(exists("frontend/dist/brand/omnicore-logo-animation.svg"), "built output missing animated logo SVG.");
  check(exists("frontend/dist/brand/omnicore-favicon.svg"), "built output missing favicon SVG.");
  check(exists("frontend/dist/brand/cafe-asiana-logo.jpg"), "built output missing Cafe Asiana logo.");
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

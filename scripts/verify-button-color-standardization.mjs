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

function listFiles(dir, extensions) {
  const absoluteDir = path.join(root, dir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((entry) => extensions.some((extension) => entry.endsWith(extension)))
    .map((entry) => `${dir}/${entry}`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function has(file, marker, message) {
  const content = read(file);
  assert(marker instanceof RegExp ? marker.test(content) : content.includes(marker), `${file}: ${message}`);
}

const pkg = JSON.parse(read("package.json"));
assert(Boolean(pkg.scripts?.["verify:button-color-standardization"]), "package.json: missing verify:button-color-standardization script.");
[
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
].forEach((script) => assert(Boolean(pkg.scripts?.[script]), `package.json: missing ${script} regression script.`));

assert(exists("frontend/src/components/ui/button.tsx"), "frontend/src/components/ui/button.tsx is missing.");
assert(exists("frontend/src/components/ui/action-button.tsx"), "frontend/src/components/ui/action-button.tsx is missing.");

[
  "actionCreate",
  "actionSave",
  "actionNeutral",
  "actionExport",
  "actionImport",
  "actionWarning",
  "actionDestructive",
  "actionDisabled"
].forEach((variant) => {
  has("frontend/src/components/ui/button.tsx", variant, `Button variant ${variant} is missing.`);
  has("frontend/src/components/ui/action-button.tsx", variant, `ActionButton mapping for ${variant} is missing.`);
});

[
  ["create/add/new actions", /create\|add\|new\|link\|start/],
  ["save/confirm/activate/approve/complete actions", /save\|confirm\|activate\|approve\|complete\|finalize/],
  ["neutral refresh/settings/view/open actions", /refresh\|settings\|view\|open\|details\|more\|filter\|reset/],
  ["export/download actions", /export\|download/],
  ["import/upload actions", /import\|upload/],
  ["warning/send back/hold/reopen actions", /send back\|hold\|put on hold\|reopen\|needs review/],
  ["destructive delete/reject/disable/archive actions", /delete\|reject\|disable\|archive\|remove/]
].forEach(([label, pattern]) => has("frontend/src/components/ui/button.tsx", pattern, `Button intent inference is missing ${label}.`));

has("frontend/src/components/ui/button.tsx", "bg-primary text-primary-foreground", "Create/Add/New teal primary styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-emerald-600 text-white", "Save/Confirm/Approve green styling missing.");
has("frontend/src/components/ui/button.tsx", "border border-slate-300 bg-white text-slate-700", "Neutral outline styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-sky-600 text-white", "Export/Import blue styling missing.");
has("frontend/src/components/ui/button.tsx", "border border-amber-300 bg-amber-100 text-amber-900", "Warning amber styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-destructive text-destructive-foreground", "Destructive red styling missing.");
has("frontend/src/components/ui/button.tsx", "bg-slate-100 text-slate-400", "Disabled grey styling missing.");
has("frontend/src/components/ui/button.tsx", "gap-2", "Consistent icon spacing missing from Button.");
has("frontend/src/components/ui/button.tsx", "h-8 px-3 text-xs", "Small button height marker missing.");
has("frontend/src/components/ui/button.tsx", "h-9 px-4 text-sm", "Default button height marker missing.");

has("frontend/src/components/ui/button.tsx", "ICON_ACTION_LABELS", "Icon-only action label mapping missing from Button.");
has("frontend/src/components/ui/button.tsx", "effectiveAriaLabel", "Icon-only Button aria-label fallback missing.");
has("frontend/src/components/ui/button.tsx", "size === \"icon\"", "Icon-only Button fallback must be size-aware.");
has("frontend/src/components/ui/button.tsx", "title ?? (size === \"icon\" ? effectiveAriaLabel", "Icon-only Button title fallback missing.");

const frontendSources = listFiles("frontend/src", [".ts", ".tsx"]).map((file) => read(file)).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendSources), "Frontend source must not use browser alert/confirm/prompt.");
assert(!/\bdark:\b|darkMode|setTheme\(["']dark["']\)/.test(frontendSources), "Dark mode markers must not be introduced.");

has("frontend/src/components/filters/index.tsx", "FilterResetButton", "Filter reset component missing.");
has("frontend/src/components/filters/index.tsx", "StandardFilterBar", "Standard filter bar missing.");
has("scripts/verify-frontend-static-assets.mjs", "index-UZP1m5JP.css", "CSS MIME/static asset stale hash guard missing.");
has("scripts/verify-frontend-bundle-integrity.mjs", "react-vendor", "Frontend bundle integrity React chunk guard missing.");
has("scripts/verify-filter-search-date-standardization.mjs", "Filter/search/date standardization", "Filter/search/date verifier missing.");
has("scripts/verify-command-center-dashboard.mjs", "Command Center", "Command Center verifier missing.");

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const workerSources = listFiles("worker/src", [".ts"]).map((file) => read(file)).join("\n");
assert(workerSources.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!workerSources.includes("PBKDF2_ITERATIONS = 210000"), "PBKDF2 iteration regression detected.");

if (failures.length > 0) {
  console.error("Button color standardization verifier failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Button color standardization verification passed.");

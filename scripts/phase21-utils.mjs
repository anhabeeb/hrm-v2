import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const productionDocsDir = path.join(rootDir, "docs", "production");
export const defaultFrontendUrl = "https://hr.cafeasiana.com.mv";
export const defaultApiUrl = "https://hr.api.cafeasiana.com.mv";
export const phase21Baseline = "HRM-v2-d1-deferred-audit-remediation-phase20-clean.zip";
export const timeoutMs = Math.max(1000, Number(process.env.HRM_PHASE21_TIMEOUT_MS ?? 10000));

export function projectPath(relativePath) {
  return path.join(rootDir, relativePath);
}

export function readText(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

export function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath));
}

export function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeReport(relativePath, markdown) {
  const filePath = projectPath(relativePath);
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${String(markdown).trim()}\n`);
}

export function writeJsonReport(relativePath, data) {
  const filePath = projectPath(relativePath);
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function joinUrl(base, pathname = "/") {
  if (!base) return pathname;
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${String(base).replace(/\/+$/, "")}${normalizedPath}`;
}

export function envUrl(name, fallback = "") {
  return String(process.env[name] ?? fallback).replace(/\/+$/, "");
}

export function authHeaders(token = process.env.HRM_TEST_AUTH_TOKEN) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 260);
}

export function escapeTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function markdownTable(headers, rows) {
  const head = `| ${headers.map(escapeTable).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(escapeTable).join(" | ")} |`).join("\n");
  return [head, divider, body || `| ${headers.map(() => "-").join(" | ")} |`].join("\n");
}

export function statusFromRows(rows) {
  if (rows.some((row) => row.status === "FAIL" || row.status === "BLOCKED")) return "BLOCKED";
  if (rows.some((row) => row.status === "WARN" || row.status === "SKIPPED")) return "PASS WITH WARNINGS";
  return "PASS";
}

export function phase21Report(title, status, sections = []) {
  return `# ${title}

Generated: ${new Date().toISOString()}

Accepted baseline: ${phase21Baseline}

Status: **${status}**

${sections.filter(Boolean).join("\n\n")}

No secrets, credentials, response bodies, or sensitive HR/payroll/document data are stored in this report.
`;
}

export async function safeFetchCheck(name, url, options = {}, validate = (response) => response.status < 500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: options.redirect ?? "manual"
    });
    const payload = options.readBody === false ? new ArrayBuffer(0) : await response.clone().arrayBuffer().catch(() => new ArrayBuffer(0));
    const meta = {
      status: response.status,
      cache: response.headers.get("cache-control") ?? "",
      contentType: response.headers.get("content-type") ?? "",
      corsAllowHeaders: response.headers.get("access-control-allow-headers") ?? "",
      corsAllowOrigin: response.headers.get("access-control-allow-origin") ?? "",
      vary: response.headers.get("vary") ?? "",
      serverTiming: response.headers.get("server-timing") ?? "",
      payloadBytes: payload.byteLength,
      durationMs: Math.round(performance.now() - started)
    };
    const ok = Boolean(validate(response, meta));
    return {
      name,
      status: ok ? "PASS" : "FAIL",
      http: response.status,
      duration_ms: meta.durationMs,
      payload_bytes: meta.payloadBytes,
      detail: redact(`cache=${meta.cache || "none"} type=${meta.contentType || "none"} vary=${meta.vary || "none"}`)
    };
  } catch (error) {
    return {
      name,
      status: error instanceof Error && error.name === "AbortError" ? "FAIL" : "BLOCKED",
      http: "ERR",
      duration_ms: Math.round(performance.now() - started),
      payload_bytes: 0,
      detail: redact(error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timer);
  }
}

export function reportRowsSection(rows) {
  return markdownTable(["Status", "Check", "HTTP", "Duration ms", "Payload bytes", "Detail"], rows.map((row) => [
    row.status,
    row.name,
    row.http ?? "-",
    row.duration_ms ?? "-",
    row.payload_bytes ?? "-",
    row.detail ?? ""
  ]));
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

export function hasSecretLikeValue(text) {
  return /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|password\s*[:=]\s*["'][^"']+["']|secret\s*[:=]\s*["'][^"']+["']|api[_-]?token\s*[:=]\s*["'][^"']+["'])/i.test(text);
}

export function hasBrowserPromptUsage(text) {
  return /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(text);
}

export function hasDarkModeMarker(text) {
  return /\bdark:|\bdarkMode\b|classList\.add\(["']dark["']\)/.test(text);
}

export function readPackageScripts() {
  return JSON.parse(readText("package.json")).scripts ?? {};
}


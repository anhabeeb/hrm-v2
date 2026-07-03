import type { Env } from "../types";

export type DocumentUploadMode = "worker_proxy" | "direct_r2" | "auto";
export type ResolvedDocumentUploadMode = "worker_proxy" | "direct_r2";

export interface DirectR2PresignInput {
  key: string;
  contentType: string;
  contentLength: number;
  checksumSha256?: string | null;
}

export interface DirectR2PresignResult {
  mode: "direct_r2";
  upload_url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_at: string;
  ttl_seconds: number;
  checksum_algorithm?: "SHA-256";
}

const DEFAULT_DIRECT_UPLOAD_TTL_SECONDS = 300;
const MIN_DIRECT_UPLOAD_TTL_SECONDS = 60;
const MAX_DIRECT_UPLOAD_TTL_SECONDS = 900;
const DEFAULT_DIRECT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const MAX_DIRECT_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;

function truthy(value: string | undefined) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizedUploadMode(value: string | undefined): DocumentUploadMode {
  const mode = String(value ?? "auto").trim().toLowerCase();
  if (mode === "worker_proxy" || mode === "direct_r2" || mode === "auto") return mode;
  return "auto";
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function requiredDirectUploadFields(env: Env) {
  return {
    endpoint: env.HRM_R2_PRESIGN_ENDPOINT?.trim() ?? "",
    accessKeyId: env.HRM_R2_PRESIGN_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: env.HRM_R2_PRESIGN_SECRET_ACCESS_KEY?.trim() ?? "",
    bucket: env.HRM_R2_PRESIGN_BUCKET?.trim() ?? "",
    region: env.HRM_R2_PRESIGN_REGION?.trim() || "auto"
  };
}

export function getConfiguredDocumentUploadMode(env: Env | undefined): DocumentUploadMode {
  return normalizedUploadMode(env?.HRM_DOCUMENT_UPLOAD_MODE);
}

export function getDirectUploadTtlSeconds(env: Env | undefined) {
  return boundedInteger(env?.HRM_R2_PRESIGN_URL_TTL_SECONDS, DEFAULT_DIRECT_UPLOAD_TTL_SECONDS, MIN_DIRECT_UPLOAD_TTL_SECONDS, MAX_DIRECT_UPLOAD_TTL_SECONDS);
}

export function getDirectUploadMaxBytes(env: Env | undefined) {
  return boundedInteger(env?.HRM_R2_DIRECT_UPLOAD_MAX_BYTES, DEFAULT_DIRECT_UPLOAD_MAX_BYTES, 1, MAX_DIRECT_UPLOAD_MAX_BYTES);
}

export function isDirectR2UploadConfigured(env: Env | undefined) {
  if (!env || !truthy(env.HRM_R2_DIRECT_UPLOAD_ENABLED)) return false;
  const fields = requiredDirectUploadFields(env);
  return Boolean(fields.endpoint && fields.accessKeyId && fields.secretAccessKey && fields.bucket);
}

export function resolveDocumentUploadMode(env: Env, input: { fileSizeBytes?: number | null } = {}): ResolvedDocumentUploadMode {
  const requested = getConfiguredDocumentUploadMode(env);
  const directConfigured = isDirectR2UploadConfigured(env);
  const directMaxBytes = getDirectUploadMaxBytes(env);
  const fileSize = Number(input.fileSizeBytes ?? 0);
  const directAllowedForSize = !fileSize || fileSize <= directMaxBytes;
  if ((requested === "direct_r2" || requested === "auto") && directConfigured && directAllowedForSize) return "direct_r2";
  return "worker_proxy";
}

export function getDocumentUploadModeStatus(env: Env) {
  const requested_mode = getConfiguredDocumentUploadMode(env);
  const direct_enabled = truthy(env.HRM_R2_DIRECT_UPLOAD_ENABLED);
  const direct_configured = isDirectR2UploadConfigured(env);
  const fallback_active = requested_mode !== "direct_r2" || !direct_configured;
  return {
    requested_mode,
    active_mode: direct_enabled && direct_configured && requested_mode !== "worker_proxy" ? "direct_r2" : "worker_proxy",
    direct_upload_enabled: direct_enabled,
    direct_upload_configured: direct_configured,
    fallback_active,
    direct_upload_max_bytes: getDirectUploadMaxBytes(env),
    presign_ttl_seconds: getDirectUploadTtlSeconds(env),
    r2_cors_check_status: "source_verified_or_run_verify_r2_cors_direct_upload_phase18",
    last_direct_upload_failure_category: "not_tracked_in_source_verification",
    secrets_exposed: false
  };
}

function safeSegment(value: string, fallback = "item") {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return cleaned || fallback;
}

function extensionFromFilename(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match ? `.${match[1]}` : "";
}

export function createSecureDocumentObjectKey(input: {
  employeeId: string;
  documentTypeId: string;
  documentId: string;
  uploadId: string;
  versionNo: number;
  originalFilename: string;
}) {
  const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const extension = extensionFromFilename(input.originalFilename);
  return [
    "employees",
    safeSegment(input.employeeId, "employee"),
    "documents",
    safeSegment(input.documentTypeId, "document-type"),
    safeSegment(input.documentId, "document"),
    `v${Math.max(1, input.versionNo)}`,
    `${safeSegment(input.uploadId, "upload")}-${randomSuffix}${extension}`
  ].join("/");
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePathKey(value: string) {
  return value.split("/").map(encodeRfc3986).join("/");
}

function byteHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textKeyBuffer(value: string) {
  const bytes = new TextEncoder().encode(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function hmac(key: ArrayBuffer | string, value: string) {
  const rawKey = typeof key === "string" ? textKeyBuffer(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

async function sha256Hex(value: string) {
  return byteHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function deriveSigningKey(secretAccessKey: string, date: string, region: string) {
  const kDate = await hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function timestampParts(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    shortDate: iso.slice(0, 8)
  };
}

export async function createDirectR2PresignedPutUrl(env: Env, input: DirectR2PresignInput): Promise<DirectR2PresignResult | null> {
  if (!isDirectR2UploadConfigured(env)) return null;
  const fields = requiredDirectUploadFields(env);
  const ttl = getDirectUploadTtlSeconds(env);
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const endpoint = new URL(fields.endpoint);
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  const host = endpoint.host;
  const canonicalUri = `${endpoint.pathname}/${encodeRfc3986(fields.bucket)}/${encodePathKey(input.key)}`.replace(/\/{2,}/g, "/");
  const { amzDate, shortDate } = timestampParts();
  const credentialScope = `${shortDate}/${fields.region}/s3/aws4_request`;
  const signedHeaders = "content-type;host";
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${fields.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(ttl),
    "X-Amz-SignedHeaders": signedHeaders,
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD"
  };
  const canonicalQuery = Object.entries(queryParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
  const contentType = input.contentType || "application/octet-stream";
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
  const signingKey = await deriveSigningKey(fields.secretAccessKey, shortDate, fields.region);
  const signature = byteHex(await hmac(signingKey, stringToSign));
  const url = new URL(`${endpoint.origin}${canonicalUri}`);
  for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);
  url.searchParams.set("X-Amz-Signature", signature);
  return {
    mode: "direct_r2",
    upload_url: url.toString(),
    method: "PUT",
    headers: { "Content-Type": contentType },
    expires_at: expiresAt,
    ttl_seconds: ttl,
    checksum_algorithm: input.checksumSha256 ? "SHA-256" : undefined
  };
}

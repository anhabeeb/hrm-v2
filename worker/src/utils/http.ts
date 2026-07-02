import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const encoder = new TextEncoder();

function estimatePayloadBytes(value: unknown) {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  const payload = { ok: true, data };
  c.header("X-HRM-Payload-Bytes", String(estimatePayloadBytes(payload)));
  return c.json(payload, status);
}

export function withPrivateCacheHeaders(c: Context, maxAgeSeconds = 60, etagSeed?: string | number | null) {
  c.header("Cache-Control", `private, max-age=${maxAgeSeconds}`);
  c.header("Vary", "Authorization");
  if (etagSeed !== undefined && etagSeed !== null) {
    c.header("ETag", `W/"${String(etagSeed).replace(/"/g, "")}"`);
  }
}

export function okCached<T>(c: Context, data: T, maxAgeSeconds = 60, etagSeed?: string | number | null, status: ContentfulStatusCode = 200) {
  withPrivateCacheHeaders(c, maxAgeSeconds, etagSeed);
  return ok(c, data, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  const payload = { ok: false, error: { code, message } };
  c.header("X-HRM-Payload-Bytes", String(estimatePayloadBytes(payload)));
  return c.json(payload, status);
}

export function nowIso() {
  return new Date().toISOString();
}

export function getClientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For");
}

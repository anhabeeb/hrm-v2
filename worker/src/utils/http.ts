import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, data }, status);
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
  return c.json({ ok: false, error: { code, message } }, status);
}

export function nowIso() {
  return new Date().toISOString();
}

export function getClientIp(request: Request) {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For");
}

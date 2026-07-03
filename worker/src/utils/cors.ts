import type { Context } from "hono";
import type { AppBindings } from "../types";

export const PRODUCTION_FRONTEND_ORIGIN = "https://hr.cafeasiana.com.mv";
export const LOCAL_FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] as const;
export const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Accept",
  "Authorization",
  "Last-Event-ID",
  "last-event-id",
  "X-Requested-With",
  "X-Request-Id",
  "X-Request-ID",
  "x-request-id",
  "X-Correlation-Id",
  "x-correlation-id",
  "X-Client-Request-Id",
  "x-client-request-id",
  "X-HRM-Company-Id",
  "x-hrm-company-id",
  "X-HRM-Bridge-Token",
  "x-hrm-bridge-token",
  "X-ZKTeco-Token",
  "x-zkteco-token",
  "X-Tenant-Id",
  "x-tenant-id",
  "X-Timezone",
  "x-timezone"
] as const;
export const CORS_ALLOWED_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] as const;

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function allowedCorsOrigins(configuredOrigin: string | undefined) {
  const configured = configuredOrigin ? configuredOrigin.split(",") : [];
  const fallback = configured.length ? [] : [...LOCAL_FRONTEND_ORIGINS];
  return unique([PRODUCTION_FRONTEND_ORIGIN, ...configured, ...fallback]);
}

export function getCorsHeaders(request: Request, configuredOrigin: string | undefined, vary = "Origin") {
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && allowedCorsOrigins(configuredOrigin).includes(origin) ? origin : null;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS.join(", "),
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS.join(", "),
    "Access-Control-Max-Age": "86400",
    Vary: vary.includes("Origin") ? vary : `${vary}, Origin`
  };
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function applyCorsHeaders(c: Context<AppBindings>, vary = "Origin") {
  const headers = getCorsHeaders(c.req.raw, c.env.CORS_ORIGIN, vary);
  for (const [key, value] of Object.entries(headers)) c.header(key, value);
}

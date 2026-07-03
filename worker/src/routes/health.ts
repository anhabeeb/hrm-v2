import { Hono } from "hono";
import type { AppBindings } from "../types";
import { ok } from "../utils/http";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/", async (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");

  let d1Status: "ok" | "unavailable" = "ok";
  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
  } catch {
    d1Status = "unavailable";
  }

  return ok(c, {
    service: "hrm-v2-api",
    status: d1Status === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    build: "phase12-production-readiness",
    checks: {
      api: "ok",
      d1: d1Status
    }
  });
});

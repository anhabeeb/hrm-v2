import { Hono } from "hono";
import type { AppBindings } from "../types";
import { ok } from "../utils/http";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/", (c) => {
  return ok(c, {
    service: "hrm-v2-api",
    status: "ok",
    environment: c.env.ENVIRONMENT ?? "unknown"
  });
});

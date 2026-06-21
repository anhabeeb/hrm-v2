import { Hono } from "hono";
import { authenticateRealtimeRequest, getRequestedRealtimeProtocol } from "../realtime/auth";
import { createRealtimeSession } from "../realtime/session";
import type { AppBindings } from "../types";
import { fail, ok } from "../utils/http";

export const realtimeRoutes = new Hono<AppBindings>();

realtimeRoutes.get("/status", (c) => {
  return ok(c, {
    rest_primary: true,
    websocket_ready: true,
    websocket_endpoint: "/api/v1/realtime/ws",
    channels_prepared: ["dashboard", "notifications", "leave", "attendance", "roster", "documents", "payroll", "assets", "audit", "devices"]
  });
});

realtimeRoutes.get("/ws", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return fail(c, 426, "WEBSOCKET_UPGRADE_REQUIRED", "This endpoint requires a WebSocket upgrade request.");
  }

  const user = await authenticateRealtimeRequest(c.env, c.req.raw);
  if (!user) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication is required.");
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  createRealtimeSession(server, user);

  const protocol = getRequestedRealtimeProtocol(c.req.raw);
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: protocol ? { "Sec-WebSocket-Protocol": protocol } : undefined
  });
});

import { requireJwtSecret, verifyJwt } from "../auth/jwt";
import { getUserById, toAuthUser } from "../db/users";
import type { AuthUser, Env } from "../types";

const TOKEN_PROTOCOL_PREFIX = "hrm-v2.token.";

function getProtocols(request: Request) {
  const header = request.headers.get("Sec-WebSocket-Protocol");
  if (!header) {
    return [];
  }
  return header
    .split(",")
    .map((protocol) => protocol.trim())
    .filter(Boolean);
}

export function getRequestedRealtimeProtocol(request: Request) {
  return getProtocols(request).includes("hrm-v2") ? "hrm-v2" : undefined;
}

export function getRealtimeToken(request: Request) {
  const tokenProtocol = getProtocols(request).find((protocol) => protocol.startsWith(TOKEN_PROTOCOL_PREFIX));
  if (tokenProtocol) {
    return tokenProtocol.slice(TOKEN_PROTOCOL_PREFIX.length);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return null;
}

export async function authenticateRealtimeRequest(env: Env, request: Request): Promise<AuthUser | null> {
  const token = getRealtimeToken(request);
  if (!token) {
    return null;
  }

  const payload = await verifyJwt(requireJwtSecret(env.JWT_SECRET), token);
  if (!payload) {
    return null;
  }

  const user = await getUserById(env.DB, payload.sub);
  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  return toAuthUser(env.DB, user);
}

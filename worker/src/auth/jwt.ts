import type { JwtPayload } from "../types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify"
  ]);
}

function encodePart(value: unknown) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

export function requireJwtSecret(secret: string | undefined) {
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export async function signJwt(secret: string, userId: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID()
  };
  const header = { alg: "HS256", typ: "JWT" };
  const unsignedToken = `${encodePart(header)}.${encodePart(payload)}`;
  const signature = await crypto.subtle.sign("HMAC", await importSigningKey(secret), encoder.encode(unsignedToken));
  return `${unsignedToken}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt(secret: string, token: string) {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    return null;
  }

  const unsignedToken = `${headerPart}.${payloadPart}`;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importSigningKey(secret),
    base64UrlToBytes(signaturePart),
    encoder.encode(unsignedToken)
  );
  if (!valid) {
    return null;
  }

  const payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart))) as JwtPayload;
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

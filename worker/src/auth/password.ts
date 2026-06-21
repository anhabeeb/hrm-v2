const encoder = new TextEncoder();
const HASH_ALGORITHM = "PBKDF2";
const DIGEST = "SHA-256";
const MIN_ITERATIONS = 100000;
const MAX_WORKER_PBKDF2_ITERATIONS = 100000;
const ITERATIONS = 100000;
const KEY_LENGTH_BITS = 256;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), HASH_ALGORITHM, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: HASH_ALGORITHM,
      hash: DIGEST,
      salt: toArrayBuffer(salt),
      iterations
    },
    key,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterationsText, saltText, hashText] = storedHash.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !saltText || !hashText) {
    return false;
  }

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_WORKER_PBKDF2_ITERATIONS) {
    return false;
  }

  const expectedHash = base64ToBytes(hashText);
  const actualHash = await derive(password, base64ToBytes(saltText), iterations);
  return constantTimeEqual(actualHash, expectedHash);
}

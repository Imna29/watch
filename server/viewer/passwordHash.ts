import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// A Viewer password hash as it is pasted into server config:
//   scrypt:<N>:<r>:<p>:<salt, base64url>:<key, base64url>
// Colons and base64url only, because `.env` loaders expand `$`.
const PREFIX = "scrypt";

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

// OWASP's scrypt setting for 32 MiB of memory: N=2^15, r=8, p=3.
const DEFAULT_COST: ScryptCost = { N: 2 ** 15, r: 8, p: 3 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// Refuse absurd parameters from config instead of allocating gigabytes.
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

export interface PasswordHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function deriveKey(password: string, salt: Buffer, keyLength: number, cost: ScryptCost) {
  const options: ScryptOptions = { ...cost, maxmem: 256 * cost.N * cost.r };
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Hashes a password for server config. The hash records its own cost, so a
 * lower `cost` (tests only) still verifies.
 */
export async function hashPassword(
  password: string,
  { cost = DEFAULT_COST }: { cost?: ScryptCost } = {},
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, KEY_BYTES, cost);
  const { N, r, p } = cost;
  return [PREFIX, N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/** Returns null for anything that is not a hash printed by `hashPassword`. */
export function parsePasswordHash(text: string): PasswordHash | null {
  const [prefix, nText, rText, pText, saltText, keyText, ...rest] = text.trim().split(":");
  if (prefix !== PREFIX || keyText === undefined || rest.length > 0) return null;
  const [N, r, p] = [nText, rText, pText].map((part = "") => (/^\d+$/.test(part) ? Number(part) : NaN)) as [
    number,
    number,
    number,
  ];
  const salt = Buffer.from(saltText ?? "", "base64url");
  const key = Buffer.from(keyText, "base64url");
  const isPowerOfTwo = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  if (!isPowerOfTwo || N > MAX_N) return null;
  if (!(r >= 1 && r <= MAX_R) || !(p >= 1 && p <= MAX_P)) return null;
  if (salt.length < SALT_BYTES || key.length < 16) return null;
  return { N, r, p, salt, key };
}

/** Constant-time comparison of the derived key. */
export async function verifyPassword(password: string, hash: PasswordHash): Promise<boolean> {
  const key = await deriveKey(password, hash.salt, hash.key.length, hash);
  return timingSafeEqual(key, hash.key);
}

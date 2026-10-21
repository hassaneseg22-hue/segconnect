import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plain, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    if (!stored || !stored.startsWith('scrypt$')) return false;
    const parts = stored.split('$');
    if (parts.length !== 6) return false;
    const [, nStr, rStr, pStr, salt, hashHex] = parts;
    const derived = scryptSync(plain, salt, KEYLEN, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    const expected = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
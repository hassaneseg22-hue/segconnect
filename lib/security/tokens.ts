import { createHash, randomBytes } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function tokenExpiry(hours = 48): Date {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}
import { SCHEMA_LIMITS } from '../types';

export function sanitizeString(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function sanitizeId(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, SCHEMA_LIMITS.ID_MAX);
  return cleaned || `id-${Date.now()}`;
}

export function sanitizePrefix(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, SCHEMA_LIMITS.PREFIX_MAX);
  return cleaned.length >= 2 ? cleaned : 'CERT';
}

export function generateClaimCode(prefix: string): string {
  const safePrefix = sanitizePrefix(prefix);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let segment1 = '';
  let segment2 = '';
  for (let i = 0; i < 4; i++) {
    segment1 += alphabet[bytes[i] % alphabet.length];
    segment2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  return `${safePrefix}-${segment1}-${segment2}`.slice(0, SCHEMA_LIMITS.CLAIM_CODE_MAX);
}

export function generateCheckInRef(): string {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate()
  ).padStart(2, '0')}`;
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `CHK-${ymd}-${hex}`;
}

export function generateRegistrationId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `reg-${Date.now().toString(36)}-${hex}`;
}

export async function computeVerificationHash(payload: {
  claimCode: string;
  eventId: string;
  fullName: string;
  role: string;
}): Promise<string> {
  const canonical = `${payload.claimCode}|${payload.eventId}|${payload.fullName.toLowerCase()}|${payload.role}`;
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function buildVerifyUrl(claimCode: string): string {
  const base =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://certflow.uinjakarta.id';
  return `${base}/?verify=${encodeURIComponent(claimCode)}`.slice(0, SCHEMA_LIMITS.CERT_URL_MAX);
}

export function buildAttendanceUrl(eventId: string): string {
  const base =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://certflow.uinjakarta.id';
  return `${base}/?attendance=${encodeURIComponent(eventId)}`;
}

// Edge-compatible HMAC-signed session token.
// Designed for incremental upgrade: today the only role we issue is 'admin',
// but the token format (expiry.role.signature) leaves room for 'faculty' or
// other roles without changing the cookie format.
//
// On login: server validates the password (constant-time) against ADMIN_PASSWORD,
// issues a token, sets it as an httpOnly+Secure+SameSite=Lax cookie ("admin_session").
// Middleware verifies on every protected request: HMAC must match and not be expired.
// Rotating ADMIN_SESSION_SECRET in env immediately invalidates every existing session.

export const ADMIN_COOKIE_NAME = 'admin_session';
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const DEFAULT_PASSWORD = '1868';
const DEFAULT_SECRET = 'change-me-set-ADMIN_SESSION_SECRET-in-netlify-env';

export type Role = 'admin' | 'faculty';
export type Session = { role: Role };

let warnedDefaults = false;

function getConfig() {
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET || DEFAULT_SECRET;
  if (!warnedDefaults && (password === DEFAULT_PASSWORD || secret === DEFAULT_SECRET)) {
    if (typeof console !== 'undefined') {
      console.warn(
        '[adminAuth] Using default password/secret. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in your environment for production.'
      );
    }
    warnedDefaults = true;
  }
  return { password, secret };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function validatePassword(submitted: string): Promise<boolean> {
  const { password } = getConfig();
  if (typeof submitted !== 'string') return false;
  return constantTimeEqual(submitted, password);
}

// Token format: "<expiryMillis>.<role>.<hexHmac>"
export async function issueToken(role: Role = 'admin', now: number = Date.now()): Promise<string> {
  const { secret } = getConfig();
  const expiry = (now + ADMIN_SESSION_TTL_MS).toString();
  const payload = `${expiry}.${role}`;
  const sig = await hmacSha256Hex(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySession(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<Session | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expiry, role, sig] = parts;
  const expiryNum = Number(expiry);
  if (!Number.isFinite(expiryNum)) return null;
  if (expiryNum < now) return null;
  if (role !== 'admin' && role !== 'faculty') return null;
  const { secret } = getConfig();
  const expected = await hmacSha256Hex(`${expiry}.${role}`, secret);
  if (!constantTimeEqual(sig, expected)) return null;
  return { role: role as Role };
}

// Convenience wrappers — keeps callers simple while we still only have one role.
export async function verifyToken(token: string | undefined | null, now?: number): Promise<boolean> {
  return (await verifySession(token, now)) !== null;
}
export async function verifyAdmin(token: string | undefined | null, now?: number): Promise<boolean> {
  const s = await verifySession(token, now);
  return s !== null && s.role === 'admin';
}

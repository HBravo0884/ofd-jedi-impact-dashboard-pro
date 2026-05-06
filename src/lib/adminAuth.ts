// Edge-compatible HMAC-signed admin session token.
// Uses Web Crypto so this works in both Node and Edge runtimes (middleware).
//
// Design:
//   - On login, server validates the submitted password (constant-time) against ADMIN_PASSWORD.
//   - On success, server issues a token: `${expiry}.${hmacHex(expiry, ADMIN_SESSION_SECRET)}`.
//   - The token is stored in an httpOnly, Secure, SameSite=Lax cookie ("admin_session").
//   - Middleware verifies the token on every protected request: HMAC must match and not be expired.
//   - Rotating ADMIN_SESSION_SECRET in env immediately invalidates all existing sessions.
//
// Defaults are safe-but-loud: if env vars aren't set, login still works (using defaults), but a
// warning appears in server logs reminding the operator to set them in production.

export const ADMIN_COOKIE_NAME = 'admin_session';
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const DEFAULT_PASSWORD = '1868';
const DEFAULT_SECRET = 'change-me-set-ADMIN_SESSION_SECRET-in-netlify-env';

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

// Constant-time string compare.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
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

export async function issueToken(now: number = Date.now()): Promise<string> {
  const { secret } = getConfig();
  const expiry = (now + ADMIN_SESSION_TTL_MS).toString();
  const sig = await hmacSha256Hex(expiry, secret);
  return `${expiry}.${sig}`;
}

export async function verifyToken(
  token: string | undefined | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiry = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiryNum = Number(expiry);
  if (!Number.isFinite(expiryNum)) return false;
  if (expiryNum < now) return false;
  const { secret } = getConfig();
  const expected = await hmacSha256Hex(expiry, secret);
  return constantTimeEqual(sig, expected);
}

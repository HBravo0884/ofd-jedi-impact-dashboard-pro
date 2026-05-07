import { prisma } from '@/lib/prisma';

// Runtime-tunable kiosk + signature thresholds, persisted in a single
// JSONB row in the KioskSettings table. Reads are cached for 30 seconds
// so the kiosk's per-check-in cost stays at one DB query at most.

export type KioskConfig = {
  // Bucket cutoffs (in confidence-percent space)
  SIGNATURE_VERIFIED_MIN?: number;
  SIGNATURE_LIKELY_MIN?: number;
  SIGNATURE_WEAK_MIN?: number;
  // legacy alias kept for backward compatibility with existing rows
  SIGNATURE_POSSIBLE_MIN?: number;
  SIGNATURE_RETRY_MIN?: number;

  // DTW / structural-penalty knobs
  SIGNATURE_DTW_MAX_PER_NODE?: number;
  SIGNATURE_AR_PENALTY_K?: number;
  SIGNATURE_STROKE_PENALTY_K?: number;
  SIGNATURE_PATHLEN_PENALTY_K?: number;
};

const TTL_MS = 30 * 1000;
let cached: { config: KioskConfig; at: number } | null = null;

export async function getKioskConfig(): Promise<KioskConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      'SELECT config FROM "KioskSettings" WHERE id = 1'
    )) as { config: any }[];
    const cfg: KioskConfig =
      rows && rows.length > 0 && typeof rows[0].config === 'object'
        ? (rows[0].config as KioskConfig)
        : {};
    cached = { config: cfg, at: Date.now() };
    return cfg;
  } catch (e) {
    // If the table is missing or the query fails, fall back to {} so we
    // continue using env-var defaults instead of breaking the kiosk.
    console.warn('[kioskSettings] read failed:', (e as any)?.message);
    return {};
  }
}

export async function setKioskConfig(patch: Partial<KioskConfig>): Promise<KioskConfig> {
  const current = await getKioskConfig();
  const merged: KioskConfig = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) {
      delete (merged as any)[k];
    } else {
      (merged as any)[k] = v;
    }
  }
  await prisma.$executeRawUnsafe(
    'UPDATE "KioskSettings" SET config = $1::jsonb, "updatedAt" = NOW() WHERE id = 1',
    JSON.stringify(merged)
  );
  cached = { config: merged, at: Date.now() };
  return merged;
}

// Reset cache — used when settings are updated.
export function invalidateKioskConfigCache() {
  cached = null;
}

// Synchronous getter for the env-var-or-default value of a single key,
// used by signatureML helpers that don't have access to async DB calls.
// The actual scoring code reads via the async getter and stashes values
// on globalThis so the synchronous helpers can pick them up.
export function readNumber(key: keyof KioskConfig, fallback: number): number {
  const stash = (globalThis as any).__KIOSK_SETTINGS__ as KioskConfig | undefined;
  if (stash && typeof stash[key] === 'number') return stash[key] as number;
  const env = (typeof process !== 'undefined' && (process.env as any)?.[key]) as string | undefined;
  if (env !== undefined) {
    const n = parseFloat(env);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

// Push the current config into globalThis so synchronous readNumber()
// calls in signatureML pick up live values. Call at the start of any
// API route that uses scoring.
export async function priming() {
  (globalThis as any).__KIOSK_SETTINGS__ = await getKioskConfig();
}

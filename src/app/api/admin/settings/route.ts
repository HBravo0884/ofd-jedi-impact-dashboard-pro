import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { getKioskConfig, setKioskConfig, invalidateKioskConfigCache } from '@/lib/kioskSettings';

export const revalidate = 0;

const NUMERIC_KEYS = [
  'SIGNATURE_VERIFIED_MIN',
  'SIGNATURE_LIKELY_MIN',
  'SIGNATURE_WEAK_MIN',
  // legacy alias kept so old payloads still work
  'SIGNATURE_POSSIBLE_MIN',
  'SIGNATURE_RETRY_MIN',
  'SIGNATURE_DTW_MAX_PER_NODE',
  'SIGNATURE_AR_PENALTY_K',
  'SIGNATURE_STROKE_PENALTY_K',
  'SIGNATURE_PATHLEN_PENALTY_K',
] as const;

export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const config = await getKioskConfig();
  return NextResponse.json({ config });
}

export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const patch: Record<string, any> = {};
  for (const k of NUMERIC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const v = body[k];
      if (v === null || v === '' || v === undefined) {
        patch[k] = null; // delete
      } else {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: `${k} must be a number` }, { status: 400 });
        }
        patch[k] = n;
      }
    }
  }
  const merged = await setKioskConfig(patch as any);
  invalidateKioskConfigCache();
  return NextResponse.json({ ok: true, config: merged });
}

// Reset all settings to defaults (deletes the row's contents)
export async function DELETE() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await setKioskConfig({
    SIGNATURE_VERIFIED_MIN: null as any,
    SIGNATURE_LIKELY_MIN: null as any,
    SIGNATURE_WEAK_MIN: null as any,
    SIGNATURE_POSSIBLE_MIN: null as any,
    SIGNATURE_RETRY_MIN: null as any,
    SIGNATURE_DTW_MAX_PER_NODE: null as any,
    SIGNATURE_AR_PENALTY_K: null as any,
    SIGNATURE_STROKE_PENALTY_K: null as any,
    SIGNATURE_PATHLEN_PENALTY_K: null as any,
  });
  invalidateKioskConfigCache();
  return NextResponse.json({ ok: true });
}

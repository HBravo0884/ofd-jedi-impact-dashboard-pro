import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import {
  extractPath,
  normalizePoints,
  resamplePoints,
  dynamicTimeWarping,
  calculateConfidence,
} from '@/lib/signatureML';

export const revalidate = 0;

// POST /api/admin/signature-trainer/test  { facultyId, signatureTrace }
//
// Read-only DTW scoring against an existing baseline. Does NOT write to
// the database — does not append a baseline sample, does not record any
// attendance. Designed for live CME demo.
//
// Returns the overall score, the action bucket, and the per-baseline-sample
// breakdown so the UI can visualize 'best of N' vs each individual sample.
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { facultyId, signatureTrace } = body || {};
  if (!facultyId) return NextResponse.json({ error: 'facultyId required' }, { status: 400 });
  if (!Array.isArray(signatureTrace) || signatureTrace.length === 0) {
    return NextResponse.json({ error: 'signatureTrace required (non-empty array)' }, { status: 400 });
  }

  const f = await prisma.faculty.findUnique({
    where: { id: String(facultyId) },
    select: { id: true, firstName: true, lastName: true, signatureUrls: true },
  });
  if (!f) return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });

  const baseline = (f.signatureUrls || [])
    .map((s: string) => { try { return JSON.parse(s); } catch { return null; } })
    .filter((x: any) => x);

  if (baseline.length === 0) {
    return NextResponse.json({
      ok: true,
      hasBaseline: false,
      mlScore: null,
      mlAction: 'NO_BASELINE',
      message: 'No baseline samples on file — train at least one signature first.',
      facultyName: `${f.firstName} ${f.lastName}`,
      baselineCount: 0,
    });
  }

  // Run DTW against every baseline sample; report per-sample + overall (best).
  const currentPoints = resamplePoints(normalizePoints(extractPath(signatureTrace)), 50);
  const perSample: Array<{ index: number; dtw: number; confidence: number }> = [];
  let bestDtw = Infinity;
  let bestIdx = -1;
  for (let i = 0; i < baseline.length; i++) {
    try {
      const histPoints = resamplePoints(normalizePoints(extractPath(baseline[i])), 50);
      const dtw = dynamicTimeWarping(histPoints, currentPoints);
      const confidence = calculateConfidence(dtw, 50);
      perSample.push({ index: i, dtw, confidence });
      if (dtw < bestDtw) { bestDtw = dtw; bestIdx = i; }
    } catch (e) {
      perSample.push({ index: i, dtw: Infinity, confidence: 0 });
    }
  }

  const mlScore = bestIdx >= 0 ? calculateConfidence(bestDtw, 50) : 0;
  const mlAction =
    mlScore >= 75 ? 'VERIFIED'
    : mlScore >= 50 ? 'POSSIBLE_MATCH'
    : 'SUSPICIOUS_MISMATCH';

  return NextResponse.json({
    ok: true,
    hasBaseline: true,
    facultyName: `${f.firstName} ${f.lastName}`,
    baselineCount: baseline.length,
    mlScore,
    mlAction,
    bestSampleIndex: bestIdx,
    bestDtw,
    perSample,
  });
}

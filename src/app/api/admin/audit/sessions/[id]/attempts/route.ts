import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { priming as primeKioskSettings } from '@/lib/kioskSettings';
import {
  extractPath, normalizePoints, resamplePoints, dynamicTimeWarping,
  bucketForScore, combinedConfidence, getBoundingBox, getPathLength, getStrokeCount,
} from '@/lib/signatureML';

export const revalidate = 0;

// POST /api/admin/audit/sessions/[id]/attempts
// Body: { label: 'GENUINE'|'IMPOSTER', signatureTrace: any[], notes?: string }
//
// Scores the signature against the audited faculty's baseline (READ-ONLY —
// does NOT push to baseline, does NOT record an attendance), and persists
// the attempt for later report generation.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await primeKioskSettings();
  const { id } = await params;

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { label, signatureTrace, notes } = body || {};
  if (label !== 'GENUINE' && label !== 'IMPOSTER') {
    return NextResponse.json({ error: 'label must be GENUINE or IMPOSTER' }, { status: 400 });
  }
  if (!Array.isArray(signatureTrace) || signatureTrace.length === 0) {
    return NextResponse.json({ error: 'signatureTrace required' }, { status: 400 });
  }

  const sessionRows = (await prisma.$queryRawUnsafe(
    `SELECT "facultyId" FROM "AuditSession" WHERE id = $1`, id
  )) as any[];
  if (sessionRows.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const facultyId = sessionRows[0].facultyId;

  const fac = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { signatureUrls: true },
  });
  const baseline: any[] = (fac?.signatureUrls || [])
    .map((s: string) => { try { return JSON.parse(s); } catch { return null; } })
    .filter((x: any) => x);

  if (baseline.length === 0) {
    return NextResponse.json({ error: 'Faculty has no baseline signatures.' }, { status: 422 });
  }

  // Score against every baseline; keep best.
  const curRaw = extractPath(signatureTrace);
  const curBB = getBoundingBox(curRaw);
  const curStrokes = getStrokeCount(signatureTrace);
  const curLen = getPathLength(curRaw);
  const currentPoints = resamplePoints(normalizePoints(curRaw), 50);

  const perSample: any[] = [];
  let bestScore = 0;
  for (let i = 0; i < baseline.length; i++) {
    const histRaw = extractPath(baseline[i]);
    if (histRaw.length < 2) continue;
    const histBB = getBoundingBox(histRaw);
    const histPoints = resamplePoints(normalizePoints(histRaw), 50);
    const dtw = dynamicTimeWarping(histPoints, currentPoints);
    const c = combinedConfidence({
      dtwCost: dtw, numNodes: 50,
      ar1: (curBB.w  || 1) / (curBB.h  || 1),
      ar2: (histBB.w || 1) / (histBB.h || 1),
      strokes1: curStrokes, strokes2: getStrokeCount(baseline[i]),
      pathLen1: curLen, pathLen2: getPathLength(histRaw),
    });
    perSample.push({ index: i, dtw, ...c });
    if (c.score > bestScore) bestScore = c.score;
  }
  const bucket = bucketForScore(bestScore);

  const attemptId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuditAttempt" (id, "sessionId", label, score, bucket, "perSample", notes)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    attemptId, id, label, bestScore, bucket,
    JSON.stringify({ best: bestScore, samples: perSample, trace: signatureTrace }),
    notes ? String(notes) : null
  );

  return NextResponse.json({
    ok: true,
    attempt: { id: attemptId, label, score: bestScore, bucket, perSample },
  });
}

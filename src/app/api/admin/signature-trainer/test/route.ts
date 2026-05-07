import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { priming as primeKioskSettings } from '@/lib/kioskSettings';
import {
  extractPath,
  normalizePoints,
  resamplePoints,
  dynamicTimeWarping,
  bucketForScore,
  combinedConfidence,
  getBoundingBox,
  getPathLength,
  getStrokeCount,
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
  await primeKioskSettings();

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

  // Run DTW + structural penalties against every baseline sample;
  // report the full per-sample breakdown so the demo UI can visualize
  // how each penalty multiplier contributed.
  const curRaw = extractPath(signatureTrace);
  const curBB = getBoundingBox(curRaw);
  const curStrokes = getStrokeCount(signatureTrace);
  const curLen = getPathLength(curRaw);
  const currentPoints = resamplePoints(normalizePoints(curRaw), 50);

  const perSample: Array<{
    index: number; dtw: number; confidence: number;
    dtwOnly: number; arMul: number; strokeMul: number; pathMul: number;
  }> = [];
  let bestScore = 0;
  let bestIdx = -1;
  for (let i = 0; i < baseline.length; i++) {
    try {
      const histRaw = extractPath(baseline[i]);
      if (histRaw.length < 2) {
        perSample.push({ index: i, dtw: Infinity, confidence: 0, dtwOnly: 0, arMul: 0, strokeMul: 0, pathMul: 0 });
        continue;
      }
      const histBB = getBoundingBox(histRaw);
      const histPoints = resamplePoints(normalizePoints(histRaw), 50);
      const dtw = dynamicTimeWarping(histPoints, currentPoints);
      const c = combinedConfidence({
        dtwCost: dtw, numNodes: 50,
        ar1: (curBB.w  || 1) / (curBB.h  || 1),
        ar2: (histBB.w || 1) / (histBB.h || 1),
        strokes1: curStrokes, strokes2: getStrokeCount(baseline[i]),
        pathLen1: curLen,    pathLen2: getPathLength(histRaw),
      });
      perSample.push({
        index: i, dtw, confidence: c.score,
        dtwOnly: c.dtwOnly, arMul: c.arMul, strokeMul: c.strokeMul, pathMul: c.pathMul,
      });
      if (c.score > bestScore) { bestScore = c.score; bestIdx = i; }
    } catch (e) {
      perSample.push({ index: i, dtw: Infinity, confidence: 0, dtwOnly: 0, arMul: 0, strokeMul: 0, pathMul: 0 });
    }
  }

  const mlScore = bestScore;
  const bestDtw = bestIdx >= 0 ? perSample[bestIdx].dtw : Infinity;
  const mlAction = bucketForScore(mlScore);

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

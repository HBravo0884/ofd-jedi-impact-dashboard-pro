import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { priming as primeKioskSettings } from '@/lib/kioskSettings';
import { serializeTrace } from '@/lib/serializeTrace';
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
import { isClinicianDegrees } from '@/lib/clinician';

export const revalidate = 0;

// PUBLIC kiosk check-in endpoint.
// Enforces signature requirement for clinicians (degrees include MD/DO/etc.)
// Returns DTW biometric similarity if a signature baseline exists.
export async function POST(req: Request) {
  try {
    await primeKioskSettings();
    const body = await req.json();
    const { facultyId, name, eventId, signatureTrace } = body || {};
    const attempt    = Number.isFinite(Number(body?.attempt))     ? Math.max(1, Number(body.attempt))     : 1;
    const maxAttempts = Number.isFinite(Number(body?.maxAttempts)) ? Math.max(1, Number(body.maxAttempts)) : 3;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 });
    }
    if (!facultyId && (!name || String(name).trim().length < 3)) {
      return NextResponse.json({ error: 'Faculty ID or a typed name is required.' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: String(eventId) },
      select: { id: true, title: true, baseDuration: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    let faculty: any = null;

    // Mode 1: trusted ID from autocomplete.
    if (facultyId) {
      faculty = await prisma.faculty.findUnique({ where: { id: String(facultyId) } });
    }

    // Mode 2: free-text name. Same identity ladder as /api/ingest.
    if (!faculty && name) {
      const cleanName = String(name).trim();
      const parts = cleanName.split(/\s+/);
      const firstName = parts[0] || 'Unknown';
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Unknown';

      faculty = await prisma.faculty.findFirst({
        where: {
          firstName: { equals: firstName, mode: 'insensitive' },
          lastName:  { equals: lastName,  mode: 'insensitive' },
        },
      });

      if (!faculty) {
        faculty = await prisma.faculty.findFirst({
          where: { aliases: { has: cleanName } },
        });
      }

      if (!faculty) {
        const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]+/g, '');
        const phantomEmail = `phantom_${slug}@pending.com`;
        try {
          faculty = await prisma.faculty.create({
            data: {
              firstName,
              lastName,
              email: phantomEmail,
              aliases: [cleanName],
              status: 'PENDING_RESOLUTION',
              department: 'Other',
              rank: 'Unknown',
            },
          });
        } catch (err: any) {
          faculty = await prisma.faculty.findUnique({ where: { email: phantomEmail } });
          if (!faculty) throw err;
        }
      }
    }

    if (!faculty) {
      return NextResponse.json({ error: 'Could not resolve attendee.' }, { status: 500 });
    }

    // ── Clinician signature gate ─────────────────────────────────────────
    const clinician = isClinicianDegrees(faculty.degrees);
    const hasSignature = Array.isArray(signatureTrace) && signatureTrace.length > 0;

    if (clinician && !hasSignature) {
      return NextResponse.json(
        {
          error: 'A signature is required for clinicians (MD/DO/MBBS/etc.) for CME audit.',
          isClinician: true,
        },
        { status: 422 }
      );
    }

    // ── Optional biometric DTW similarity score ──────────────────────────
    // Returns -1 when no baseline yet (treat as "first sample, baseline acquired").
    let mlScore = -1;
    if (hasSignature) {
      try {
        const curRaw = extractPath(signatureTrace);
        const curBB = getBoundingBox(curRaw);
        const curStrokes = getStrokeCount(signatureTrace);
        const curLen = getPathLength(curRaw);
        const currentPoints = resamplePoints(normalizePoints(curRaw), 50);

        const historicalTraces: any[] = (faculty.signatureUrls || [])
          .map((s: string) => { try { return JSON.parse(s); } catch { return null; } })
          .filter((x: any) => x);

        if (historicalTraces.length > 0) {
          let bestScore = 0;
          for (const hist of historicalTraces) {
            const histRaw = extractPath(hist);
            if (histRaw.length < 2) continue;
            const histBB = getBoundingBox(histRaw);
            const histPoints = resamplePoints(normalizePoints(histRaw), 50);
            const dtw = dynamicTimeWarping(histPoints, currentPoints);
            const cur = combinedConfidence({
              dtwCost: dtw, numNodes: 50,
              ar1: (curBB.w  || 1) / (curBB.h  || 1),
              ar2: (histBB.w || 1) / (histBB.h || 1),
              strokes1: curStrokes, strokes2: getStrokeCount(hist),
              pathLen1: curLen,    pathLen2: getPathLength(histRaw),
            });
            if (cur.score > bestScore) bestScore = cur.score;
          }
          mlScore = bestScore;
        }
      } catch (e) {
        console.warn('signature scoring failed (non-fatal):', e);
      }
    }

    // Retry guard — if the signature scored too low AND the kiosk has
    // more attempts allowed, hand the work back to the client without
    // committing anything. We also don't push the bad sample to the
    // baseline. Only applies to clinicians with an existing baseline,
    // since non-clinicians don't have a confidence to compare against.
    const retryMin = parseFloat(
      (typeof process !== 'undefined' && process.env?.SIGNATURE_RETRY_MIN) ||
      (typeof process !== 'undefined' && process.env?.SIGNATURE_POSSIBLE_MIN) ||
      '40'
    );
    if (
      hasSignature &&
      mlScore !== -1 &&                  // skip 'first sample / baseline acquired'
      clinician &&                       // only require retries for clinicians
      mlScore < retryMin &&
      attempt < maxAttempts
    ) {
      return NextResponse.json({
        ok: false,
        retry: true,
        attempt,
        maxAttempts,
        attemptsLeft: maxAttempts - attempt,
        mlScore,
        mlAction: bucketForScore(mlScore),
        faculty: {
          id: faculty.id,
          firstName: faculty.firstName,
          lastName: faculty.lastName,
          isClinician: clinician,
        },
        message:
          'Your signature didn\'t closely match the on-file baseline. Please try again, signing a little more deliberately in your usual style.',
      });
    }

    // Now actually persist: append the signature trace to the baseline (if
    // we have one) so future check-ins compare against this newer sample,
    // and write the attendance row.
    if (hasSignature) {
      try {
        await prisma.faculty.update({
          where: { id: faculty.id },
          data: { signatureUrls: { push: serializeTrace(signatureTrace) } },
        });
      } catch (e) {
        console.warn('signature persist failed (non-fatal):', e);
      }
    }

    // Idempotent attendance write
    await prisma.attendance.upsert({
      where: { facultyId_eventId: { facultyId: faculty.id, eventId: event.id } },
      update: { durationJoined: event.baseDuration },
      create: {
        facultyId: faculty.id,
        eventId: event.id,
        durationJoined: event.baseDuration,
      },
    });

    // Save the actual signature captured at THIS event so the sign-in sheet
    // PDF renders the exact signature from this check-in (not just the
    // latest baseline). Prisma client wasn't regenerated to know about the
    // new Attendance.signatureTrace column, so we use a raw UPDATE.
    if (hasSignature) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Attendance" SET "signatureTrace" = $1::jsonb
            WHERE "facultyId" = $2 AND "eventId" = $3`,
          serializeTrace(signatureTrace),
          faculty.id,
          event.id
        );
      } catch (e) {
        console.warn('per-event signature persist failed (non-fatal):', e);
      }
    }

    return NextResponse.json({
      ok: true,
      faculty: {
        id: faculty.id,
        firstName: faculty.firstName,
        lastName: faculty.lastName,
        status: faculty.status,
        isClinician: clinician,
      },
      event: { id: event.id, title: event.title },
      mlScore,
      mlAction:
        !hasSignature ? 'NO_SIGNATURE'
        : mlScore === -1 ? 'BASELINE_ACQUIRED'
        : bucketForScore(mlScore),
    });
  } catch (err: any) {
    console.error('Kiosk check-in failure:', err);
    return NextResponse.json({ error: err?.message || 'Server failure.' }, { status: 500 });
  }
}

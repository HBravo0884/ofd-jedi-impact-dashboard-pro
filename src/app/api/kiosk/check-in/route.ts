import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extractPath,
  normalizePoints,
  resamplePoints,
  dynamicTimeWarping,
  calculateConfidence,
} from '@/lib/signatureML';
import { isClinicianDegrees } from '@/lib/clinician';

export const revalidate = 0;

// PUBLIC kiosk check-in endpoint.
// Enforces signature requirement for clinicians (degrees include MD/DO/etc.)
// Returns DTW biometric similarity if a signature baseline exists.
export async function POST(req: Request) {
  try {
    const { facultyId, name, eventId, signatureTrace } = await req.json();

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
        const currentPoints = resamplePoints(normalizePoints(extractPath(signatureTrace)), 50);
        const historicalTraces = (faculty.signatureUrls || [])
          .map((s: string) => { try { return JSON.parse(s); } catch { return null; } })
          .filter((x: any) => x);
        if (historicalTraces.length > 0) {
          let bestDtw = Infinity;
          for (const hist of historicalTraces) {
            const histPoints = resamplePoints(normalizePoints(extractPath(hist)), 50);
            const score = dynamicTimeWarping(histPoints, currentPoints);
            if (score < bestDtw) bestDtw = score;
          }
          mlScore = calculateConfidence(bestDtw, 50);
        }
        // Append this trace to the faculty's history (capped to ~5KB per trace).
        await prisma.faculty.update({
          where: { id: faculty.id },
          data: { signatureUrls: { push: JSON.stringify(signatureTrace).slice(0, 5000) } },
        });
      } catch (e) {
        console.warn('signature scoring failed (non-fatal):', e);
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
        : mlScore >= 75 ? 'VERIFIED'
        : mlScore >= 50 ? 'POSSIBLE_MATCH'
        : 'SUSPICIOUS_MISMATCH',
    });
  } catch (err: any) {
    console.error('Kiosk check-in failure:', err);
    return NextResponse.json({ error: err?.message || 'Server failure.' }, { status: 500 });
  }
}

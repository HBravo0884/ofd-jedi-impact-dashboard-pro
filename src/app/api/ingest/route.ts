import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { extractCanonicalIdentity, isDnaMatch } from '@/lib/heuristics';
import type { AcademicRank, ProfileStatus } from '@prisma/client';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ingest
// Admin-only. Accepts a Zoom CSV payload and writes one Event + N Attendances
// to Supabase, deduplicating Faculty rows aggressively so we never re-fragment
// the directory the way the original April-16 ingestion did.
//
// Identity matching tiers (in order):
//   T1. Real email exact match
//   T2. firstName + lastName exact match  ← NEW: prevents legacy_*@pending.com
//                                            duplicate explosion on re-ingest
//   T3. DNA / alias fuzzy match           (Levenshtein-style >= 85%)
//   T4. Create new — deterministic phantom email built from canonical name
//                    so retries reuse the row instead of creating fresh ones.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── ADMIN AUTH ────────────────────────────────────────────────────────────
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized — admin session required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { eventTitle, eventDate, baseDuration, attendees, seriesId } = body;

    // 1. Transactional safeguards
    if (!eventTitle || !eventDate || !attendees || !Array.isArray(attendees)) {
      return NextResponse.json({ error: 'Malformed payload.' }, { status: 400 });
    }

    // 2. Ghost Session Filter (methodology requirement — < 5 unique participants)
    if (attendees.length < 5) {
      return NextResponse.json(
        { error: 'Ghost Session Filter triggered: fewer than 5 participants. Inference suspended.' },
        { status: 406 }
      );
    }

    // 3. Resolve the Event row.
    //    The DB now has a UNIQUE(seriesId, date::date, title) constraint, so a
    //    duplicate ingest of the same source CSV cannot create a second event.
    //    findFirst → create OR update so re-ingests on the same date are idempotent.
    const eventDateObj = new Date(eventDate);
    let event = await prisma.event.findFirst({
      where: {
        title: eventTitle,
        date: { gte: new Date(eventDateObj.toISOString().slice(0, 10) + 'T00:00:00.000Z'),
                lt:  new Date(eventDateObj.toISOString().slice(0, 10) + 'T23:59:59.999Z') },
        ...(seriesId ? { seriesId } : {}),
      },
    });
    if (!event) {
      event = await prisma.event.create({
        data: {
          title: eventTitle,
          date: eventDateObj,
          baseDuration: Number(baseDuration) || 60,
          ...(seriesId ? { seriesId } : {}),
        },
      });
    }

    // 4. Load every Faculty row into memory once. We need firstName / lastName
    //    on top of the existing fields so T2 (exact name match) can fire.
    const allFacultyProfiles = await prisma.faculty.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        aliases: true,
        status: true,
        degrees: true,
      },
    });

    // Build a name → faculty index for O(1) T2 lookups.
    const byName = new Map<string, typeof allFacultyProfiles[number]>();
    for (const f of allFacultyProfiles) {
      byName.set(`${f.firstName.toLowerCase()}|${f.lastName.toLowerCase()}`, f);
    }
    const byEmail = new Map<string, typeof allFacultyProfiles[number]>();
    for (const f of allFacultyProfiles) {
      if (f.email) byEmail.set(f.email.toLowerCase(), f);
    }

    let recordsWritten = 0;
    let recordsSkipped = 0;
    let matchedExisting = 0;
    let createdNew = 0;

    for (const person of attendees) {
      if (!person?.name) {
        recordsSkipped++;
        continue;
      }

      // Coerce duration to number defensively — older callers (or buggy
      // future ones) might send a string, which Prisma now rejects with
      // 'Argument durationJoined: Expected Int, provided String'.
      const durationNum = Number(person.duration);
      const inferred = extractCanonicalIdentity(
        person.name,
        person.email,
        Number.isFinite(durationNum) ? durationNum : 0
      );

      // Micro-session filter: < 10 minutes is a flyby, drop it.
      if (inferred.duration < 10) {
        recordsSkipped++;
        continue;
      }

      const nameParts = inferred.cleanName.split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown';

      // T1 — Exact email match.
      let matched = inferred.email ? byEmail.get(inferred.email.toLowerCase()) ?? null : null;

      // T2 — Exact firstName + lastName match. THE bug fix vs. previous version.
      if (!matched) {
        matched = byName.get(`${firstName.toLowerCase()}|${lastName.toLowerCase()}`) ?? null;
      }

      // T3 — DNA / alias fuzzy match.
      if (!matched) {
        matched =
          allFacultyProfiles.find((f: any) =>
            f.aliases.some((alias: string) => isDnaMatch(alias, person.name, 0.85))
          ) ?? null;
      }

      let facultyId: string;

      if (matched) {
        matchedExisting++;
        facultyId = matched.id;

        // Active learning: grow the alias and degree dictionaries.
        const newAliases = Array.from(new Set([...matched.aliases, person.name]));
        const newDegrees = Array.from(new Set([...matched.degrees, ...inferred.inferredDegrees]));

        // Upgrade PENDING → VERIFIED if a real Howard email shows up.
        let newStatus: ProfileStatus = matched.status;
        if (
          matched.status === 'PENDING_RESOLUTION' &&
          (inferred.email || '').includes('howard.edu')
        ) {
          newStatus = 'VERIFIED';
        }

        await prisma.faculty.update({
          where: { id: facultyId },
          data: { aliases: newAliases, degrees: newDegrees, status: newStatus },
        });
      } else {
        createdNew++;

        // Deterministic phantom email — same canonical name → same email,
        // so an accidental re-ingest still resolves to the same row in T1.
        const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]+/g, '');
        const phantomEmail = inferred.email || `phantom_${slug}@pending.com`;

        const newStatus: ProfileStatus = inferred.email ? 'VERIFIED' : 'PENDING_RESOLUTION';

        try {
          const created = await prisma.faculty.create({
            data: {
              firstName,
              lastName,
              email: phantomEmail,
              aliases: [person.name],
              degrees: inferred.inferredDegrees,
              division: inferred.inferredDivision,
              rank: inferred.inferredRank as AcademicRank,
              department: 'Other', // awaiting manual mapping by admin
              status: newStatus,
            },
          });
          facultyId = created.id;
          // Add to in-memory caches so subsequent attendees in this batch with
          // the same name reuse this brand-new row instead of creating again.
          allFacultyProfiles.push({
            id: created.id,
            email: phantomEmail,
            firstName,
            lastName,
            aliases: [person.name],
            status: newStatus,
            degrees: inferred.inferredDegrees,
          });
          byName.set(`${firstName.toLowerCase()}|${lastName.toLowerCase()}`, allFacultyProfiles[allFacultyProfiles.length - 1]);
          byEmail.set(phantomEmail.toLowerCase(), allFacultyProfiles[allFacultyProfiles.length - 1]);
        } catch (err: any) {
          // Unique-email collision — race or pre-existing phantom row. Re-fetch.
          const existing = await prisma.faculty.findUnique({ where: { email: phantomEmail } });
          if (!existing) throw err;
          facultyId = existing.id;
          matchedExisting++;
          createdNew--;
        }
      }

      // Bind attendance — schema unique constraint on (facultyId, eventId)
      // means we never double-count even on a retry.
      const durationInt = Number(inferred.duration) || 0;
      await prisma.attendance.upsert({
        where: { facultyId_eventId: { facultyId, eventId: event.id } },
        update: { durationJoined: durationInt },
        create: { facultyId, eventId: event.id, durationJoined: durationInt },
      });

      recordsWritten++;
    }

    return NextResponse.json(
      {
        message: 'Ingest complete.',
        eventId: event.id,
        eventTitle: event.title,
        recordsWritten,
        recordsSkipped,
        matchedExisting,
        createdNew,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Ingestion API failure:', error);
    return NextResponse.json(
      { error: error?.message || 'Database connection failure.' },
      { status: 500 }
    );
  }
}

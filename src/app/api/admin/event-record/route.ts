import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── GET /api/admin/event-record ──────────────────────────────────────────
// Admin-only. Returns every event with the columns the Event Record page
// needs: date, time, location, series, title, speakers (1/2/3),
// baseDuration, isGrandRounds, unique attendees count, and SUM of all
// durationJoined across attendees for the event (totalMinutes).
//
// Uses prisma.attendance.groupBy for fast per-event totals (one query,
// no per-row payload). CME-only fields (eventTime, location,
// isGrandRounds) live on Event but aren't in Prisma's generated client
// types, so we read them via a side raw-SQL query.
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const totals = await prisma.attendance.groupBy({
    by: ['eventId'],
    _sum: { durationJoined: true },
    _count: { eventId: true },
  });
  const totalsMap = new Map<string, { sumMin: number; uniq: number }>();
  for (const t of totals as any[]) {
    totalsMap.set(t.eventId, {
      sumMin: t._sum.durationJoined || 0,
      uniq: t._count.eventId || 0,
    });
  }

  const events = await prisma.event.findMany({
    orderBy: { date: 'desc' },
    include: { series: { select: { id: true, title: true } } },
  });

  // CME fields via raw SQL
  let cmeMap = new Map<string, any>();
  try {
    const eventIds = events.map((e: any) => e.id);
    if (eventIds.length > 0) {
      const cmeRows = (await prisma.$queryRawUnsafe(
        `SELECT id, "eventTime", "location", "isGrandRounds"
           FROM "Event"
          WHERE id = ANY($1::text[])`,
        eventIds,
      )) as any[];
      for (const r of cmeRows) cmeMap.set(r.id, r);
    }
  } catch {
    // Degrades gracefully if CME migration hasn't run
  }

  return NextResponse.json({
    events: events.map((e: any) => {
      const t = totalsMap.get(e.id) || { sumMin: 0, uniq: 0 };
      const cme = cmeMap.get(e.id) || {};
      return {
        id: e.id,
        title: e.title,
        topic: e.topic || null,
        date: e.date.toISOString().split('T')[0],
        eventTime: cme.eventTime || null,
        location: cme.location || null,
        isGrandRounds: !!cme.isGrandRounds,
        baseDuration: e.baseDuration || 60,
        seriesId: e.seriesId || null,
        seriesTitle: e.series?.title || null,
        speaker:  e.speaker  || null,
        speaker2: e.speaker2 || null,
        speaker3: e.speaker3 || null,
        uniqueAttendees: t.uniq,
        totalMinutes: t.sumMin,
        hiddenFromKiosk: !!e.hiddenFromKiosk,
      };
    }),
  });
}

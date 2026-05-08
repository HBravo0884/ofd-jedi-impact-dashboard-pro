import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// PUBLIC — used by the iPad kiosk (no admin cookie required since the kiosk
// is meant to be left open for attendees). Returns events that are eligible
// for check-in.
//
// Window: -90 days to +60 days. Wide enough that admins don't have to
// re-create events for the kiosk; the full event roster auto-populates here.
// Capped at 200 rows so pathological histories don't blow up the kiosk.
export async function GET() {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const lo = new Date(now.getTime() - 90 * day);
  const hi = new Date(now.getTime() + 60 * day);

  const events = await prisma.event.findMany({
    where: { date: { gte: lo, lte: hi } },
    orderBy: { date: 'desc' },
    include: { series: { select: { title: true } } },
    take: 200,
  });

  return NextResponse.json({
    events: events.map((e: any) => ({
      id: e.id,
      title: e.title,
      date: e.date.toISOString().split('T')[0],
      series: e.series?.title || null,
    })),
  });
}

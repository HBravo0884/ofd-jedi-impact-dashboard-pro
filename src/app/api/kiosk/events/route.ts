import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// PUBLIC — used by the iPad kiosk (no admin cookie required since the kiosk
// is meant to be left open for attendees). Returns events that are eligible
// for check-in: today, the past 14 days, and the next 14 days.
//
// We deliberately do NOT return future events further out, so a kiosk left
// on a desk can't be used to leak the upcoming program calendar.
export async function GET() {
  const now = new Date();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  const lo = new Date(now.getTime() - fourteenDays);
  const hi = new Date(now.getTime() + fourteenDays);

  const events = await prisma.event.findMany({
    where: { date: { gte: lo, lte: hi } },
    orderBy: { date: 'desc' },
    include: { series: { select: { title: true } } },
    take: 60,
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

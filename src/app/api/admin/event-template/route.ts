import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// GET /api/admin/event-template?seriesId=XYZ
// Returns autopopulation hints derived from past events in the same series:
//   - mostCommonDuration  : modal baseDuration across past events in the series
//   - lastTitle           : title of the most recent past event (for copy/edit)
//   - lastTopic           : topic of the most recent past event
//   - sampleTitles        : last 5 distinct titles for autocomplete suggestions
//
// The UI uses these to prefill the form so creating the next session in a
// recurring series is one-click instead of full data entry.
export async function GET(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const seriesId = new URL(req.url).searchParams.get('seriesId');
  if (!seriesId) {
    return NextResponse.json({ error: 'seriesId is required' }, { status: 400 });
  }

  const past = await prisma.event.findMany({
    where: { seriesId },
    orderBy: { date: 'desc' },
    take: 30,
    select: { title: true, topic: true, baseDuration: true, date: true },
  });

  if (past.length === 0) {
    return NextResponse.json({ template: null });
  }

  // Modal duration
  const counts = new Map<number, number>();
  for (const p of past) counts.set(p.baseDuration, (counts.get(p.baseDuration) || 0) + 1);
  const mostCommonDuration = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];

  // Last 5 distinct titles
  const seenTitles = new Set<string>();
  const sampleTitles: string[] = [];
  for (const p of past) {
    if (!seenTitles.has(p.title)) {
      seenTitles.add(p.title);
      sampleTitles.push(p.title);
      if (sampleTitles.length >= 5) break;
    }
  }

  return NextResponse.json({
    template: {
      mostCommonDuration,
      lastTitle: past[0].title,
      lastTopic: past[0].topic || '',
      sampleTitles,
      pastCount: past.length,
    },
  });
}

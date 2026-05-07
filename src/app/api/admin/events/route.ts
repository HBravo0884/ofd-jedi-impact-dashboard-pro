import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── GET /api/admin/events ─────────────────────────────────────────────────
// Admin only. Returns recent events (past 60 days + future) with their series.
// Used by the management UI to list and edit existing events.
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const lo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: { date: { gte: lo } },
    orderBy: { date: 'desc' },
    include: {
      series: { select: { id: true, title: true } },
      _count: { select: { attendances: true } },
    },
  });
  return NextResponse.json({
    events: events.map((e: any) => ({
      id: e.id,
      title: e.title,
      topic: e.topic || null,
      date: e.date.toISOString().split('T')[0],
      baseDuration: e.baseDuration,
      seriesId: e.seriesId || null,
      seriesTitle: e.series?.title || null,
      attendances: e._count.attendances,
    })),
  });
}

// ── POST /api/admin/events ────────────────────────────────────────────────
// Admin only. Create a new event. Returns the created row.
// The unique index on (seriesId, date::date, title) protects against duplicates.
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { title, topic, date, baseDuration, seriesId } = body || {};
  if (!title || String(title).trim().length < 3) {
    return NextResponse.json({ error: 'Title must be at least 3 characters.' }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: 'Date is required.' }, { status: 400 });
  }

  try {
    const created = await prisma.event.create({
      data: {
        title: String(title).trim(),
        topic: topic ? String(topic).trim() : null,
        date: new Date(date),
        baseDuration: Number(baseDuration) || 60,
        ...(seriesId ? { seriesId: String(seriesId) } : {}),
      },
    });
    return NextResponse.json({ ok: true, event: created }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'An event with this series, date, and title already exists.' },
        { status: 409 }
      );
    }
    console.error('Event create failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// ── DELETE /api/admin/events?id=XYZ ───────────────────────────────────────
// Admin only. Refuses to delete events with attendances unless ?force=1 is set.
export async function DELETE(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const force = url.searchParams.get('force') === '1';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const attendances = await prisma.attendance.count({ where: { eventId: id } });
  if (attendances > 0 && !force) {
    return NextResponse.json(
      { error: `Event has ${attendances} attendance records. Pass ?force=1 to override.`, attendances },
      { status: 409 }
    );
  }

  if (attendances > 0) {
    await prisma.attendance.deleteMany({ where: { eventId: id } });
  }
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true, deletedAttendances: attendances });
}

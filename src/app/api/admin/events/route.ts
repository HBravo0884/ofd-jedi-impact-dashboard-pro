import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// CME fields live on Event but Prisma client wasn't regenerated to know
// about them. We side-query them via raw SQL and merge into responses.
//
// Schema (added in supabase/2026-05-08_add_cme_event_fields.sql):
//   learningObjectives        TEXT[]
//   disclosureReport          TEXT
//   planningCommittee         TEXT
//   acknowledgmentOfSupport   TEXT
//   eventTime                 TEXT
//   location                  TEXT
//   isGrandRounds             BOOLEAN
type CmeRow = {
  id: string;
  learningObjectives: string[] | null;
  disclosureReport: string | null;
  planningCommittee: string | null;
  acknowledgmentOfSupport: string | null;
  eventTime: string | null;
  location: string | null;
  isGrandRounds: boolean | null;
};

async function loadCmeFields(eventIds: string[]): Promise<Map<string, CmeRow>> {
  const map = new Map<string, CmeRow>();
  if (eventIds.length === 0) return map;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id,
              "learningObjectives",
              "disclosureReport",
              "planningCommittee",
              "acknowledgmentOfSupport",
              "eventTime",
              "location",
              "isGrandRounds"
         FROM "Event"
        WHERE id = ANY($1::text[])`,
      eventIds
    )) as CmeRow[];
    for (const r of rows) map.set(r.id, r);
  } catch (e) {
    // If the migration hasn't been run yet, fall through with an empty
    // map so the page still renders. The sign-in sheet shows red
    // placeholders for every field.
    console.warn('[events] CME-field columns not yet present:', (e as any)?.message);
  }
  return map;
}

// ── GET /api/admin/events ─────────────────────────────────────────────────
// Admin only. Returns ALL events (full history) with CME fields and the
// hiddenFromKiosk visibility flag. The Manage Events directory-style page
// needs the full set so admins can find any historical event for editing
// or merging.
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const events = await prisma.event.findMany({
    orderBy: { date: 'desc' },
    include: {
      series: { select: { id: true, title: true } },
      _count: { select: { attendances: true } },
    },
  });
  const cme = await loadCmeFields(events.map((e: any) => e.id));
  return NextResponse.json({
    events: events.map((e: any) => {
      const c = cme.get(e.id);
      return {
        id: e.id,
        title: e.title,
        topic: e.topic || null,
        date: e.date.toISOString().split('T')[0],
        baseDuration: e.baseDuration,
        seriesId: e.seriesId || null,
        seriesTitle: e.series?.title || null,
        attendances: e._count.attendances,
        hiddenFromKiosk: !!e.hiddenFromKiosk,
        speaker:  e.speaker  || null,
        speaker2: e.speaker2 || null,
        speaker3: e.speaker3 || null,
        learningObjectives: c?.learningObjectives ?? [],
        disclosureReport: c?.disclosureReport ?? null,
        planningCommittee: c?.planningCommittee ?? null,
        acknowledgmentOfSupport: c?.acknowledgmentOfSupport ?? null,
        eventTime: c?.eventTime ?? null,
        location: c?.location ?? null,
        isGrandRounds: c?.isGrandRounds ?? false,
      };
    }),
  });
}

// ── POST /api/admin/events ────────────────────────────────────────────────
// Admin only. Create a new event. Accepts CME fields and writes them via
// raw SQL after the Prisma create.
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

    // Persist CME fields if any were supplied. Best-effort — if the
    // migration isn't run yet, the SQL fails and we just keep the event
    // without CME fields.
    await persistCmeFields(created.id, body);

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

// ── PATCH /api/admin/events?id=XYZ ────────────────────────────────────────
// Admin only. Update an existing event's core fields and/or CME fields.
// All fields are optional — only the keys present in the body are updated.
export async function PATCH(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  // Core fields update via Prisma
  try {
    const data: any = {};
    if (typeof body.title === 'string')         data.title = body.title.trim();
    if (typeof body.topic === 'string')         data.topic = body.topic.trim() || null;
    if (typeof body.date === 'string' && body.date) data.date = new Date(body.date);
    if (typeof body.baseDuration === 'number')  data.baseDuration = body.baseDuration;
    if (typeof body.seriesId === 'string' || body.seriesId === null) {
      data.seriesId = body.seriesId || null;
    }
    if (typeof body.hiddenFromKiosk === 'boolean') {
      data.hiddenFromKiosk = body.hiddenFromKiosk;
    }
    if (typeof body.speaker === 'string' || body.speaker === null) {
      data.speaker = body.speaker ? String(body.speaker).trim() : null;
    }
    if (typeof body.speaker2 === 'string' || body.speaker2 === null) {
      data.speaker2 = body.speaker2 ? String(body.speaker2).trim() : null;
    }
    if (typeof body.speaker3 === 'string' || body.speaker3 === null) {
      data.speaker3 = body.speaker3 ? String(body.speaker3).trim() : null;
    }
    if (Object.keys(data).length > 0) {
      await prisma.event.update({ where: { id }, data });
    }
    await persistCmeFields(id, body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Event update failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// Persist any of the CME fields supplied in the request body via raw SQL.
// Builds a single UPDATE with one column per supplied key, so unprovided
// keys are not touched.
async function persistCmeFields(eventId: string, body: any): Promise<void> {
  const updates: { sql: string; value: any }[] = [];
  if (Array.isArray(body.learningObjectives)) {
    updates.push({
      sql: '"learningObjectives" = $VAL::text[]',
      value: body.learningObjectives.map((s: any) => String(s)),
    });
  }
  if ('disclosureReport' in body) {
    updates.push({ sql: '"disclosureReport" = $VAL', value: body.disclosureReport ?? null });
  }
  if ('planningCommittee' in body) {
    updates.push({ sql: '"planningCommittee" = $VAL', value: body.planningCommittee ?? null });
  }
  if ('acknowledgmentOfSupport' in body) {
    updates.push({ sql: '"acknowledgmentOfSupport" = $VAL', value: body.acknowledgmentOfSupport ?? null });
  }
  if ('eventTime' in body) {
    updates.push({ sql: '"eventTime" = $VAL', value: body.eventTime ?? null });
  }
  if ('location' in body) {
    updates.push({ sql: '"location" = $VAL', value: body.location ?? null });
  }
  if ('isGrandRounds' in body) {
    updates.push({ sql: '"isGrandRounds" = $VAL', value: !!body.isGrandRounds });
  }
  if (updates.length === 0) return;

  // Stitch into a parameterized UPDATE statement.
  const params: any[] = [];
  const setClauses: string[] = [];
  for (const u of updates) {
    params.push(u.value);
    setClauses.push(u.sql.replace('$VAL', `$${params.length}`));
  }
  params.push(eventId);
  const sql = `UPDATE "Event" SET ${setClauses.join(', ')} WHERE id = $${params.length}`;
  try {
    await prisma.$executeRawUnsafe(sql, ...params);
  } catch (e) {
    // Migration not yet run, or column is gone. Don't fail the whole
    // request — the core event still got created/updated.
    console.warn('[events] CME-field UPDATE failed:', (e as any)?.message);
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

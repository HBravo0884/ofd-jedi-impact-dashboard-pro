import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── GET /api/admin/faculty/[id]/attendance ───────────────────────────────
// Admin-only. Returns the per-faculty drilldown payload used by the
// /admin/directory/[id] page:
//   • faculty profile (name, dept, rank, degrees, position type, aliases)
//   • full attendance history joined to event + series (date, duration)
//   • latestSignatureTrace  — the most recent serialized signature_pad
//     trace, or null if the faculty has never signed in. The drilldown
//     page deserializes this and renders it via <SignatureSVG>.
//   • baselineCount         — number of signatures on file
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const f = await prisma.faculty.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      division: true,
      rank: true,
      status: true,
      degrees: true,
      aliases: true,
      adminTitle: true,
      positionType: true,
      signatureUrls: true,
      createdAt: true,
    },
  });
  if (!f) return NextResponse.json({ error: 'Faculty not found.' }, { status: 404 });

  const attendances = await prisma.attendance.findMany({
    where: { facultyId: id },
    select: {
      id: true,
      durationJoined: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          baseDuration: true,
          topic: true,
          speaker: true,
          seriesId: true,
          series: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: [{ event: { date: 'desc' } }],
  });

  const baselineCount = Array.isArray(f.signatureUrls) ? f.signatureUrls.length : 0;
  const latestSignatureTrace =
    baselineCount > 0 ? f.signatureUrls[f.signatureUrls.length - 1] : null;

  return NextResponse.json({
    faculty: {
      id: f.id,
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email,
      department: String(f.department || '').replace(/([A-Z])/g, ' $1').trim(),
      departmentRaw: f.department,
      division: f.division,
      rank: String(f.rank || '').replace(/([A-Z])/g, ' $1').trim(),
      rankRaw: f.rank,
      status: f.status,
      degrees: f.degrees || [],
      aliases: f.aliases || [],
      adminTitle: f.adminTitle,
      positionType: f.positionType,
      memberSince: f.createdAt.toISOString().slice(0, 10),
    },
    attendances: attendances.map((a: any) => ({
      id: a.id,
      eventId: a.event.id,
      eventTitle: a.event.title,
      eventDate: a.event.date.toISOString().slice(0, 10),
      seriesId: a.event.seriesId,
      seriesTitle: a.event.series?.title || null,
      topic: a.event.topic,
      speaker: a.event.speaker,
      baseDuration: a.event.baseDuration,
      durationJoined: a.durationJoined,
      checkInAt: a.createdAt.toISOString(),
    })),
    summary: {
      totalEvents: attendances.length,
      totalMinutes: attendances.reduce((s: number, a: any) => s + (a.durationJoined || 0), 0),
      distinctSeries: new Set(
        attendances.map((a: any) => a.event.seriesId).filter(Boolean)
      ).size,
    },
    signature: {
      baselineCount,
      latestTrace: latestSignatureTrace,
    },
  });
}

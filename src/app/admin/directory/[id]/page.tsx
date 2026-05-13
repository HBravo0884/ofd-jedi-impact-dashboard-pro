import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import FacultyDetailClient from './FacultyDetailClient';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// /admin/directory/[id] — admin-only per-faculty drilldown.
//   Shows: profile fields, most-recent signature SVG, full attendance
//   history with totals, CSV export.
export default async function FacultyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    redirect('/?from=admin-directory');
  }

  const { id } = await params;

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
  if (!f) notFound();

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

  return (
    <FacultyDetailClient
      faculty={{
        id: f.id,
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        department: String(f.department || '').replace(/([A-Z])/g, ' $1').trim(),
        division: f.division,
        rank: String(f.rank || '').replace(/([A-Z])/g, ' $1').trim(),
        status: f.status,
        degrees: f.degrees || [],
        aliases: f.aliases || [],
        adminTitle: f.adminTitle,
        positionType: f.positionType,
        memberSince: f.createdAt.toISOString().slice(0, 10),
      }}
      attendances={attendances.map((a: any) => ({
        id: a.id,
        eventId: a.event.id,
        eventTitle: a.event.title,
        eventDate: a.event.date.toISOString().slice(0, 10),
        seriesTitle: a.event.series?.title || null,
        topic: a.event.topic,
        speaker: a.event.speaker,
        baseDuration: a.event.baseDuration,
        durationJoined: a.durationJoined,
      }))}
      signature={{
        baselineCount,
        latestTrace: latestSignatureTrace,
      }}
    />
  );
}

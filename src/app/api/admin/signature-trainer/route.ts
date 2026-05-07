import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { serializeTrace } from '@/lib/serializeTrace';
import { isClinicianDegrees } from '@/lib/clinician';

export const revalidate = 0;

// ── GET /api/admin/signature-trainer ─────────────────────────────────────
// Admin-only. Lists faculty with their current signature baseline counts.
// Optional ?q=<search>  case-insensitive prefix on first/last name.
export async function GET(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();

  const rows = await prisma.faculty.findMany({
    where: q.length >= 2
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName:  { contains: q, mode: 'insensitive' } },
          ],
        }
      : { status: 'VERIFIED' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: true,
      degrees: true,
      signatureUrls: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: q.length >= 2 ? 30 : 60,
  });

  return NextResponse.json({
    faculty: rows.map((r: any) => ({
      id: r.id,
      name: `${r.lastName}, ${r.firstName}`,
      dept: String(r.department || '').replace(/([A-Z])/g, ' $1').trim(),
      degrees: r.degrees || [],
      isClinician: isClinicianDegrees(r.degrees),
      baselineCount: Array.isArray(r.signatureUrls) ? r.signatureUrls.length : 0,
    })),
  });
}

// ── POST /api/admin/signature-trainer ────────────────────────────────────
// Admin-only. Append a new training signature to a faculty's baseline.
// Body: { facultyId: string, signatureTrace: any[] }
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { facultyId, signatureTrace } = body || {};
  if (!facultyId || !Array.isArray(signatureTrace) || signatureTrace.length === 0) {
    return NextResponse.json({ error: 'facultyId and signatureTrace required.' }, { status: 400 });
  }

  const f = await prisma.faculty.findUnique({ where: { id: String(facultyId) } });
  if (!f) return NextResponse.json({ error: 'Faculty not found.' }, { status: 404 });

  // Cap at 10 baseline samples per faculty — beyond that the DTW search just
  // gets slower without improving accuracy.
  const existing = (f.signatureUrls || []).slice(-9);
  const newBaseline = [...existing, serializeTrace(signatureTrace)];
  await prisma.faculty.update({
    where: { id: f.id },
    data: { signatureUrls: { set: newBaseline } },
  });

  return NextResponse.json({
    ok: true,
    facultyId: f.id,
    baselineCount: newBaseline.length,
  });
}

// ── DELETE /api/admin/signature-trainer?id=XYZ ───────────────────────────
// Admin-only. Clears all baseline signatures for a faculty (start over).
export async function DELETE(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await prisma.faculty.update({
    where: { id },
    data: { signatureUrls: { set: [] } },
  });
  return NextResponse.json({ ok: true });
}

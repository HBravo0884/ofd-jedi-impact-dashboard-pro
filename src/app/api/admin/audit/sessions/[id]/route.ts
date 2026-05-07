import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// GET /api/admin/audit/sessions/[id] — full detail with attempts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const sessionRows = (await prisma.$queryRawUnsafe(`
    SELECT s.*,
           f."firstName" AS faculty_first, f."lastName" AS faculty_last,
           f.degrees AS faculty_degrees, f.department AS faculty_department,
           array_length(f."signatureUrls", 1) AS baseline_count
    FROM "AuditSession" s
    JOIN "Faculty" f ON f.id = s."facultyId"
    WHERE s.id = $1
  `, id)) as any[];

  if (sessionRows.length === 0) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const row = sessionRows[0];

  const attempts = (await prisma.$queryRawUnsafe(`
    SELECT id, label, score, bucket, "perSample", notes, "createdAt"
    FROM "AuditAttempt"
    WHERE "sessionId" = $1
    ORDER BY "createdAt" ASC
  `, id)) as any[];

  return NextResponse.json({
    session: {
      id: row.id,
      name: row.name,
      facultyId: row.facultyId,
      facultyName: `${row.faculty_last}, ${row.faculty_first}`,
      facultyDegrees: row.faculty_degrees || [],
      facultyDepartment: String(row.faculty_department || '').replace(/([A-Z])/g, ' $1').trim(),
      baselineCount: Number(row.baseline_count) || 0,
      notes: row.notes,
      createdAt: row.createdAt,
      closedAt: row.closedAt,
      attempts: attempts.map((a) => ({
        id: a.id,
        label: a.label,
        score: a.score === null ? null : Number(a.score),
        bucket: a.bucket,
        perSample: a.perSample,
        notes: a.notes,
        createdAt: a.createdAt,
      })),
    },
  });
}

// DELETE /api/admin/audit/sessions/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  await prisma.$executeRawUnsafe(`DELETE FROM "AuditSession" WHERE id = $1`, id);
  return NextResponse.json({ ok: true });
}

// PATCH — close a session
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body?.close === true) {
    await prisma.$executeRawUnsafe(`UPDATE "AuditSession" SET "closedAt" = NOW() WHERE id = $1`, id);
  }
  return NextResponse.json({ ok: true });
}

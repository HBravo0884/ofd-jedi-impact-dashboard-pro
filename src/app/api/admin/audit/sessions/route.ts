import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export const revalidate = 0;

// GET /api/admin/audit/sessions  — list recent sessions
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT s.id, s.name, s."facultyId", s.notes, s."createdAt", s."closedAt",
           f."firstName", f."lastName",
           (SELECT COUNT(*) FROM "AuditAttempt" a WHERE a."sessionId" = s.id) AS attempt_count,
           (SELECT COUNT(*) FROM "AuditAttempt" a WHERE a."sessionId" = s.id AND a.label = 'GENUINE') AS genuine_count,
           (SELECT COUNT(*) FROM "AuditAttempt" a WHERE a."sessionId" = s.id AND a.label = 'IMPOSTER') AS imposter_count
    FROM "AuditSession" s
    JOIN "Faculty" f ON f.id = s."facultyId"
    ORDER BY s."createdAt" DESC
    LIMIT 50
  `)) as any[];

  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id, name: r.name, notes: r.notes,
      facultyId: r.facultyId,
      facultyName: `${r.lastName}, ${r.firstName}`,
      createdAt: r.createdAt, closedAt: r.closedAt,
      attemptCount: Number(r.attempt_count),
      genuineCount: Number(r.genuine_count),
      imposterCount: Number(r.imposter_count),
    })),
  });
}

// POST /api/admin/audit/sessions  — create a new session
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const { name, facultyId, notes } = body || {};
  if (!name || !facultyId) {
    return NextResponse.json({ error: 'name and facultyId are required' }, { status: 400 });
  }
  const fac = await prisma.faculty.findUnique({ where: { id: String(facultyId) } });
  if (!fac) return NextResponse.json({ error: 'Faculty not found' }, { status: 404 });

  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AuditSession" (id, name, "facultyId", notes) VALUES ($1, $2, $3, $4)`,
    id, String(name).trim(), String(facultyId), notes ? String(notes) : null
  );
  return NextResponse.json({ ok: true, id });
}

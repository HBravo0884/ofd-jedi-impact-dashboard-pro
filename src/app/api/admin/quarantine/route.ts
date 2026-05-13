import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import {
  suggestMergeCandidates,
  type VerifiedFacultyInput,
} from '@/lib/quarantineSuggest';

export const revalidate = 0;

// ── GET /api/admin/quarantine ──────────────────────────────────────────
// Admin-only. Returns every PENDING_RESOLUTION faculty profile together
// with the top 5 likely merge targets (from VERIFIED faculty). Each
// suggestion carries a 0..1 confidence score plus human-readable reason
// strings.
//
// Powers the /admin/quarantine review queue.
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [pending, verified] = await Promise.all([
    prisma.faculty.findMany({
      where: { status: 'PENDING_RESOLUTION' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { _count: { select: { attendances: true } } },
    }),
    prisma.faculty.findMany({
      where: { status: 'VERIFIED' },
      include: { _count: { select: { attendances: true } } },
    }),
  ]);

  const verifiedInput: VerifiedFacultyInput[] = verified.map((f: any) => ({
    id: f.id,
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email,
    aliases: f.aliases || [],
    department: String(f.department || ''),
    attendances: f._count.attendances,
  }));

  const items = pending.map((p: any) => {
    const candidates = suggestMergeCandidates(
      {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        aliases: p.aliases || [],
        department: p.department,
      },
      verifiedInput,
    );
    return {
      pending: {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        aliases: p.aliases || [],
        degrees: p.degrees || [],
        department: String(p.department || ''),
        division: p.division || null,
        attendances: p._count.attendances,
        createdAt: p.createdAt.toISOString(),
      },
      candidates,
    };
  });

  return NextResponse.json({
    ok: true,
    totalPending: pending.length,
    items,
  });
}

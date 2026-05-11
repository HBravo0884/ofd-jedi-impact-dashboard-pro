import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── GET /api/admin/faculty-list ────────────────────────────────────────────
// Admin only. Returns every Faculty row with the minimum fields the
// Manage Data override dropdown needs (id, name, department, division,
// status, attendance count). Ordered alphabetically by lastName so the
// browser-native typeahead on a native <select> jumps to the right entry.
//
// Used by the ingestion page to populate the "Match override" picker so
// admins can manually map a Zoom CSV row to the correct existing faculty
// directory entry before the data lands.
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await prisma.faculty.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      division: true,
      status: true,
      _count: { select: { attendances: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  return NextResponse.json({
    faculty: rows.map((r: any) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      // Email is only used client-side for predicted-T1-match preview;
      // not displayed in the dropdown. Phantom emails are filtered out.
      email: r.email && !r.email.startsWith('phantom_') ? r.email : null,
      department: String(r.department || ''),
      division: r.division || null,
      status: r.status,
      attendances: r._count.attendances,
    })),
  });
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

function csvEscape(s: any): string {
  if (s === null || s === undefined) return '';
  const v = String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.faculty.findMany({
    where: {
      OR: [
        { status: 'PENDING_RESOLUTION' },
        { department: { equals: 'Other' } },
        { department: { equals: 'Unknown' } },
      ],
    },
    orderBy: { lastName: 'asc' },
  });

  const header = ['lastName', 'firstName', 'email', 'department', 'rank', 'status'];
  const lines: string[] = [header.join(',')];
  for (const f of rows as any[]) {
    lines.push(
      [f.lastName, f.firstName, f.email, f.department, f.rank, f.status]
        .map(csvEscape)
        .join(',')
    );
  }

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="missing_metadata_profiles.csv"',
    },
  });
}

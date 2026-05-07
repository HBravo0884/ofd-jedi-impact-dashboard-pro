import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// PUBLIC — used by the iPad kiosk autocomplete. Returns up to 12 matching
// faculty by case-insensitive prefix on first or last name. Returns ONLY
// id / firstName / lastName / department — no emails, ranks, or attendance
// counts, so a kiosk left in public space doesn't leak personal data.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const rows = await prisma.faculty.findMany({
    where: {
      status: 'VERIFIED',
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName:  { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, department: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 12,
  });

  return NextResponse.json({
    results: rows.map((r: any) => ({
      id: r.id,
      name: `${r.lastName}, ${r.firstName}`,
      dept: String(r.department || '').replace(/([A-Z])/g, ' $1').trim(),
    })),
  });
}

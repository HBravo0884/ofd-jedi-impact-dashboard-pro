import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// Admin-only — list all event series so the ingestion UI can offer them
// in a dropdown when binding a new CSV upload to a series.
export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const series = await prisma.eventSeries.findMany({
    orderBy: { title: 'asc' },
    select: { id: true, title: true },
  });

  return NextResponse.json({ series });
}

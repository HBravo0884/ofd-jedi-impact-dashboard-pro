import { prisma } from '@/lib/prisma';
import DirectoryClient from './DirectoryClient';

export const revalidate = 0;

export default async function DirectoryPage() {
  let faculty: any[] = [];
  try {
    const rows = await prisma.faculty.findMany({
      where: { status: 'VERIFIED', attendances: { some: {} } },
      orderBy: { lastName: 'asc' },
      include: { _count: { select: { attendances: true } } },
    });
    faculty = rows.map((f: any) => ({
      id: f.id,
      lastName: f.lastName,
      firstName: f.firstName,
      department: String(f.department || '').replace(/([A-Z])/g, ' $1').trim(),
      rank: String(f.rank || 'Unknown').replace(/([A-Z])/g, ' $1').trim(),
      degrees: (f.degrees || []).join(', '),
      sessions: f._count.attendances,
    }));
  } catch (e) {
    console.error('Directory load failed:', e);
  }

  return <DirectoryClient initialFaculty={faculty} />;
}

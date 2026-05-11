import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import DirectoryClient from './DirectoryClient';

export const revalidate = 0;

export default async function DirectoryPage() {
  // Detect admin so we can render Edit/Merge controls only for admins.
  const jar = await cookies();
  const isAdmin = await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value);

  let faculty: any[] = [];
  try {
    // Admins see EVERY faculty (including PENDING_RESOLUTION + those with
    // zero attendances yet) so they can edit/merge any profile. Non-admins
    // keep the existing 'VERIFIED + has attendance' view for privacy.
    const rows = await prisma.faculty.findMany({
      where: isAdmin
        ? {}
        : { status: 'VERIFIED', attendances: { some: {} } },
      orderBy: { lastName: 'asc' },
      include: { _count: { select: { attendances: true } } },
    });
    faculty = rows.map((f: any) => ({
      id: f.id,
      lastName: f.lastName,
      firstName: f.firstName,
      email: f.email,
      department: String(f.department || '').replace(/([A-Z])/g, ' $1').trim(),
      departmentRaw: String(f.department || ''),
      division: f.division || '',
      rank: String(f.rank || 'Unknown').replace(/([A-Z])/g, ' $1').trim(),
      rankRaw: String(f.rank || 'Unknown'),
      degrees: (f.degrees || []),
      aliases: (f.aliases || []),
      status: String(f.status || ''),
      sessions: f._count.attendances,
    }));
  } catch (e) {
    console.error('Directory load failed:', e);
  }

  return <DirectoryClient initialFaculty={faculty} isAdmin={isAdmin} />;
}

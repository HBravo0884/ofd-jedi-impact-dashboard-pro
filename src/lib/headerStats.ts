import { prisma } from '@/lib/prisma';

export type HeaderStats = {
  attendance: number;
  participants: number;
  sessions: number;
};

// Cached for the duration of a single render. Falls back to zeros if the DB
// is unreachable so the header never breaks the page.
export async function getHeaderStats(): Promise<HeaderStats> {
  try {
    const [attendance, participants, sessions] = await Promise.all([
      prisma.attendance.count(),
      prisma.faculty.count({ where: { status: 'VERIFIED', attendances: { some: {} } } }),
      prisma.event.count(),
    ]);
    return { attendance, participants, sessions };
  } catch {
    return { attendance: 0, participants: 0, sessions: 0 };
  }
}

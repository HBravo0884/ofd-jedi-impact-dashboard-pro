import { PrismaClient } from '@prisma/client';
import RosterClient from './RosterClient';

const prisma = new PrismaClient();
export const revalidate = 0;

export default async function RosterPage() {
  let rosterEvents: any[] = [];

  try {
    const events = await prisma.event.findMany({
      orderBy: { date: 'desc' },
      include: {
        series: { select: { title: true } },
        attendances: {
          include: {
            faculty: {
              include: {
                _count: { select: { attendances: true } }
              }
            }
          }
        }
      }
    });

    rosterEvents = events.map(e => {
        const d = e.date.toISOString().split('T')[0];
        const sName = e.series?.title || 'Standalone Event';
        const displayString = `${d} | ${sName} | ${e.topic || e.title}`;

        const attendees = e.attendances.map(a => {
            const fac = a.faculty;
            return {
                id: fac.id,
                name: `${fac.lastName}, ${fac.firstName}`,
                rank: fac.rank,
                division: fac.division || 'Guest',
                department: fac.department || 'Unknown',
                score: fac._count.attendances
            };
        }).sort((a,b) => a.name.localeCompare(b.name));

        return {
            id: e.id,
            displayString,
            attendees
        };
    });

  } catch (err) {
    console.error("Roster engine failed:", err);
  }

  return (
    <>
       <div className="sec">Session Cleanup & Roster Validation</div>
       <RosterClient events={rosterEvents} />
    </>
  );
}

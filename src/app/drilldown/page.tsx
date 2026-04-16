import { PrismaClient } from '@prisma/client';
import DrilldownClient from './DrilldownClient';

const prisma = new PrismaClient();
export const revalidate = 0;

export default async function DrilldownPage() {
  let drilldownData: any = {
    seriesMatrix: [],
    departments: [],
    individuals: [],
    globalEventLog: []
  };

  try {
    // 1. Fetch raw series connections
    const rawSeries = await prisma.eventSeries.findMany({
      include: {
        events: {
          include: {
            attendances: {
               include: {
                  faculty: { select: { id: true, firstName: true, lastName: true, department: true } }
               }
            }
          }
        }
      }
    });

    const uniqueDepts = new Set<string>();
    const uniqueIndivids = new Map<string, string>(); // id -> formatted name

    const seriesMatrix = rawSeries.map(series => {
        const deptsMap: Record<string, number> = {};
        const facultyMap: Record<string, number> = {};

        series.events.forEach(event => {
            event.attendances.forEach(att => {
                const fac = att.faculty;
                const fName = `${fac.lastName}, ${fac.firstName}`;
                uniqueIndivids.set(fac.id, fName);
                if (fac.department) uniqueDepts.add(fac.department);

                // Add to Dept Map
                deptsMap[fac.department] = (deptsMap[fac.department] || 0) + 1;
                // Add to Faculty Map
                facultyMap[fac.id] = (facultyMap[fac.id] || 0) + 1;
            });
        });

        return {
           seriesName: series.title,
           depts: deptsMap,
           faculty: facultyMap
        };
    });

    const sortedDepts = Array.from(uniqueDepts).sort();
    const sortedIndivids = Array.from(uniqueIndivids.entries()).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name));

    // 2. Fetch flat Meeting Log
    const events = await prisma.event.findMany({
       orderBy: { date: 'desc' },
       include: { 
          series: { select: { title: true } },
          _count: { select: { attendances: true } }
       }
    });

    const globalEventLog = events.map(e => ({
       id: e.id,
       date: e.date.toISOString().split('T')[0],
       series: e.series?.title || 'Standalone',
       topic: e.topic || e.title,
       count: e._count.attendances
    }));

    drilldownData = {
       seriesMatrix,
       departments: sortedDepts,
       individuals: sortedIndivids,
       globalEventLog
    };

  } catch (error) {
    console.error("Drilldown Data engine failed:", error);
  }

  return (
    <>
      <div className="sec">Impact Drilldown Analyzer</div>
      <DrilldownClient payload={drilldownData} />
    </>
  );
}

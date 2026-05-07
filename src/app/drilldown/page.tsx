import { prisma } from '@/lib/prisma';
import DrilldownClient from './DrilldownClient';

export const revalidate = 0;

export default async function DrilldownPage() {
  let drilldownData: any = {
    seriesMatrix: [],
    departments: [],
    individuals: [],
    globalEventLog: [],
    personEventsMap: {} as Record<string, Array<{ date: string; series: string; topic: string; duration: number }>>,
  };

  try {
    // 1. Fetch raw series → events → attendances → faculty (used for the
    //    series-matrix and department/individual indices).
    const rawSeries: any[] = await prisma.eventSeries.findMany({
      include: {
        events: {
          include: {
            attendances: {
              include: {
                faculty: { select: { id: true, firstName: true, lastName: true, department: true } },
              },
            },
          },
        },
      },
    });

    const uniqueDepts = new Set<string>();
    const uniqueIndivids = new Map<string, string>(); // id -> formatted name

    const seriesMatrix = rawSeries.map((series: any) => {
      const deptsMap: Record<string, number> = {};
      const facultyMap: Record<string, number> = {};

      series.events.forEach((event: any) => {
        event.attendances.forEach((att: any) => {
          const fac = att.faculty;
          const fName = `${fac.lastName}, ${fac.firstName}`;
          uniqueIndivids.set(fac.id, fName);
          if (fac.department) uniqueDepts.add(fac.department);
          deptsMap[fac.department] = (deptsMap[fac.department] || 0) + 1;
          facultyMap[fac.id] = (facultyMap[fac.id] || 0) + 1;
        });
      });

      return { seriesName: series.title, depts: deptsMap, faculty: facultyMap };
    });

    const sortedDepts = Array.from(uniqueDepts).sort();
    const sortedIndivids = Array.from(uniqueIndivids.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 2. Flat global meeting log (date-sorted)
    const events = await prisma.event.findMany({
      orderBy: { date: 'desc' },
      include: {
        series: { select: { title: true } },
        _count: { select: { attendances: true } },
      },
    });

    const globalEventLog = events.map((e: any) => ({
      id: e.id,
      date: e.date.toISOString().split('T')[0],
      series: e.series?.title || 'Standalone',
      topic: e.topic || e.title,
      count: e._count.attendances,
    }));

    // 3. Per-person meeting history map. Powers the new "Meeting History Log"
    //    table that appears under the individual chart when an attendee is
    //    selected. Each entry: date, series, topic, duration (mins).
    const allAttendances = await prisma.attendance.findMany({
      include: {
        event: { select: { date: true, title: true, topic: true, series: { select: { title: true } } } },
      },
      orderBy: { event: { date: 'desc' } },
    });
    const personEventsMap: Record<string, any[]> = {};
    for (const a of allAttendances as any[]) {
      const fid = a.facultyId;
      if (!personEventsMap[fid]) personEventsMap[fid] = [];
      personEventsMap[fid].push({
        date: a.event.date.toISOString().split('T')[0],
        series: a.event.series?.title || 'Standalone',
        topic: a.event.topic || a.event.title,
        duration: a.durationJoined,
      });
    }

    drilldownData = {
      seriesMatrix,
      departments: sortedDepts,
      individuals: sortedIndivids,
      globalEventLog,
      personEventsMap,
    };
  } catch (error) {
    console.error('Drilldown Data engine failed:', error);
  }

  return (
    <>
      <div className="sec">Impact Drilldown Analyzer</div>
      <DrilldownClient payload={drilldownData} />
    </>
  );
}

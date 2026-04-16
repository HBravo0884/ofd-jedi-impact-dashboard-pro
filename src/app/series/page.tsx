import { PrismaClient } from '@prisma/client';
import SeriesClient from './SeriesClient';

const prisma = new PrismaClient();

export const revalidate = 0;

export default async function SeriesPage() {
  let seriesData: any[] = [];
  let globalTimeline: any = { labels: [], counts: [], colors: [] };

  try {
    const rawSeries = await prisma.eventSeries.findMany({
      include: {
        events: {
          include: {
            _count: { select: { attendances: true } },
            attendances: {
              include: { faculty: { select: { department: true } } }
            }
          },
          orderBy: { date: 'asc' }
        }
      }
    });

    // Calculate metadata for each series
    seriesData = rawSeries.map(s => {
      const activeEvents = s.events.filter(e => e._count.attendances > 0);
      const totalEvents = activeEvents.length;
      const totalAttendances = activeEvents.reduce((sum, e) => sum + e._count.attendances, 0);
      
      let topEventTitle = 'No Sessions Logged';
      let topEventHits = 0;

      activeEvents.forEach(e => {
        if (e._count.attendances > topEventHits) {
          topEventHits = e._count.attendances;
          topEventTitle = e.title;
        }
      });

      // Calculate Department Penetration (Total counts across this series)
      const seriesDeptCounts: Record<string, number> = {};
      activeEvents.forEach(e => {
        e.attendances.forEach(a => {
          const d = a.faculty.department;
          seriesDeptCounts[d] = (seriesDeptCounts[d] || 0) + 1;
        });
      });

      // Sort departments by highest attendance
      const sortedDepts = Object.entries(seriesDeptCounts).sort((a, b) => b[1] - a[1]);
      const penetrationLabels = sortedDepts.map(kv => kv[0]);
      const penetrationCounts = sortedDepts.map(kv => kv[1]);

      // We want to pass chart parameters to our Stacked Chart
      const chartLabels = activeEvents.map(e => {
          const words = e.title.split(' ');
          return words.length > 5 ? words.slice(0, 5).join(' ') + '...' : e.title;
      });
      const chartCounts = activeEvents.map(e => e._count.attendances);
      const seriesAverage = chartLabels.length > 0 ? (totalAttendances / chartLabels.length) : 0;

      // Build Stacked Matrix logic
      // List of unique departments for this series
      const validDepts = penetrationLabels; 
      
      const sessionMatrixDatasets = validDepts.map((dept, idx) => {
          // Calculate the color using HSL based on index to ensure dynamic distinct colors just like the mockup
          const hue = (idx * 137.508) % 360; 
          return {
             label: dept.replace(/([A-Z])/g, ' $1').trim(),
             backgroundColor: `hsl(${hue}, 60%, 65%)`,
             data: activeEvents.map(e => {
                 return e.attendances.filter(a => a.faculty.department === dept).length;
             })
          };
      });

      return {
        id: s.id,
        title: s.title,
        totalEvents,
        totalAttendances,
        topEventTitle,
        topEventHits,
        chartLabels,
        chartCounts,
        seriesAverage,
        penetrationLabels,
        penetrationCounts,
        sessionMatrixDatasets
      };
    });

    // Sort heavily attended series first
    seriesData.sort((a, b) => b.totalAttendances - a.totalAttendances);

    // Global Timeline Query (All Events chronologically)
    const allChronologicalEvents = await prisma.event.findMany({
      include: { _count: { select: { attendances: true } }, series: true },
      orderBy: { date: 'asc' },
    });
    
    const activeGlobal = allChronologicalEvents.filter(e => e._count.attendances > 0);
    globalTimeline = {
      labels: activeGlobal.map(e => {
         const dateObj = new Date(e.date);
         const yrMo = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
         return `${yrMo} · ${e.series?.title || 'Standalone Event'} - ${e.title}`.substring(0, 45) + '...';
      }),
      counts: activeGlobal.map(e => e._count.attendances),
      colors: activeGlobal.map((e, idx) => `hsl(${(idx * 50) % 360}, 60%, 75%)`) // Unique timeline colors
    };

  } catch (error) {
    console.error("Database connection failed:", error);
  }

  return (
    <>
      <div className="sec">Session & Demographic Depth</div>
      
      <SeriesClient seriesData={seriesData} globalTimeline={globalTimeline} />
    </>
  );
}

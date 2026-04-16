import { PrismaClient } from '@prisma/client';
import SeriesClient from './SeriesClient';

const prisma = new PrismaClient();

export const revalidate = 0;

export default async function SeriesPage() {
  let seriesData: any[] = [];

  try {
    const rawSeries = await prisma.eventSeries.findMany({
      include: {
        events: {
          include: {
            _count: { select: { attendances: true } }
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

      // We want to pass chart parameters to our BarChart
      const chartLabels = activeEvents.map(e => {
          // Truncate long event names so the chart UI stays clean
          const words = e.title.split(' ');
          return words.length > 5 ? words.slice(0, 5).join(' ') + '...' : e.title;
      });
      const chartCounts = activeEvents.map(e => e._count.attendances);

      return {
        ...s,
        totalEvents,
        totalAttendances,
        topEventTitle,
        topEventHits,
        chartLabels,
        chartCounts
      };
    });

    // Sort heavily attended series first
    seriesData.sort((a, b) => b.totalAttendances - a.totalAttendances);

  } catch (error) {
    console.error("Database connection failed:", error);
  }

  return (
    <>
      <div className="sec">Programming Series Depth</div>
      
      <SeriesClient seriesData={seriesData} />
    </>
  );
}

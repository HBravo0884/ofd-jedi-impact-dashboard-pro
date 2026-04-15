import { PrismaClient } from '@prisma/client';
import { BarChart } from '@/components/DashboardChart/DashboardChart';

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
      
      <div className="kpi-row" style={{ marginBottom: '30px' }}>
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c1)' }}>
          <div className="kpi-num">{seriesData.length}</div>
          <div className="kpi-label">Active Series</div>
          <div className="kpi-sub">Total distinct programmatic umbrellas</div>
        </div>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        {seriesData.map((series, idx) => {
          
          // Provide vibrant border colors sequentially
          const borders = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
          const barColor = borders[idx % borders.length];

          return (
            <div key={series.id} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="kpi-row" style={{ marginBottom: '0' }}>
                    <div className="kpi-card" style={{ borderLeftColor: barColor, minWidth: '100px' }}>
                    <div className="kpi-num" style={{ fontSize: '1.4rem' }}>{series.totalEvents}</div>
                    <div className="kpi-label">Sessions</div>
                    </div>
                    <div className="kpi-card" style={{ borderLeftColor: barColor, minWidth: '100px' }}>
                    <div className="kpi-num" style={{ fontSize: '1.4rem', color: barColor }}>{series.totalAttendances}</div>
                    <div className="kpi-label">Attendances</div>
                    </div>
                </div>

                <div style={{ flexGrow: 1 }}>
                    <BarChart 
                        title={series.title}
                        sub={`Highest Attended: ${series.topEventTitle} (${series.topEventHits} participants).`}
                        labels={series.chartLabels}
                        counts={series.chartCounts}
                        tooltipLabel="Participants"
                    />
                </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

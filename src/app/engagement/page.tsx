import { BubbleChart, BarChart } from '@/components/DashboardChart/DashboardChart';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0;

export default async function EngagementPage() {
  let bubblePoints: any[] = [];
  let rankLabels: string[] = [];
  let rankCounts: number[] = [];
  
  try {
    const [facultyList, rankGroup] = await Promise.all([
      prisma.faculty.findMany({
        where: { status: 'VERIFIED' },
        include: { _count: { select: { attendances: true } } }
      }),
      prisma.faculty.groupBy({ 
        by: ['rank'],
        _count: { rank: true },
        orderBy: { _count: { rank: 'desc' } }
      })
    ]);

    for (const fac of facultyList) {
      const atnd = fac._count.attendances;
      if (atnd > 0) {
        const hash = fac.id.charCodeAt(0) + fac.id.charCodeAt(fac.id.length - 1);
        const yJitter = (hash % 100) / 5;
        bubblePoints.push({
          x: atnd,
          y: yJitter,
          r: Math.max(8, 6 + (atnd * 2.5)),
          name: `${fac.firstName} ${fac.lastName}`,
          dept: fac.department.replace(/([A-Z])/g, ' $1').trim()
        });
      }
    }

    rankGroup.forEach(r => {
      if (r.rank !== 'Unknown') {
        rankLabels.push(r.rank.replace(/([A-Z])/g, ' $1').trim());
        rankCounts.push(r._count.rank);
      }
    });

  } catch (error) {
    console.error('Database connection failed:', error);
  }

  return (
    <>
      <div style={{ paddingBottom: '20px' }}>
        <Link href="/" style={{ color: 'var(--c5)', textDecoration: 'none', fontWeight: 'bold' }}>← Back to Master Overview</Link>
      </div>

      <div className="sec">Faculty Tracking &amp; Engagement Depth</div>
      
      <div className="charts-grid" style={{ gridTemplateColumns: '1fr' }}>
        <BubbleChart points={bubblePoints} />
      </div>

      <div className="sec" style={{ marginTop: '20px' }}>Demographics</div>
      <div className="charts-grid">
        <BarChart 
          title="Attendees by Academic Rank"
          sub="Distribution across the academic career ladder."
          labels={rankLabels}
          counts={rankCounts}
          tooltipLabel="Individuals"
          colors="#A1CCA6"
        />
      </div>
    </>
  );
}

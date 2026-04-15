import { BubbleChart } from '@/components/DashboardChart/DashboardChart';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0; // Ensure data stays fresh on every request

export default async function EngagementPage() {
  let bubblePoints: any[] = [];
  
  try {
    const facultyList = await prisma.faculty.findMany({
      where: { status: 'VERIFIED' },
      include: { _count: { select: { attendances: true } } }
    });

    for (const fac of facultyList) {
      const atnd = fac._count.attendances;
      if (atnd > 0) {
        // Create deterministic Jitter
        const hash = fac.id.charCodeAt(0) + fac.id.charCodeAt(fac.id.length - 1);
        const yJitter = (hash % 100) / 5;
        
        bubblePoints.push({
          x: atnd,
          y: yJitter,
          r: 5 + (atnd * 1.5), 
          name: `${fac.firstName} ${fac.lastName}`,
          dept: fac.department.replace(/([A-Z])/g, ' $1').trim()
        });
      }
    }
  } catch (error) {
    console.error("Database connection failed:", error);
  }

  return (
    <>
      <div style={{ paddingBottom: '20px' }}>
         <Link href="/" style={{ color: 'var(--c5)', textDecoration: 'none', fontWeight: 'bold' }}>← Back to Master Overview</Link>
      </div>

      <div className="sec">Faculty Tracking & Engagement Depth</div>
      
      <div className="charts-grid" style={{ gridTemplateColumns: '1fr' }}>
        <BubbleChart points={bubblePoints} />
      </div>
    </>
  );
}

import { PrismaClient } from '@prisma/client';
import Link from 'next/link';

const prisma = new PrismaClient();
export const revalidate = 0;

export default async function DrilldownPage({
  searchParams,
}: {
  searchParams: { filterLabel?: string };
}) {
  const filterLabel = searchParams.filterLabel;

  if (!filterLabel) {
    return (
      <div className="sec">
        <p>No Filter Active. Please click a chart to explore data.</p>
        <Link href="/">
           <button style={{ padding: '8px 16px', background: 'var(--c1)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>
              &larr; Back to Dashboard
           </button>
        </Link>
      </div>
    );
  }

  // 1. Omnibar Search: We don't strictly know if filterLabel is a Dept, Rank, or Event Title. 
  // We'll query across multiple dimensions natively.
  
  // Try to find if it's an exact event match
  const relatedEvent = await prisma.event.findFirst({
      where: { title: filterLabel },
      select: { id: true }
  });

  // Strip spaces for strict Prisma Enum matching
  const enumFilter = filterLabel.replace(/\s+/g, '');

  const rawFacultyData = await prisma.faculty.findMany({
    where: {
      OR: [
        // 1. Is it a Department Click?
        { department: filterLabel as any },
        { department: enumFilter as any },
        // 2. Is it a Rank Click?
        { rank: filterLabel as any },
        { rank: enumFilter as any },
        // 3. Is it an Event Click? (Cross-relational query)
        relatedEvent ? { attendances: { some: { eventId: relatedEvent.id } } } : {}
      ]
    },
    include: {
      _count: {
        select: { attendances: true }
      }
    },
    orderBy: {
       lastName: 'asc'
    }
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
         <div className="sec" style={{ margin: 0 }}>Drilldown Explorer</div>
         <Link href="/">
           <button style={{ padding: '6px 12px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
              &larr; Return to Dashboard
           </button>
         </Link>
      </div>

      <div className="kpi-row" style={{ marginBottom: '24px' }}>
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c2)' }}>
          <div className="kpi-num" style={{ color: 'var(--c2d)' }}>{rawFacultyData.length}</div>
          <div className="kpi-label">Active Matches</div>
          <div className="kpi-sub">Total verified identities filtered by: <strong style={{ color: 'var(--c1d)' }}>{filterLabel}</strong></div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '10px', boxShadow: '0 2px 14px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
         <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
               <tr>
                  <th style={{ padding: '14px 20px', color: 'var(--c1d)', fontWeight: 700 }}>Faculty Name</th>
                  <th style={{ padding: '14px 20px', color: 'var(--c1d)', fontWeight: 700 }}>Department</th>
                  <th style={{ padding: '14px 20px', color: 'var(--c1d)', fontWeight: 700 }}>Academic Rank</th>
                  <th style={{ padding: '14px 20px', color: 'var(--c1d)', fontWeight: 700, textAlign: 'center' }}>Total Engagements</th>
               </tr>
            </thead>
            <tbody>
               {rawFacultyData.length === 0 ? (
                 <tr>
                    <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                       No verified distinct faculty identities found for this filter.
                    </td>
                 </tr>
               ) : (
                 rawFacultyData.map((faculty, idx) => (
                    <tr key={faculty.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'white' : '#fcfdfd' }}>
                       <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text)' }}>
                          {faculty.lastName}, {faculty.firstName}
                          {faculty.degrees && <span style={{ color: 'var(--muted)', fontSize: '0.8rem', marginLeft: '6px' }}>{faculty.degrees}</span>}
                       </td>
                       <td style={{ padding: '14px 20px', color: 'var(--muted)' }}>{faculty.department}</td>
                       <td style={{ padding: '14px 20px', color: 'var(--muted)' }}>{faculty.rank}</td>
                       <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <span style={{ 
                             background: 'rgba(9, 124, 135, 0.1)', color: 'var(--c1d)', 
                             padding: '4px 10px', borderRadius: '12px', fontWeight: 700, fontSize: '0.8rem' 
                          }}>
                             {faculty._count.attendances} Sessions
                          </span>
                       </td>
                    </tr>
                 ))
               )}
            </tbody>
         </table>
      </div>
    </>
  );
}

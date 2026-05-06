import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0;

export default async function DirectoryPage() {
  let faculty: any[] = [];
  try {
    faculty = await prisma.faculty.findMany({
      where: { status: 'VERIFIED', attendances: { some: {} } },
      orderBy: { lastName: 'asc' },
      include: { _count: { select: { attendances: true } } }
    });
  } catch(e) {}

  return (
     <>
      <div style={{ paddingBottom: '20px' }}>
         <Link href="/" style={{ color: 'var(--c5)', textDecoration: 'none', fontWeight: 'bold' }}>← Back to Master Overview</Link>
      </div>

      <div className="sec">Canonical Faculty Directory</div>
      <div className="sub" style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '12px' }}>
        Directory securely mirrors the verified Cloud Database.
      </div>
      
      <div style={{ marginTop: '20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
         <div className="table-scroll">
           <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                 <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px', color: 'var(--c1d)' }}>Name</th>
                    <th style={{ padding: '8px', color: 'var(--c1d)' }}>Department</th>
                    <th style={{ padding: '8px', color: 'var(--c1d)' }}>Rank</th>
                    <th style={{ padding: '8px', color: 'var(--c1d)' }}>Sessions Attended</th>
                 </tr>
              </thead>
              <tbody>
                 {faculty.map((f, i) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                       <td style={{ padding: '8px' }}>{f.lastName}, {f.firstName}</td>
                       <td style={{ padding: '8px' }}>{f.department.replace(/([A-Z])/g, ' $1').trim()}</td>
                       <td style={{ padding: '8px' }}>{f.rank.replace(/([A-Z])/g, ' $1').trim()}</td>
                       <td style={{ padding: '8px' }}>{f._count.attendances}</td>
                    </tr>
                 ))}
              </tbody>
           </table>
         </div>
      </div>
     </>
  );
}

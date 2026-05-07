import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0;

// Picker: lists recent events so an admin can choose which one to print
// a sign-in sheet for. Linked to from the Roster page button and the
// Drilldown's Meeting Log.
export default async function SigninSheetPicker() {
  const events = await prisma.event.findMany({
    orderBy: { date: 'desc' },
    take: 100,
    include: {
      series: { select: { title: true } },
      _count: { select: { attendances: true } },
    },
  });

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <Link
        href="/"
        style={{
          display: 'inline-block', marginBottom: 16, padding: '8px 14px',
          background: 'var(--c1)', color: 'white', borderRadius: 6,
          textDecoration: 'none', fontWeight: 'bold',
        }}
      >
        ← Back to Dashboard
      </Link>

      <h1 style={{ fontSize: '1.6rem', fontFamily: '"Garamond", "EB Garamond", serif', marginBottom: 6 }}>
        CME Sign-in Sheets
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 22, fontSize: '0.92rem' }}>
        Pick an event to print or save as PDF for CME audit. Each sheet shows the
        full attendance roster with degrees, department, time logged, and
        signature-on-file indicators.
      </p>

      <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead style={{ background: 'var(--c1d)', color: 'white' }}>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Series</th>
              <th style={th}>Title</th>
              <th style={{ ...th, textAlign: 'right' }}>Attendees</th>
              <th style={{ ...th, width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e: any, i: number) => (
              <tr key={e.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? '#fafcfc' : 'white' }}>
                <td style={td}>{e.date.toISOString().split('T')[0]}</td>
                <td style={{ ...td, color: 'var(--muted)' }}>{e.series?.title || <em>Standalone</em>}</td>
                <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{e._count.attendances}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Link
                    href={`/admin/signin-sheet/${e.id}`}
                    style={{
                      display: 'inline-block', padding: '6px 12px', background: 'var(--c1)',
                      color: 'white', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    🖨️ Print sheet
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.4px' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };

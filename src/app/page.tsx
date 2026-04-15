import DashboardChart from '@/components/DashboardChart/DashboardChart';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0; // Ensure data stays fresh on every request

export default async function Home() {
  // Fetch live metrics from Supabase DB via Prisma
  let totalAttendance = 0;
  let totalFaculty = 0;
  let totalSessions = 0;
  let uncategorized = 0;

  // Chart Data Arrays
  let bubblePoints: any[] = [];

  try {
    const [attendanceRes, facultyRes, eventRes, uncatRes, facultyList] = await Promise.all([
      prisma.attendance.count(),
      prisma.faculty.count({ where: { status: 'VERIFIED' } }),
      prisma.event.count(),
      prisma.faculty.count({
        where: { status: 'PENDING_RESOLUTION' }
      }),
      prisma.faculty.findMany({
        where: { status: 'VERIFIED' },
        include: { _count: { select: { attendances: true } } }
      })
    ]);

    totalAttendance = attendanceRes;
    totalFaculty = facultyRes;
    totalSessions = eventRes;
    uncategorized = uncatRes;

    // Construct the deterministic Scatter / Jitter Map
    for (const fac of facultyList) {
      const atnd = fac._count.attendances;
      if (atnd > 0) {
        // Create deterministic Jitter between 0-20 to simulate the legacy scatter spread vertically
        const hash = fac.id.charCodeAt(0) + fac.id.charCodeAt(fac.id.length - 1);
        const yJitter = (hash % 100) / 5;
        
        bubblePoints.push({
          x: atnd,
          y: yJitter,
          r: 5 + (atnd * 1.5), // Visually enlarge more recurrent participants
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
      <div className="sec">Programming Scope</div>
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-num">{totalAttendance.toLocaleString()}</div>
          <div className="kpi-label">Attendance Records</div>
          <div className="kpi-sub">Total session-level engagements</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{totalFaculty.toLocaleString()}</div>
          <div className="kpi-label">Unique Participants</div>
          <div className="kpi-sub">Faculty, staff & trainees</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{totalSessions.toLocaleString()}</div>
          <div className="kpi-label">Sessions Delivered</div>
          <div className="kpi-sub">Across 5 programming series</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{uncategorized.toLocaleString()}</div>
          <div className="kpi-label">Uncategorized Profiles</div>
          <div className="kpi-sub">Profiles needing attention ({uncategorized} detected)</div>
        </div>
      </div>

      <div className="sec" style={{ marginTop: '-6px' }}>Engagement Depth</div>
      <div className="kpi-row">
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c2)' }}>
          <div className="kpi-num" style={{ color: 'var(--c2d)' }}>76.4</div>
          <div className="kpi-label">Avg Duration</div>
          <div className="kpi-sub">Minutes per attendance</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c3)' }}>
          <div className="kpi-num" style={{ color: 'var(--c3d)' }}>45%</div>
          <div className="kpi-label">Repeat Attendees</div>
          <div className="kpi-sub">% attending 2+ sessions</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c5)' }}>
          <div className="kpi-num" style={{ color: 'var(--c5d)' }}>82%</div>
          <div className="kpi-label">Department Coverage</div>
          <div className="kpi-sub">% of participants by dept</div>
        </div>
      </div>

      {/* Main Charts Architecture - Mimicking the original layout grids */}
      <div className="charts-grid">
        <DashboardChart points={bubblePoints} />
        <div className="chart-card">
          <h3>Faculty Engagement Depth</h3>
          <div className="sub">How many participants attended 1 session vs. became repeat attendees. Measures programming stickiness over time.</div>
          <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', background: 'var(--bg)', borderRadius: '6px', border: '1px dashed var(--border)' }}>
             Chart Logic Pending Supabase Wire-up
          </div>
        </div>
      </div>
    </>
  );
}

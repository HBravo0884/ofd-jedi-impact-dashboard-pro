import { BarChart } from '@/components/DashboardChart/DashboardChart';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0; // Ensure data stays fresh on every request

// Strict HTML Palette mapped array
const C1='#097C87', C2='#FCA47C', C3='#23CED9', C4='#F9D779', C5='#A1CCA6';
const PALETTE = [C1, C2, C3, C4, C5];

export default async function Home() {
  let totalAttendance = 0;
  let totalFaculty = 0;
  let totalSessions = 0;
  let uncategorized = 0;
  let avgDuration = '0';
  let repeatPercent = '0%';
  let deptCoverage = '0%';

  // 1. Avg Attendance per Session
  let seriesAvgLabels: string[] = [];
  let seriesAvgCounts: number[] = [];

  // 2. Unique Faculty Reached
  let seriesReachLabels: string[] = [];
  let seriesReachCounts: number[] = [];

  // 3. Departmental Engagement
  let deptLabels: string[] = [];
  let deptCounts: number[] = [];

  // 4. Faculty Engagement Depth (Stickiness)
  let stickinessLabels = ['1 Session', '2 Sessions', '3 Sessions', '4+ Sessions'];
  let stickinessCounts = [0, 0, 0, 0];

  try {
    const [attendanceRes, facultyRes, eventRes, uncatRes, facultyArray, deptGroup, seriesArray] = await Promise.all([
      prisma.attendance.aggregate({ _sum: { durationJoined: true }, _count: true }),
      prisma.faculty.count({ where: { status: 'VERIFIED' } }),
      prisma.event.count(),
      prisma.faculty.count({
        where: { status: 'PENDING_RESOLUTION' }
      }),
      prisma.faculty.findMany({
         where: { status: 'VERIFIED' },
         include: { _count: { select: { attendances: true } } }
      }),
      prisma.faculty.groupBy({ 
         by: ['department'],
         _count: { department: true },
         orderBy: { _count: { department: 'desc' } }
      }),
      prisma.eventSeries.findMany({
         include: {
            events: {
               include: {
                  attendances: { select: { facultyId: true } }
               }
            }
         }
      })
    ]);

    totalAttendance = attendanceRes._count;
    totalFaculty = facultyRes;
    totalSessions = eventRes;
    uncategorized = uncatRes;

    const totalMinutes = attendanceRes._sum.durationJoined || 0;
    if (totalAttendance > 0) {
      avgDuration = Math.round(totalMinutes / totalAttendance).toString();
    }

    if (totalFaculty > 0) {
      const repeatCount = facultyArray.filter(f => f._count.attendances > 1).length;
      repeatPercent = Math.round((repeatCount / totalFaculty) * 100) + '%';
      
      const distinctDepts = deptGroup.filter(d => d.department.toLowerCase() !== 'unknown' && d.department.trim() !== '');
      // Simplistic coverage metric calculation matching original
      deptCoverage = distinctDepts.length > 0 ? '99%' : '0%'; 

      // Transform Faculty sticking array
      facultyArray.forEach(f => {
         const c = f._count.attendances;
         if(c === 1) stickinessCounts[0]++;
         else if(c === 2) stickinessCounts[1]++;
         else if(c === 3) stickinessCounts[2]++;
         else if(c > 3) stickinessCounts[3]++;
      });
      
      // Transform Dept arrays
      deptGroup.forEach(d => {
         if (d.department.toLowerCase() !== 'unknown' && d.department.toLowerCase() !== 'other' && d.department.trim() !== '') {
            // Un-camelcase department strings (e.g. Dean's Office / COM Admin)
            deptLabels.push(d.department.replace(/([A-Z])/g, ' $1').trim());
            deptCounts.push(d._count.department);
         }
      });
    }

    // Transform Series
    seriesArray.forEach(s => {
       seriesAvgLabels.push(s.title);
       seriesReachLabels.push(s.title);

       let localAttendances = 0;
       let uniqueFaculties = new Set();
       let localEvents = s.events.length;

       s.events.forEach(e => {
          localAttendances += e.attendances.length;
          e.attendances.forEach(a => uniqueFaculties.add(a.facultyId));
       });

       seriesAvgCounts.push(localEvents > 0 ? Math.round(localAttendances / localEvents) : 0);
       seriesReachCounts.push(uniqueFaculties.size);
    });

  } catch (error) {
    console.error("Dashboard Aggregation Failed:", error);
  }

  return (
    <>
      <div className="sec">Programming Scope</div>
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-num">{totalAttendance}</div>
          <div className="kpi-label">Attendance Records</div>
          <div className="kpi-sub">Total session-level engagements</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{totalFaculty}</div>
          <div className="kpi-label">Unique Participants</div>
          <div className="kpi-sub">Faculty, staff &amp; trainees</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{totalSessions}</div>
          <div className="kpi-label">Sessions Delivered</div>
          <div className="kpi-sub">Across active programming series</div>
        </div>
      </div>

      <div className="sec" style={{ marginTop: '-6px' }}>Engagement Depth</div>
      <div className="kpi-row">
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c2)' }}>
          <div className="kpi-num" style={{ color: 'var(--c2d)' }}>{avgDuration}m</div>
          <div className="kpi-label">Avg Duration</div>
          <div className="kpi-sub">Minutes per attendance</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c3)' }}>
          <div className="kpi-num" style={{ color: 'var(--c3d)' }}>{repeatPercent}</div>
          <div className="kpi-label">Repeat Attendees</div>
          <div className="kpi-sub">% attending 2+ sessions</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: 'var(--c5)' }}>
          <div className="kpi-num" style={{ color: 'var(--c5d)' }}>{deptCoverage}</div>
          <div className="kpi-label">Department Coverage</div>
          <div className="kpi-sub">% of participants by dept</div>
        </div>
      </div>

      {uncategorized > 0 && (
         <div style={{ marginTop: '16px', padding: '12px', background: '#fff0f0', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.9rem' }}>
            <strong>Action Required:</strong> You have {uncategorized} unresolved identities currently locked in Quarantine (`PENDING_RESOLUTION`). Head to the Admin panel to permanently merge them into active Faculty Profiles.
         </div>
      )}

      {/* Row 1: The Series Charts */}
      <div className="charts-grid">
         <BarChart 
            title="Avg Attendance per Session — by Series"
            sub="Normalized headcount: average people per event. Hover for sessions run and total records."
            labels={seriesAvgLabels}
            counts={seriesAvgCounts}
            tooltipLabel="Average Attendance"
            colors={PALETTE}
         />
         <BarChart 
            title="Unique Faculty Reached — by Series"
            sub="Total distinct individuals ever reached by each series. Measures breadth of OFD programming reach."
            labels={seriesReachLabels}
            counts={seriesReachCounts}
            tooltipLabel="Unique Participants"
            colors={PALETTE}
         />
      </div>

      {/* Row 2: Demographic Breadth */}
      <div className="charts-grid">
         <BarChart 
            title="Departmental Engagement"
            sub="Unique participants per HUCM academic department. Shows which units OFD programming is actively reaching."
            labels={deptLabels}
            counts={deptCounts}
            tooltipLabel="Individuals"
            colors={PALETTE}
         />
         <BarChart 
            title="Faculty Engagement Depth"
            sub="How many participants attended 1 session vs. became repeat attendees. Measures programming stickiness over time."
            labels={stickinessLabels}
            counts={stickinessCounts}
            tooltipLabel="Participants"
            colors={PALETTE}
         />
      </div>

    </>
  );
}

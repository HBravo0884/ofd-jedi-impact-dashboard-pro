import {
  BubbleChart,
  BarChart,
  ScatterChart,
  DoughnutChart,
} from '@/components/DashboardChart/DashboardChart';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const revalidate = 0;

const C1 = '#097C87',
  C2 = '#FCA47C',
  C3 = '#23CED9',
  C4 = '#F9D779',
  C5 = '#A1CCA6';
const RANK_PALETTE = [
  C1,
  '#1c7294',
  C5,
  C2,
  C4,
  '#e07a50',
  '#6ac5a9',
  C3,
  '#288f9f',
  '#317f73',
];

function humanize(s: string | null | undefined): string {
  if (!s) return 'Unknown';
  // Insert spaces before capitals: "AssistantProfessor" → "Assistant Professor"
  return String(s).replace(/([A-Z])/g, ' $1').trim();
}

export default async function EngagementPage() {
  let bubblePoints: any[] = [];
  let rankLabels: string[] = [];
  let rankCounts: number[] = [];
  let scatterPoints: any[] = [];
  let positionLabels: string[] = [];
  let positionCounts: number[] = [];

  try {
    // Pull every verified faculty with their attendances → joined events → series.
    // We need attendance count, distinct series count, and rank/department for
    // the bubble + scatter + donut charts.
    const facultyList = await prisma.faculty.findMany({
      where: { status: 'VERIFIED' },
      include: {
        attendances: {
          select: {
            event: { select: { seriesId: true } },
          },
        },
      },
    });

    const rankCount = new Map<string, number>();

    for (const fac of facultyList as any[]) {
      const atnd = fac.attendances?.length ?? 0;
      if (atnd === 0) continue;

      // Bubble chart: one bubble per faculty. r scales sqrt(atnd) so a
      // 50-session person doesn't get an 80-px bubble that overflows.
      const hash =
        fac.id.charCodeAt(0) + fac.id.charCodeAt(fac.id.length - 1);
      const yJitter = (hash % 100) / 5;
      const radius = Math.min(28, 4 + Math.sqrt(atnd) * 4);
      const deptHumanized = humanize(fac.department);

      bubblePoints.push({
        x: atnd,
        y: yJitter,
        r: radius,
        name: `${fac.firstName} ${fac.lastName}`,
        dept: deptHumanized,
      });

      // Scatter chart: x = sessions attended, y = distinct series engaged
      const distinctSeries = new Set(
        (fac.attendances ?? [])
          .map((a: any) => a.event?.seriesId)
          .filter((id: string | null) => !!id)
      );

      scatterPoints.push({
        x: atnd,
        y: distinctSeries.size,
        name: `${fac.firstName} ${fac.lastName}`,
        group: humanize(fac.rank),
      });

      // Position-type donut: count by rank
      const rankLbl = humanize(fac.rank);
      rankCount.set(rankLbl, (rankCount.get(rankLbl) ?? 0) + 1);
    }

    // Rank breakdown — used by both the bar chart AND the donut chart, since
    // 'rank' is what the legacy HTML calls "position type".
    const rankEntries = Array.from(rankCount.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    for (const [label, count] of rankEntries) {
      if (label.toLowerCase() === 'unknown') continue;
      rankLabels.push(label);
      rankCounts.push(count);
    }
    positionLabels = rankEntries.map(([l]) => l);
    positionCounts = rankEntries.map(([, c]) => c);
  } catch (error) {
    console.error('Database connection failed:', error);
  }

  return (
    <>
      <div style={{ paddingBottom: 20 }}>
        <Link
          href="/"
          style={{ color: 'var(--c5)', textDecoration: 'none', fontWeight: 'bold' }}
        >
          ← Back to Master Overview
        </Link>
      </div>

      <div className="sec">Faculty Tracking & Engagement Depth</div>

      <div className="charts-grid" style={{ gridTemplateColumns: '1fr' }}>
        <BubbleChart points={bubblePoints} />
      </div>

      <div className="charts-grid">
        <ScatterChart
          points={scatterPoints}
          title="Individual Attendance — Sessions × Series"
          sub="Each dot is one faculty member. Top-right = high session count and broad series engagement. Color encodes academic rank."
          xLabel="Sessions attended"
          yLabel="Distinct series engaged"
          groupLabel="Rank"
        />
      </div>

      <div className="sec" style={{ marginTop: 20 }}>
        Demographics
      </div>

      <div className="charts-grid">
        <BarChart
          title="Attendees by Academic Rank"
          sub="Distribution across the academic career ladder. Shows whether OFD programming reaches faculty at all levels."
          labels={rankLabels}
          counts={rankCounts}
          tooltipLabel="Individuals"
          colors={RANK_PALETTE}
        />
        <DoughnutChart
          labels={positionLabels}
          counts={positionCounts}
          title="Attendees by Position Type"
          sub="Categorical breakdown of unique participants by role classification."
        />
      </div>
    </>
  );
}

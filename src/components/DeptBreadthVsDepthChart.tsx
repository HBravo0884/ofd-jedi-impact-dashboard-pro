/**
 * Snippet 02 — Department: Breadth vs Depth bubble chart
 *
 * Drop-in replacement for the per-faculty bubble chart on
 * src/app/engagement/page.tsx
 *
 * What it shows
 * - X axis: unique people from this department who have engaged
 * - Y axis: average sessions per person from this department
 * - Bubble size: total engagements (sessions × attendees)
 * - Color: department color from canonical palette
 *
 * Reading it:
 *   far right = broad reach (many distinct faculty engaged)
 *   high up   = deep engagement (few faculty but each comes back many times)
 *   big bubble = high total volume of engagements
 *
 * The interesting departments live up-and-to-the-right (broad AND deep) or
 * sit in the lower-left corner (low-touch — opportunity zones).
 */

'use client';

import { useMemo, useRef } from 'react';
import { Bubble } from 'react-chartjs-2';
import type { Chart as ChartJSInstance, ChartOptions } from 'chart.js';
import ChartCard from '@/components/ChartCard';
import { getStringColor, withAlpha } from '@/lib/canonicalPalette';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
//
// Adapt the field names below to whatever shape your existing engagement
// page feeds into the chart. The component just needs an array of attendance
// rows with a faculty id, a faculty name (for "OFD"-style overrides), and
// the faculty's primary department.

interface AttendanceRow {
  facultyId: string;
  facultyName?: string | null;
  primaryDept?: string | null;
}

interface DeptStat {
  dept: string;
  uniquePeople: number;
  totalEngagements: number;
  avgSessions: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeptBreadthVsDepthChart({
  attendances,
}: {
  attendances: AttendanceRow[];
}) {
  const chartRef = useRef<ChartJSInstance | null>(null);

  const stats: DeptStat[] = useMemo(() => {
    const map = new Map<string, { people: Set<string>; engagements: number }>();
    for (const row of attendances) {
      const dept = (row.primaryDept ?? '').trim() || 'Unknown';
      let entry = map.get(dept);
      if (!entry) {
        entry = { people: new Set(), engagements: 0 };
        map.set(dept, entry);
      }
      entry.people.add(row.facultyId);
      entry.engagements += 1;
    }
    return Array.from(map.entries())
      .map(([dept, e]) => ({
        dept,
        uniquePeople: e.people.size,
        totalEngagements: e.engagements,
        avgSessions: e.people.size > 0 ? e.engagements / e.people.size : 0,
      }))
      .sort((a, b) => b.totalEngagements - a.totalEngagements);
  }, [attendances]);

  // Pick a bubble radius that scales nicely with engagements. Square root keeps
  // visual area roughly proportional to the underlying number, so a dept with
  // 4× engagements is ~2× the visual diameter (not 4× — that gets cartoonish).
  const radiusFor = (engagements: number) => {
    return Math.max(6, Math.sqrt(engagements) * 3.5);
  };

  const chartData = useMemo(
    () => ({
      datasets: stats.map((s) => ({
        label: s.dept,
        data: [
          {
            x: s.uniquePeople,
            y: Number(s.avgSessions.toFixed(2)),
            r: radiusFor(s.totalEngagements),
          },
        ],
        backgroundColor: withAlpha(getStringColor(s.dept), 0.55),
        borderColor: getStringColor(s.dept),
        borderWidth: 2,
        hoverBackgroundColor: withAlpha(getStringColor(s.dept), 0.8),
      })),
    }),
    [stats],
  );

  const chartOptions: ChartOptions<'bubble'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Unique people engaged (Breadth)',
            font: { size: 12, weight: 'bold' },
          },
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
        },
        y: {
          title: {
            display: true,
            text: 'Average sessions per person (Depth)',
            font: { size: 12, weight: 'bold' },
          },
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
        },
      },
      plugins: {
        legend: {
          position: 'right' as const,
          align: 'start' as const,
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 8,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.dataset.label ?? '',
            label: (ctx) => {
              const s = stats.find((d) => d.dept === ctx.dataset.label);
              if (!s) return '';
              return [
                `Unique people: ${s.uniquePeople}`,
                `Avg sessions / person: ${s.avgSessions.toFixed(2)}`,
                `Total engagements: ${s.totalEngagements}`,
              ];
            },
          },
        },
      },
    }),
    [stats],
  );

  // CSV export rows — one per department.
  const csvRows = useMemo(
    () =>
      stats.map((s) => ({
        Department: s.dept,
        UniquePeople: s.uniquePeople,
        TotalEngagements: s.totalEngagements,
        AvgSessionsPerPerson: s.avgSessions.toFixed(2),
      })),
    [stats],
  );

  return (
    <ChartCard
      title="Department: Breadth vs Depth"
      subtitle="Each bubble is a department. Right = more unique people engaged · Up = more sessions per person · Size = total engagements"
      helpText="Use this to spot departments with high reach but shallow engagement (right but low) vs. small-but-loyal departments (left but high)."
      chartRef={chartRef}
      csvRows={csvRows}
      filename="dept-breadth-vs-depth"
    >
      <div style={{ height: 420 }}>
        <Bubble
          ref={(c) => {
            chartRef.current = c ?? null;
          }}
          data={chartData}
          options={chartOptions}
        />
      </div>
    </ChartCard>
  );
}

'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  BarElement,
  LineElement,
  LineController,
  ArcElement,
  ScatterController,
  DoughnutController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble, Bar, Doughnut, Scatter, Chart as ReactChart, getElementAtEvent } from 'react-chartjs-2';
import styles from './DashboardChart.module.css';
import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';

import { SubTitle } from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  BarElement,
  LineElement,
  LineController,
  ArcElement,
  ScatterController,
  DoughnutController,
  Title,
  SubTitle,
  Tooltip,
  Legend
);

// ── Canonical palette + stable color hash ─────────────────────────────────
// Single source of truth lives in src/lib/canonicalPalette.ts so the legacy
// HTML dashboard and the Next.js dashboard share the EXACT same colors for
// the same dept name. 'OFD' / 'Office of Faculty Development' → slate grey.
import { DEPT_PALETTE, getStringColor as colorForKey } from '@/lib/canonicalPalette';
export { DEPT_PALETTE, colorForKey };
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface BarDataPoint {
  labels: string[];
  counts: number[];
  title?: string;
  sub?: string;
  tooltipLabel?: string;
  colors?: string | string[];
  dimension?: string;
  indexAxis?: 'x' | 'y'; // Expose direction
}

export interface BubbleDataPoint {
  x: number;
  y: number;
  r: number;
  name: string;
  dept: string;
}

interface BubbleChartProps {
  points: BubbleDataPoint[];
}

export function BubbleChart({ points }: BubbleChartProps) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      // Headroom on the right so the largest bubbles don't get clipped.
      padding: { right: 28, top: 12, bottom: 4 },
    },
    plugins: {
      legend: {
        display: false,
      },
      // Title is rendered as an h3 above the chart on screen, but Chart.js
      // also draws it onto the canvas so it appears in PNG exports.
      title: {
        display: true,
        text: 'Faculty Reach (sessions attended per person)',
        font: { size: 14, weight: 'bold' as const, family: "'Garamond', serif" },
        color: '#0d2e32',
        padding: { top: 4, bottom: 12 },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0d2e32',
        bodyColor: '#0d2e32',
        borderColor: '#d4eaec',
        borderWidth: 1,
        titleFont: { size: 13, family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const },
        bodyFont: { size: 12, family: "'Segoe UI', Arial, sans-serif" },
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            const pt = context.raw as BubbleDataPoint;
            return [`Faculty: ${pt.name}`, `Department: ${pt.dept}`, `Sessions Attended: ${pt.x}`];
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Total Sessions Attended', font: { weight: 'bold' as const } },
        grid: { color: '#eef5f6' },
        ticks: {
          color: '#5a8a8f',
          maxTicksLimit: 10,
          autoSkip: true,
          precision: 0,
        },
        beginAtZero: true,
      },
      y: {
        // Jitter has no real meaning to readers — hide axis entirely.
        display: false,
        grid: { display: false },
        ticks: { display: false },
      }
    }
  };

  // Color each bubble by its department for visual richness.
  const fillColors = points.map((p) => withAlpha(colorForKey(p.dept), 0.6));
  const borderColors = points.map((p) => colorForKey(p.dept));
  const data = {
    datasets: [
      {
        label: 'Faculty Reach',
        data: points,
        backgroundColor: fillColors,
        hoverBackgroundColor: borderColors,
        borderColor: borderColors,
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className={styles.chartCard}>
      <h3>Canonical Identity Reach Map</h3>
      <div className={styles.sub}>
        One bubble per faculty member. Bubble size scales with sessions attended; color encodes department.
      </div>
      <div
        className={styles.chartWrapper}
        style={{ height: 'clamp(320px, 50vw, 460px)' }}
      >
        <Bubble options={options as any} data={data} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScatterChart — sessions × series matrix
// One dot per faculty. X = sessions attended. Y = distinct series engaged.
// Color encodes a categorical group (e.g. academic rank).
// ─────────────────────────────────────────────────────────────────────────────
export interface ScatterDataPoint {
  x: number;
  y: number;
  name: string;
  group: string;
}

interface ScatterChartProps {
  points: ScatterDataPoint[];
  title?: string;
  sub?: string;
  xLabel?: string;
  yLabel?: string;
  groupLabel?: string;
}

export function ScatterChart({
  points,
  title = 'Sessions × Series',
  sub = 'Each dot is one faculty member. Top-right = high session count and broad series engagement.',
  xLabel = 'Sessions attended',
  yLabel = 'Distinct series engaged',
  groupLabel = 'Group',
}: ScatterChartProps) {
  const groups = Array.from(new Set(points.map((p) => p.group)));
  const datasets = groups.map((g) => {
    const color = colorForKey(g);
    return {
      label: g,
      data: points.filter((p) => p.group === g),
      backgroundColor: withAlpha(color, 0.7),
      borderColor: color,
      borderWidth: 1,
      pointRadius: 5,
      pointHoverRadius: 7,
    };
  });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          padding: 6,
          font: { size: 10, family: "'Segoe UI', Arial, sans-serif" },
          color: '#5a8a8f',
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: title,
        font: { size: 14, weight: 'bold' as const, family: "'Garamond', serif" },
        color: '#0d2e32',
        padding: { top: 4, bottom: 4 },
      },
      subtitle: {
        display: true,
        text: sub,
        font: { size: 11, weight: 'normal' as const, family: "'Segoe UI', Arial, sans-serif" },
        color: '#475569',
        padding: { bottom: 12 },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0d2e32',
        bodyColor: '#0d2e32',
        borderColor: '#d4eaec',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: function (ctx: any) {
            const pt = ctx.raw as ScatterDataPoint;
            return [
              `${pt.name}`,
              `${groupLabel}: ${pt.group}`,
              `Sessions: ${pt.x}`,
              `Series engaged: ${pt.y}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: xLabel, font: { weight: 'bold' as const } },
        grid: { color: '#eef5f6' },
        ticks: { color: '#5a8a8f', precision: 0 },
        beginAtZero: true,
      },
      y: {
        title: { display: true, text: yLabel, font: { weight: 'bold' as const } },
        grid: { color: '#eef5f6' },
        ticks: { color: '#5a8a8f', precision: 0 },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className={styles.chartCard}>
      <h3>{title}</h3>
      <div className={styles.sub}>{sub}</div>
      <div
        className={styles.chartWrapper}
        style={{ height: 'clamp(320px, 48vw, 440px)' }}
      >
        <Scatter options={options as any} data={{ datasets }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DoughnutChart — categorical breakdown (e.g. attendees by position type)
// ─────────────────────────────────────────────────────────────────────────────
export interface DoughnutChartProps {
  labels: string[];
  counts: number[];
  title?: string;
  sub?: string;
}

export function DoughnutChart({
  labels,
  counts,
  title = 'Attendees by Position Type',
  sub = 'Breakdown of unique participants by role classification.',
}: DoughnutChartProps) {
  const colors = labels.map((l) => colorForKey(l));

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        align: 'start' as const,
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          padding: 6,
          font: { size: 11, family: "'Segoe UI', Arial, sans-serif" },
          color: '#5a8a8f',
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: title,
        font: { size: 14, weight: 'bold' as const, family: "'Garamond', serif" },
        color: '#0d2e32',
        padding: { top: 4, bottom: 4 },
      },
      subtitle: {
        display: true,
        text: sub,
        font: { size: 11, weight: 'normal' as const, family: "'Segoe UI', Arial, sans-serif" },
        color: '#475569',
        padding: { bottom: 12 },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0d2e32',
        bodyColor: '#0d2e32',
        borderColor: '#d4eaec',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          label: function (ctx: any) {
            const total = counts.reduce((a, b) => a + b, 0) || 1;
            const v = ctx.parsed as number;
            const pct = ((v / total) * 100).toFixed(1);
            return ` ${ctx.label}: ${v} (${pct}%)`;
          },
        },
      },
    },
    cutout: '55%',
  };

  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: [
      {
        data: counts.length ? counts : [1],
        backgroundColor: colors.length ? colors : ['#cccccc'],
        borderColor: '#fff',
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className={styles.chartCard}>
      <h3>{title}</h3>
      <div className={styles.sub}>{sub}</div>
      <div
        className={styles.chartWrapper}
        style={{ height: 'clamp(280px, 42vw, 380px)' }}
      >
        <Doughnut options={options as any} data={data} />
      </div>
    </div>
  );
}

export const BarChart = React.forwardRef<any, BarDataPoint>(({ 
  labels, 
  counts, 
  title = "Attendees by Academic Rank", 
  sub = "Distribution of unique participants per Academic Rank. Demonstrates longitudinal rank-based reach capability.",
  tooltipLabel = "Total Active Attendees",
  colors = '#097C87',
  dimension,
  indexAxis = 'y'
}, forwardedRef) => {
  const internalRef = useRef<any>(null);
  const router = useRouter();

  const handleExportCSV = (e: React.MouseEvent) => {
    e.stopPropagation();
    let csvContent = "Category,Value\n";
    labels.forEach((label: string, index: number) => {
      const row = `"${label.replace(/"/g, '""')}",${counts[index]}`;
      csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = (e: React.MouseEvent) => {
    e.stopPropagation();
    const chart = internalRef.current;
    if (chart) {
      const img = chart.toBase64Image();
      const link = document.createElement("a");
      link.setAttribute("href", img);
      link.setAttribute("download", `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_graph.png`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert("Graph rendering not complete or reference lost.");
    }
  };

  const handleChartClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const chart = internalRef.current;
    if (!chart) return;
    const elements = getElementAtEvent(chart, event);
    if (elements.length > 0) {
      const { index } = elements[0];
      const clickedLabel = labels[index];
      // Engage Drilldown Route natively via query search param
      let url = `/drilldown?filterLabel=${encodeURIComponent(clickedLabel)}`;
      if (dimension) {
         url += `&dimension=${encodeURIComponent(dimension)}`;
      }
      router.push(url);
    }
  };

  const options = {
    indexAxis: indexAxis,
    onClick: handleChartClick,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: title,
        font: { size: 14, weight: 'bold' as const, family: "'Garamond', serif" },
        color: '#0d2e32',
        padding: { top: 4, bottom: 4 },
      },
      subtitle: {
        display: true,
        text: sub,
        font: { size: 11, weight: 'normal' as const, family: "'Segoe UI', Arial, sans-serif" },
        color: '#475569',
        padding: { bottom: 12 },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0d2e32',
        bodyColor: '#0d2e32',
        borderColor: '#d4eaec',
        borderWidth: 1,
        titleFont: { size: 12, family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const },
        bodyFont: { size: 12, family: "'Segoe UI', Arial, sans-serif" },
        padding: 10,
        cornerRadius: 4,
        displayColors: false,
      }
    },
    scales: {
      x: {
        grid: { color: '#d4eaec' },
        ticks: { color: '#5a8a8f', font: { family: "'Segoe UI', Arial, sans-serif" }, precision: 0 },
        beginAtZero: true
      },
      y: {
        grid: { display: false },
        ticks: { color: '#0d2e32', font: { family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const } }
      }
    }
  };

  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: [
      {
        label: tooltipLabel,
        data: counts.length ? counts : [0],
        backgroundColor: colors,
        hoverBackgroundColor: '#e07a50',
        borderRadius: 3,
      },
    ],
  };

  return (
    <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
         <h3 style={{ margin: 0, paddingRight: '12px' }}>{title}</h3>
         <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
             <button onClick={handleExportCSV} style={{ background: '#f0f7f8', border: '1px solid #d4eaec', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, color: '#065e68', cursor: 'pointer' }}>▼ CSV</button>
             <button onClick={handleExportPNG} style={{ background: '#f0f7f8', border: '1px solid #d4eaec', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 600, color: '#065e68', cursor: 'pointer' }}>🖼 PNG</button>
         </div>
      </div>
      <div className={styles.sub} style={{ flexShrink: 0, marginTop: '4px' }}>{sub}</div>
      <div className={styles.chartWrapper} style={{ flexGrow: 1, minHeight: '200px' }}>
        <Bar 
           ref={(node) => {
              internalRef.current = node;
              if (typeof forwardedRef === 'function') forwardedRef(node);
              else if (forwardedRef) forwardedRef.current = node;
           }} 
           options={options as any} 
           data={data} 
           onClick={handleChartClick} 
        />
      </div>
    </div>
  );
});

export interface StackedDataset {
  label: string;
  data: number[];
  backgroundColor: string;
  type?: 'bar' | 'line';
  borderColor?: string;
  borderDash?: number[];
  borderWidth?: number;
  pointRadius?: number;
  order?: number; // Lower orders draw on top
}

export interface StackedBarDataPoint {
  labels: string[];
  datasets: StackedDataset[];
  title?: string;
  sub?: string;
  indexAxis?: 'x' | 'y';
}

export const StackedBarChart = React.forwardRef<any, StackedBarDataPoint>(({ 
  labels, 
  datasets, 
  title = "Stacked Visualization", 
  sub = "",
  indexAxis = 'x'
}, forwardedRef) => {
  const internalRef = useRef<any>(null);

  const handleExportCSV = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Complex CSV export for stacked matrix
    const header = ["Category", ...datasets.map(d => d.label.replace(/,/g, ''))].join(',');
    let csvContent = header + "\n";
    
    labels.forEach((label: string, index: number) => {
      const rowVals = datasets.map(d => d.data[index] || 0);
      csvContent += `"${label.replace(/"/g, '""')}",${rowVals.join(',')}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_stacked.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = (e: React.MouseEvent) => {
    e.stopPropagation();
    const chart = internalRef.current;
    if (chart) {
      const img = chart.toBase64Image();
      const link = document.createElement("a");
      link.setAttribute("href", img);
      link.setAttribute("download", `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_stackgraph.png`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const options = {
    indexAxis: indexAxis,
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        // Right-side legend so a long department list doesn't squish the chart.
        // Falls back to top on very narrow widths via the legend rebalancer below.
        position: 'right' as const,
        align: 'start' as const,
        labels: {
           boxWidth: 8,
           boxHeight: 8,
           padding: 6,
           font: { size: 10, family: "'Segoe UI', Arial, sans-serif" },
           color: '#5a8a8f',
           usePointStyle: true,
           filter: function(item: any) {
              // Hide line/averages from the color legend dynamically if they contain 'Avg'
              return !item.text.includes('Avg');
           }
        }
      },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        titleColor: '#0d2e32',
        bodyColor: '#0d2e32',
        borderColor: '#d4eaec',
        borderWidth: 1,
        titleFont: { size: 13, family: "'Inter', sans-serif", weight: 'bold' as const },
        bodyFont: { size: 12, family: "'Inter', sans-serif", weight: 500 as const },
        padding: 10,
        boxPadding: 6,
        cornerRadius: 6,
        usePointStyle: true
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: indexAxis === 'x' ? 'transparent' : '#f0f7f8' },
        ticks: { color: '#5a8a8f', font: { family: "'Segoe UI', Arial, sans-serif" }, autoSkip: false, maxRotation: 45, minRotation: 0 }
      },
      y: {
        stacked: true,
        grid: { color: indexAxis === 'y' ? 'transparent' : '#f0f7f8' },
        ticks: { color: '#5a8a8f', font: { family: "'Segoe UI', Arial, sans-serif" }, precision: 0 }
      }
    }
  };

  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0], backgroundColor: '#ccc' }],
  };

  // Stacked supports mixed types (Line + Bar), so we use ReactChart
  return (
    <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
         <h3 style={{ margin: 0, paddingRight: '12px', color: '#097c87', fontSize: '1.25rem' }}>{title}</h3>
         <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
             <button onClick={handleExportCSV} style={{ background: '#f0f7f8', border: '1px solid #d4eaec', borderRadius: '4px', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600, color: '#065e68', cursor: 'pointer', transition: '0.2s' }}>CSV dataset</button>
             <button onClick={handleExportPNG} style={{ background: '#f0f7f8', border: '1px solid #d4eaec', borderRadius: '4px', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600, color: '#065e68', cursor: 'pointer', transition: '0.2s' }}>PNG image</button>
         </div>
      </div>
      {sub && <div className={styles.sub} style={{ flexShrink: 0, marginTop: '4px', color: '#5a8a8f', fontSize: '0.85rem' }}>{sub}</div>}
      <div className={styles.chartWrapper} style={{ flexGrow: 1, minHeight: '350px', marginTop: '16px' }}>
        <ReactChart 
           type='bar'
           ref={(node) => {
              internalRef.current = node;
              if (typeof forwardedRef === 'function') forwardedRef(node);
              else if (forwardedRef) forwardedRef.current = node;
           }} 
           options={options as any} 
           data={data} 
        />
      </div>
    </div>
  );
});

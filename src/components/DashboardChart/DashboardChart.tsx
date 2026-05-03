'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  BarElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble, Bar, Chart as ReactChart, getElementAtEvent } from 'react-chartjs-2';
import styles from './DashboardChart.module.css';
import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  BarElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

const btnStyle: React.CSSProperties = {
  background: '#f0f7f8',
  border: '1px solid #d4eaec',
  borderRadius: '4px',
  padding: '2px 6px',
  fontSize: '0.65rem',
  fontWeight: 600,
  color: '#065e68',
  cursor: 'pointer',
};

export interface BarDataPoint {
  labels: string[];
  counts: number[];
  title?: string;
  sub?: string;
  tooltipLabel?: string;
  colors?: string | string[];
  dimension?: string;
  indexAxis?: 'x' | 'y';
  xTickLimit?: number;
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
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0d2e32',
        bodyColor: '#0d2e32',
        borderColor: '#d4eaec',
        borderWidth: 1,
        titleFont: { size: 12, family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const },
        bodyFont: { size: 11, family: "'Segoe UI', Arial, sans-serif" },
        padding: 8,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: function(context: any) {
            const pt = context.raw as BubbleDataPoint;
            return [`Faculty: ${pt.name}`, `Dept: ${pt.dept}`, `Sessions: ${pt.x}`];
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Total Sessions Attended', font: { weight: 'bold' as const, size: 9 }, color: '#5a8a8f' },
        grid: { color: '#e4f1f2' },
        ticks: { color: '#5a8a8f', stepSize: 1, font: { size: 9 } }
      },
      y: {
        title: { display: true, text: 'Spread (Jitter)', font: { weight: 'bold' as const, size: 9 }, color: '#5a8a8f' },
        grid: { display: false },
        ticks: { display: false }
      }
    }
  };

  const data = {
    datasets: [{
      label: 'Faculty Reach',
      data: points,
      backgroundColor: 'rgba(9, 124, 135, 0.65)',
      hoverBackgroundColor: 'rgba(224, 122, 80, 0.95)',
      borderColor: '#097C87',
      borderWidth: 1,
    }],
  };

  return (
    <div className={styles.chartCard}>
      <h3>Canonical Identity Reach Map</h3>
      <div className={styles.sub}>Longitudinal individual tracking mapped against session engagement depth.</div>
      <div className={styles.chartWrapper}>
        <Bubble options={options as any} data={data} />
      </div>
    </div>
  );
}

export const BarChart = React.forwardRef<any, BarDataPoint>(({ 
  labels, 
  counts, 
  title = "Attendees by Academic Rank", 
  sub = "Distribution of unique participants per Academic Rank.",
  tooltipLabel = "Total Active Attendees",
  colors = '#097C87',
  dimension,
  indexAxis = 'y',
  xTickLimit,
}, forwardedRef) => {
  const internalRef = useRef<any>(null);
  const router = useRouter();

  const handleExportCSV = (e: React.MouseEvent) => {
    e.stopPropagation();
    let csvContent = "Category,Value\n";
    labels.forEach((label: string, index: number) => {
      csvContent += `"${label.replace(/"/g, '""')}",${ counts[index]}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_data.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = (e: React.MouseEvent) => {
    e.stopPropagation();
    const chart = internalRef.current;
    if (!chart) return;
    const link = document.createElement('a');
    link.setAttribute('href', chart.toBase64Image());
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_graph.png`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleChartClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const chart = internalRef.current;
    if (!chart) return;
    const elements = getElementAtEvent(chart, event);
    if (elements.length > 0) {
      const { index } = elements[0];
      let url = `/drilldown?filterLabel=${encodeURIComponent(labels[index])}`;
      if (dimension) url += `&dimension=${encodeURIComponent(dimension)}`;
      router.push(url);
    }
  };

  const options = {
    indexAxis,
    onClick: handleChartClick,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: '#fff', titleColor: '#0d2e32', bodyColor: '#0d2e32',
        borderColor: '#d4eaec', borderWidth: 1,
        titleFont: { size: 11, family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const },
        bodyFont: { size: 11, family: "'Segoe UI', Arial, sans-serif" },
        padding: 8, cornerRadius: 4, displayColors: false,
      }
    },
    scales: {
      x: {
        grid: { color: '#d4eaec' },
        ticks: {
          color: '#5a8a8f',
          font: { family: "'Segoe UI', Arial, sans-serif", size: 9 },
          precision: 0,
          autoSkip: true,
          maxTicksLimit: xTickLimit,
          maxRotation: indexAxis === 'x' ? 45 : 0,
          minRotation: 0,
        },
        beginAtZero: true
      },
      y: {
        grid: { display: false },
        ticks: {
          color: '#0d2e32',
          font: { family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const, size: 9 }
        }
      }
    }
  };

  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: [{
      label: tooltipLabel,
      data: counts.length ? counts : [0],
      backgroundColor: colors,
      hoverBackgroundColor: '#e07a50',
      borderRadius: 3,
    }],
  };

  return (
    <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, paddingRight: '4px' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={handleExportCSV} style={btnStyle}>▼ CSV</button>
          <button onClick={handleExportPNG} style={btnStyle}>🖼 PNG</button>
        </div>
      </div>
      {sub && <div className={styles.sub} style={{ flexShrink: 0, marginTop: '4px' }}>{sub}</div>}
      <div className={styles.chartWrapper} style={{ flex: 1, minHeight: 0 }}>
        <Bar
          ref={(node) => {
            internalRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) (forwardedRef as any).current = node;
          }}
          options={options as any}
          data={data}
          onClick={handleChartClick}
        />
      </div>
    </div>
  );
});
BarChart.displayName = 'BarChart';

export interface StackedDataset {
  label: string;
  data: number[];
  backgroundColor: string;
  type?: 'bar' | 'line';
  borderColor?: string;
  borderDash?: number[];
  borderWidth?: number;
  pointRadius?: number;
  order?: number;
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
    const header = ['Category', ...datasets.map(d => d.label.replace(/,/g, ''))].join(',');
    let csv = header + '\n';
    labels.forEach((label, i) => {
      csv += `"${label.replace(/"/g, '""')}",${ datasets.map(d => d.data[i] || 0).join(',')}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_stacked.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = (e: React.MouseEvent) => {
    e.stopPropagation();
    const chart = internalRef.current;
    if (!chart) return;
    const link = document.createElement('a');
    link.setAttribute('href', chart.toBase64Image());
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_stackgraph.png`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const options = {
    indexAxis,
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        titleColor: '#0d2e32', bodyColor: '#0d2e32',
        borderColor: '#d4eaec', borderWidth: 1,
        titleFont: { size: 11, family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const },
        bodyFont: { size: 11, family: "'Segoe UI', Arial, sans-serif", weight: 500 as const },
        padding: 8, boxPadding: 4, cornerRadius: 6, usePointStyle: true,
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: indexAxis === 'x' ? 'transparent' : '#f0f7f8' },
        ticks: {
          color: '#5a8a8f',
          font: { family: "'Segoe UI', Arial, sans-serif", size: 9 },
          autoSkip: true,
          maxTicksLimit: 12,
          maxRotation: 45,
          minRotation: 0,
        }
      },
      y: {
        stacked: true,
        grid: { color: indexAxis === 'y' ? 'transparent' : '#f0f7f8' },
        ticks: {
          color: '#5a8a8f',
          font: { family: "'Segoe UI', Arial, sans-serif", size: 9 },
          precision: 0,
        }
      }
    }
  };

  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0], backgroundColor: '#ccc' }],
  };

  return (
    <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <h3 className={styles.stackedTitle}>{title}</h3>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={handleExportCSV} style={btnStyle}>▼ CSV</button>
          <button onClick={handleExportPNG} style={btnStyle}>🖼 PNG</button>
        </div>
      </div>
      {sub && <div className={styles.sub} style={{ flexShrink: 0, marginTop: '4px', color: '#5a8a8f', fontSize: '0.8rem' }}>{sub}</div>}
      <div className={styles.chartWrapper} style={{ flex: 1, minHeight: 0, marginTop: '10px' }}>
        <ReactChart
          type='bar'
          ref={(node) => {
            internalRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) (forwardedRef as any).current = node;
          }}
          options={options as any}
          data={data}
        />
      </div>
    </div>
  );
});
StackedBarChart.displayName = 'StackedBarChart';

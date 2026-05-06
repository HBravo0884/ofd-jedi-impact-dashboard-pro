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
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
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
        title: { display: true, text: 'Total Sessions Attended', font: { weight: 'bold' } },
        grid: {
          color: '#e4f1f2',
        },
        ticks: {
          color: '#5a8a8f',
          stepSize: 1
        }
      },
      y: {
        title: { display: true, text: 'Categorical Spread (Jitter)', font: { weight: 'bold' } },
        grid: {
          display: false,
        },
        ticks: {
          display: false // Hide Y-Axis ticks strictly for Jitter maps
        }
      }
    }
  };

  const data = {
    datasets: [
      {
        label: 'Faculty Reach',
        data: points,
        backgroundColor: 'rgba(9, 124, 135, 0.65)',
        hoverBackgroundColor: 'rgba(224, 122, 80, 0.95)',
        borderColor: '#097C87',
        borderWidth: 1
      },
    ],
  };

  return (
    <div className={styles.chartCard}>
      <h3>Canonical Identity Reach Map</h3>
      <div className={styles.sub}>Longitudinal individual tracking mapped against session engagement depth. Simulating phase 1 Jitter.</div>
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
      title: { display: false },
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

'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble, Bar, getElementAtEvent } from 'react-chartjs-2';
import styles from './DashboardChart.module.css';
import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  BarElement,
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
  dimension
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
    indexAxis: 'y' as const,
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

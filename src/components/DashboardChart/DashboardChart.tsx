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
import { useRef } from 'react';
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

export function BarChart({ 
  labels, 
  counts, 
  title = "Attendees by Academic Rank", 
  sub = "Distribution of unique participants per Academic Rank. Demonstrates longitudinal rank-based reach capability.",
  tooltipLabel = "Total Active Attendees",
  colors = '#097C87'
}: BarDataPoint) {
  const chartRef = useRef(null);
  const router = useRouter();

  const handleChartClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!chartRef.current) return;
    const elements = getElementAtEvent(chartRef.current, event);
    if (elements.length > 0) {
      const { index } = elements[0];
      const clickedLabel = labels[index];
      // Engage Drilldown Route natively via query search param
      router.push(`/drilldown?filterLabel=${encodeURIComponent(clickedLabel)}`);
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
      <h3>{title}</h3>
      <div className={styles.sub} style={{ flexShrink: 0 }}>{sub}</div>
      <div className={styles.chartWrapper} style={{ flexGrow: 1, minHeight: '200px' }}>
        <Bar ref={chartRef} options={options as any} data={data} onClick={handleChartClick} />
      </div>
    </div>
  );
}

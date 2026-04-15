'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble } from 'react-chartjs-2';
import styles from './DashboardChart.module.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend
);

export interface BubbleDataPoint {
  x: number;
  y: number;
  r: number;
  name: string;
  dept: string;
}

interface DashboardChartProps {
  points: BubbleDataPoint[];
}

export default function DashboardChart({ points }: DashboardChartProps) {
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

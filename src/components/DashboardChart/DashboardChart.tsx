'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import styles from './DashboardChart.module.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DashboardChartProps {
  labels: string[];
  counts: number[];
}

export default function DashboardChart({ labels, counts }: DashboardChartProps) {
  const options = {
    indexAxis: 'y' as const,
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
        titleFont: { size: 12, family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const },
        bodyFont: { size: 12, family: "'Segoe UI', Arial, sans-serif" },
        padding: 10,
        cornerRadius: 4,
        displayColors: false,
      }
    },
    scales: {
      x: {
        grid: {
          color: '#d4eaec',
        },
        ticks: {
          color: '#5a8a8f',
          font: { family: "'Segoe UI', Arial, sans-serif" }
        }
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#0d2e32',
          font: { family: "'Segoe UI', Arial, sans-serif", weight: 'bold' as const }
        }
      }
    }
  };

  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: [
      {
        label: 'Total Active Attendees',
        data: counts.length ? counts : [0],
        backgroundColor: '#097C87',
        hoverBackgroundColor: '#e07a50',
        borderRadius: 3,
      },
    ],
  };

  return (
    <div className={styles.chartCard}>
      <h3>Attendees by Academic Rank</h3>
      <div className={styles.sub}>Distribution of unique participants per Academic Rank. Demonstrates longitudinal rank-based reach capability.</div>
      <div className={styles.chartWrapper}>
        <Bar options={options} data={data} />
      </div>
    </div>
  );
}

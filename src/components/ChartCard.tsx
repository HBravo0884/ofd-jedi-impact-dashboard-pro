'use client';

import { useRef, type RefObject, type ReactNode } from 'react';
import type { Chart as ChartJSInstance } from 'chart.js';
import { downloadChartPNG, downloadCSV } from '@/lib/chartExports';

export type CSVRow = Record<string, string | number | null | undefined>;

export interface ChartCardProps {
  /** Title shown in the header. Also used as the default download filename. */
  title: string;
  /** Optional one-line subtitle below the title. */
  subtitle?: string;
  /** Tooltip explaining what this chart shows. Renders as a `?` next to title. */
  helpText?: string;
  /**
   * Ref to the underlying Chart.js instance (from react-chartjs-2's
   * ref={(c) => (chartRef.current = c)} pattern).
   */
  chartRef?: RefObject<ChartJSInstance | null>;
  /** Rows for CSV export. If omitted, the CSV button is hidden. */
  csvRows?: CSVRow[];
  /** Optional custom filename (without extension). Defaults to slugified title. */
  filename?: string;
  /** The chart itself (or any chart-like content). */
  children: ReactNode;
  /** Extra class names for the outer card. */
  className?: string;
}

/**
 * Standard wrapper for every chart on the dashboard:
 * - Title + optional subtitle + optional help tooltip
 * - PNG / CSV download buttons in the top-right corner
 * - Consistent card styling so chart pages look cohesive
 */
export default function ChartCard({
  title,
  subtitle,
  helpText,
  chartRef,
  csvRows,
  filename,
  children,
  className = '',
}: ChartCardProps) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const downloadName = filename || title;

  const handlePNG = () => {
    const chart = chartRef?.current;
    const canvas = chart?.canvas ?? null;
    if (canvas) {
      downloadChartPNG(canvas, downloadName);
      return;
    }
    // Fallback: try to find a <canvas> inside the rendered children.
    const root = fallbackRef.current;
    const found = root?.querySelector('canvas') as HTMLCanvasElement | null;
    if (found) downloadChartPNG(found, downloadName);
  };

  const handleCSV = () => {
    if (csvRows && csvRows.length > 0) downloadCSV(csvRows, downloadName);
  };

  return (
    <section
      ref={fallbackRef}
      className={`chart-card ${className}`.trim()}
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid #e2e8f0',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {title}
            {helpText ? (
              <span
                title={helpText}
                aria-label={helpText}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#64748b',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '50%',
                  cursor: 'help',
                  userSelect: 'none',
                }}
              >
                ?
              </span>
            ) : null}
          </h3>
          {subtitle ? (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                color: '#64748b',
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handlePNG}
            title="Download chart as a PNG image"
            style={exportButtonStyle}
          >
            PNG
          </button>
          {csvRows && csvRows.length > 0 ? (
            <button
              type="button"
              onClick={handleCSV}
              title="Download underlying data as a CSV file"
              style={exportButtonStyle}
            >
              CSV
            </button>
          ) : null}
        </div>
      </header>
      <div className="chart-card-body">{children}</div>
    </section>
  );
}

const exportButtonStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.3,
  color: '#0f172a',
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
};

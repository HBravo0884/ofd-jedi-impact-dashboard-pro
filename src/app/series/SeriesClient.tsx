'use client';

import React, { useState, useRef } from 'react';
import { BarChart } from '@/components/DashboardChart/DashboardChart';

// Strict HTML Palette mapped array
const C1='#097C87', C2='#FCA47C', C3='#23CED9', C4='#F9D779', C5='#A1CCA6';
const PALETTE = [C1, C2, C3, C4, C5];

export default function SeriesClient({ seriesData }: { seriesData: any[] }) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  if (!seriesData || seriesData.length === 0) {
    return <div style={{ padding: '20px' }}>No Series Data Available</div>;
  }

  const activeSeries = seriesData[activeIndex];

    // Exporters are now natively handled by the DashboardChart component

  return (
    <div>
      <div className="sec">Session-by-Session Attendance</div>
      
      {/* Series Selection Tabs mapping the original HTML design */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {seriesData.map((s, idx) => (
          <button 
            key={s.id} 
            onClick={() => setActiveIndex(idx)}
            style={{
              background: activeIndex === idx ? 'var(--c1)' : '#fff',
              border: '2px solid',
              borderColor: activeIndex === idx ? 'var(--c1)' : 'var(--border)',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: activeIndex === idx ? '#fff' : 'var(--muted)',
              transition: '0.15s'
            }}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '12px' }}>
        {/* KPI Row specific to the currently selected Series */}
        <div className="kpi-row" style={{ marginBottom: '0' }}>
            <div className="kpi-card" style={{ borderLeftColor: 'var(--c1)', minWidth: '100px' }}>
              <div className="kpi-num" style={{ fontSize: '1.6rem' }}>{activeSeries.totalEvents}</div>
              <div className="kpi-label">Sessions Logged</div>
            </div>
            <div className="kpi-card" style={{ borderLeftColor: 'var(--c1)', minWidth: '100px' }}>
              <div className="kpi-num" style={{ fontSize: '1.6rem', color: 'var(--c1)' }}>{activeSeries.totalAttendances}</div>
              <div className="kpi-label">Total Attendances</div>
            </div>
        </div>

          <div className="series-chart-container" style={{ minHeight: '400px' }}>
            <BarChart 
                title={activeSeries.title}
                sub={`Highest Attended: ${activeSeries.topEventTitle} (${activeSeries.topEventHits} participants).`}
                labels={activeSeries.chartLabels}
                counts={activeSeries.chartCounts}
                tooltipLabel="Participants"
                colors={PALETTE[activeIndex % PALETTE.length]}
            />
          </div>
        </div>
    </div>
  );
}

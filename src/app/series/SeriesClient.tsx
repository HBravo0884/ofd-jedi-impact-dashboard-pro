'use client';

import React, { useState } from 'react';
import { BarChart, StackedBarChart } from '@/components/DashboardChart/DashboardChart';

const C1='#097C87', C2='#FCA47C', C3='#23CED9', C4='#F9D779', C5='#A1CCA6';
const PALETTE = [C1, C2, C3, C4, C5];

export default function SeriesClient({ seriesData, globalTimeline }: { seriesData: any[], globalTimeline: any }) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  if (!seriesData || seriesData.length === 0) {
    return <div style={{ padding: '20px' }}>No Series Data Available</div>;
  }

  const activeSeries = seriesData[activeIndex];

  const compositionDatasets = activeSeries.sessionMatrixDatasets.map((dataSet: any) => {
    const totalDeptAttendance = dataSet.data.reduce((sum: number, val: number) => sum + val, 0);
    return {
      label: dataSet.label,
      backgroundColor: dataSet.backgroundColor,
      data: [totalDeptAttendance]
    };
  });

  const individualSessionsMatrix = [
    ...activeSeries.sessionMatrixDatasets,
    {
      label: 'Series Avg',
      type: 'line' as const,
      data: activeSeries.chartLabels.map(() => activeSeries.seriesAverage),
      borderColor: '#e07a50',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 0,
      order: 0
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Series Selection Navigation */}
      <div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
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
                fontSize: '0.85rem',
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
      </div>

      {/* COMPOSITION & PENETRATION STRATEGY */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '1.1rem', color: '#0f1e2d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
            Composition &amp; Penetration Strategy
          </h2>
          <select style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 600, color: '#334155', background: '#f8fafc' }}>
            <option>By Department</option>
          </select>
        </div>

        <div className="series-comp-row">
          <div className="series-comp-sidebar">
            <h3 style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'center', marginBottom: '8px' }}>Audience Composition</h3>
            <div className="chart-h-300">
              <StackedBarChart 
                title=""
                labels={['']}
                datasets={compositionDatasets}
                indexAxis="x"
              />
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'center', marginBottom: '8px' }}>Roster Penetration (Engaged Distribution)</h3>
            <div className="chart-h-300">
              <BarChart 
                title=""
                sub=""
                indexAxis="x"
                labels={activeSeries.penetrationLabels}
                counts={activeSeries.penetrationCounts}
                colors={activeSeries.sessionMatrixDatasets.map((d:any) => d.backgroundColor)}
              />
            </div>
          </div>
        </div>
        
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Series average:</span>
          <span style={{ background: '#Fca47c', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 700 }}>
            {activeSeries.seriesAverage.toFixed(1)} / session
          </span>
        </div>
      </div>

      {/* INDIVIDUAL SESSIONS STACKED MATRIX */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#097c87', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, marginBottom: '24px' }}>
          {activeSeries.title} — Individual Sessions
        </h2>
        <div className="chart-h-450">
          <StackedBarChart 
            title=""
            labels={activeSeries.chartLabels}
            datasets={individualSessionsMatrix}
            indexAxis="x"
          />
        </div>
      </div>

      {/* ALL SESSIONS TIMELINE */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#0f1e2d', fontWeight: 700, margin: 0, marginBottom: '24px' }}>
          All Sessions — Attendance Timeline
        </h2>
        <div className="chart-h-350">
          <BarChart 
            title=""
            sub=""
            indexAxis="x"
            labels={globalTimeline.labels}
            counts={globalTimeline.counts}
            colors={globalTimeline.colors}
            xTickLimit={10}
          />
        </div>
      </div>

    </div>
  );
}

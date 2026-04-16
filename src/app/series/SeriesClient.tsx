'use client';

import React, { useState } from 'react';
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

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,Event Title,Attendances\n";
    activeSeries.chartLabels.forEach((label: string, index: number) => {
      const row = `"${label.replace(/"/g, '""')}",${activeSeries.chartCounts[index]}`;
      csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeSeries.title.replace(/\s+/g, '_')}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPNG = () => {
    // Specifically target the canvas inside the active chart
    const canvas = document.querySelector('.series-chart-container canvas') as HTMLCanvasElement;
    if (canvas) {
      const img = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.setAttribute("href", img);
      link.setAttribute("download", `${activeSeries.title.replace(/\s+/g, '_')}_graph.png`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert("Graph rendering not complete.");
    }
  };

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

        {/* The active chart with download functions */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginBottom: '8px', paddingRight: '10px' }}>
             <button 
                onClick={handleExportCSV}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px',
                  padding: '4px 10px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--c1d)', cursor: 'pointer'
                }}
             >
               ⬇ Download CSV
             </button>
             <button 
                onClick={handleExportPNG}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px',
                  padding: '4px 10px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--c1d)', cursor: 'pointer'
                }}
             >
               🖼 Export Graph
             </button>
          </div>
          
          <div className="series-chart-container" style={{ minHeight: '400px' }}>
            <BarChart 
                title={activeSeries.title}
                sub={`Highest Attended: ${activeSeries.topEventTitle} (${activeSeries.topEventHits} participants).`}
                labels={activeSeries.chartLabels}
                counts={activeSeries.chartCounts}
                tooltipLabel="Participants"
                colors={PALETTE}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

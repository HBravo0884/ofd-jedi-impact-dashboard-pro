'use client';

import React, { useState } from 'react';
import { BarChart } from '@/components/DashboardChart/DashboardChart';

// Series canonical color mapping pool based on Image 1
const COLOR_POOL = ['#A1CCA6', '#599C9F', '#579C9E', '#F9D779', '#FCA47C', '#4cdce4', '#d88bcf'];

export default function DrilldownClient({ payload }: { payload: any }) {
  const [selectedDept, setSelectedDept] = useState('All Departments');
  
  const safeIndividuals = payload.individuals || [];
  const [selectedFac, setSelectedFac] = useState(safeIndividuals.length > 0 ? safeIndividuals[0].id : '');

  const allSeriesNames = payload.seriesMatrix.map((s:any) => s.seriesName);
  const seriesColorMap: Record<string, string> = {};
  allSeriesNames.forEach((name:string, idx:number) => {
      seriesColorMap[name] = COLOR_POOL[idx % COLOR_POOL.length];
  });

  let deptLabels: string[] = [];
  let deptCounts: number[] = [];
  let deptColors: string[] = [];

  payload.seriesMatrix.forEach((matrixNode: any) => {
      let count = 0;
      if (selectedDept === 'All Departments') {
          count = Object.values(matrixNode.depts).reduce((a:any, b:any) => a + b, 0) as number;
      } else {
          count = matrixNode.depts[selectedDept] || 0;
      }
      
      if (count > 0 || selectedDept === 'All Departments') {
          deptLabels.push(matrixNode.seriesName);
          deptCounts.push(count);
          deptColors.push(seriesColorMap[matrixNode.seriesName]);
      }
  });

  let facLabels: string[] = [];
  let facCounts: number[] = [];
  let facColors: string[] = [];
  let facDisplayTitle = 'Individual Insights';

  const matchedFac = safeIndividuals.find((f:any) => f.id === selectedFac);
  if (matchedFac) facDisplayTitle = matchedFac.name;

  payload.seriesMatrix.forEach((matrixNode: any) => {
      const count = matrixNode.faculty[selectedFac] || 0;
      if (count > 0) {
          facLabels.push(matrixNode.seriesName);
          facCounts.push(count);
          facColors.push(seriesColorMap[matrixNode.seriesName]);
      }
  });

  const handleLogCSV = () => {
    let csvContent = "Date,Series,Topic,Engagements\n";
    payload.globalEventLog.forEach((row: any) => {
      csvContent += `${row.date},"${row.series.replace(/"/g, '""')}","${row.topic.replace(/"/g, '""')}",${row.count}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `meeting_log_master.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cardStyle: React.CSSProperties = {
    flex: '1 1 320px',
    minWidth: 0,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: 'clamp(14px, 3vw, 24px)',
    boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="split-row">
         
         {/* LEFT CARD */}
         <div style={cardStyle}>
            <h3 style={{ fontSize: '0.85rem', color: '#097c87', fontWeight: 800, textTransform: 'uppercase', marginBottom: '16px' }}>
               Department Impact Analysis
            </h3>
            <select 
               value={selectedDept}
               onChange={(e) => setSelectedDept(e.target.value)}
               style={{ width: '100%', maxWidth: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', color: '#334155', background: '#f8fafc', marginBottom: '24px' }}
            >
               <option value="All Departments">All Departments</option>
               {payload.departments.map((d:string) => (
                  <option key={d} value={d}>{d}</option>
               ))}
            </select>
            
            <div style={{ height: 'clamp(280px, 45vw, 350px)' }}>
               <BarChart 
                  title=""
                  labels={deptLabels}
                  counts={deptCounts}
                  colors={deptColors}
                  indexAxis="y"
               />
            </div>
         </div>

         {/* RIGHT CARD */}
         <div style={cardStyle}>
            <h3 style={{ fontSize: '0.85rem', color: '#097c87', fontWeight: 800, textTransform: 'uppercase', marginBottom: '16px' }}>
               Individual Attendee Impact Analysis
            </h3>
            <select 
               value={selectedFac}
               onChange={(e) => setSelectedFac(e.target.value)}
               style={{ width: '100%', maxWidth: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', color: '#334155', background: '#f8fafc', marginBottom: '24px' }}
            >
               {safeIndividuals.map((fac:any) => (
                  <option key={fac.id} value={fac.id}>{fac.name}</option>
               ))}
            </select>
            
            <h4 style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '1rem', color: '#64748b' }}>{facDisplayTitle}</h4>
            <div style={{ height: 'clamp(260px, 42vw, 316px)' }}>
               <BarChart 
                  title=""
                  labels={facLabels}
                  counts={facCounts}
                  colors={facColors}
                  indexAxis="y"
               />
            </div>
         </div>
         
      </div>

      {/* MEETING HISTORY LOG */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#097c87', fontWeight: 700 }}>Meeting History Log</h3>
            <button onClick={handleLogCSV} style={{ background: '#f0f7f8', border: '1px solid #d4eaec', borderRadius: '4px', padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, color: '#065e68', cursor: 'pointer' }}>CSV dataset</button>
         </div>
         <div className="table-scroll">
           <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead style={{ background: '#097c87', color: '#fff' }}>
                 <tr>
                    <th style={{ padding: '12px 24px', fontWeight: 700 }}>DATE</th>
                    <th style={{ padding: '12px 24px', fontWeight: 700 }}>SERIES</th>
                    <th style={{ padding: '12px 24px', fontWeight: 700 }}>TOPIC</th>
                    <th style={{ padding: '12px 24px', fontWeight: 700, textAlign: 'right' }}>ENGAGEMENTS</th>
                 </tr>
              </thead>
              <tbody>
                 {payload.globalEventLog.map((log:any, idx:number) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                       <td style={{ padding: '12px 24px', color: '#0f1e2d', fontWeight: 500, whiteSpace: 'nowrap' }}>{log.date}</td>
                       <td style={{ padding: '12px 24px', color: '#334155' }}>{log.series}</td>
                       <td style={{ padding: '12px 24px', color: '#0f1e2d', fontWeight: 500 }}>{log.topic}</td>
                       <td style={{ padding: '12px 24px', color: '#097c87', fontWeight: 800, textAlign: 'right', fontSize: '1rem' }}>{log.count}</td>
                    </tr>
                 ))}
              </tbody>
           </table>
         </div>
      </div>
    </div>
  );
}

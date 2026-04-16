'use client';

import React, { useState } from 'react';

export default function RosterClient({ events }: { events: any[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events.length > 0 ? events[0].id : '');

  const activeEvent = events.find(e => e.id === selectedEventId);

  const handleExportCSV = () => {
     if (!activeEvent) return;
     let csvContent = "Attendee Name,Rank,Position,Department,Total Historical Engagements\n";
     activeEvent.attendees.forEach((a:any) => {
         csvContent += `"${a.name.replace(/"/g, '""')}",${a.rank},${a.division},"${a.department}",${a.score}\n`;
     });
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const link = document.createElement("a");
     link.setAttribute("href", url);
     link.setAttribute("download", `Roster_${activeEvent.displayString.substring(0,20).replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
       
       <h3 style={{ fontSize: '0.85rem', color: '#097c87', fontWeight: 800, textTransform: 'uppercase', marginBottom: '16px' }}>
          Session Signup Sheet (Event Roster)
       </h3>

       <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px' }}>
          <select 
             value={selectedEventId}
             onChange={(e) => setSelectedEventId(e.target.value)}
             style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: '1px solid #097c87', fontSize: '0.9rem', color: '#0f1e2d', fontWeight: 600, background: '#f8fafc', outline: 'none', cursor: 'pointer' }}
          >
             {events.length === 0 && <option value="">No Events Found</option>}
             {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.displayString}</option>
             ))}
          </select>
          <button 
             onClick={handleExportCSV}
             style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: '#e0fbfe', color: '#097c87', border: '1px solid #bcebec', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
             Export Session Roster
          </button>
       </div>

       {activeEvent && activeEvent.attendees.length > 0 ? (
           <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #097c87' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                 <thead style={{ background: '#097c87', color: '#fff' }}>
                    <tr>
                       <th style={{ padding: '12px 20px', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Attendee Name</th>
                       <th style={{ padding: '12px 20px', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Rank</th>
                       <th style={{ padding: '12px 20px', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Position</th>
                       <th style={{ padding: '12px 20px', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.5px' }}>Department</th>
                       <th style={{ padding: '12px 20px', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.5px', textAlign: 'right' }}>Score</th>
                    </tr>
                 </thead>
                 <tbody>
                    {activeEvent.attendees.map((a:any, idx:number) => (
                       <tr key={a.id} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ padding: '12px 20px', color: '#097c87', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#cbd5e1', fontSize: '1.2rem' }}>✎</span>
                              {a.name}
                          </td>
                          <td style={{ padding: '12px 20px', color: '#475569' }}>{a.rank}</td>
                          <td style={{ padding: '12px 20px', color: '#475569' }}>{a.division}</td>
                          <td style={{ padding: '12px 20px', color: '#475569' }}>{a.department}</td>
                          <td style={{ padding: '12px 20px', color: '#097c87', fontWeight: 800, textAlign: 'right', fontSize: '1rem' }}>{a.score}</td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
       ) : (
           <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              No attendees verified for this specific session.
           </div>
       )}
    </div>
  );
}

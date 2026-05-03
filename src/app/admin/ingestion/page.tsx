'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';

export default function IngestionPortal() {
  const router = useRouter();
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [baseDuration, setBaseDuration] = useState('60');

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cleanedData = results.data.filter((row: any) => row['Name (Original Name)']);
        setCsvData(cleanedData);
        setIsParsing(false);
      },
      error: (err) => {
        console.error("CSV Parse Failure", err);
        setIsParsing(false);
      }
    });
  };

  const handleDeepWriteCommit = async () => {
    if (!eventTitle || !eventDate) {
      alert("Hold on! You must specify an Event Title and Date before committing this data to the cloud.");
      return;
    }
    
    setIsUploading(true);

    const formattedPayload = {
      eventTitle,
      eventDate,
      baseDuration: parseInt(baseDuration),
      attendees: csvData.map(row => ({
        name: row['Name (Original Name)'],
        email: row['User Email'],
        duration: row['Total Duration (Minutes)']
      }))
    };

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedPayload)
      });
      
      if (!response.ok) throw new Error("API Failure: " + response.statusText);
      const resData = await response.json();
      
      setUploadSuccess(`Success! ${resData.recordsVerified} strictly authenticated records mapped to event: '${resData.eventCreated}'`);
      setCsvData([]);
    } catch (error) {
      alert("Critical Error executing Deep Write. Check the engineering logs.");
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <button 
        onClick={() => router.push('/')}
        style={{ marginBottom: '20px', background: 'var(--c1)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        ← Back to Dashboard
      </button>

      <h1 className="serif-title" style={{ fontSize: '2rem', marginBottom: '8px' }}>Data Ingestion Portal</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '30px' }}>Securely upload unstructured Zoom CSV data. Data is processed locally in your browser memory before committing to Supabase.</p>

      <div style={{ background: 'var(--card)', padding: '30px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', borderTop: '5px solid var(--mix-4)' }}>
        
        <div style={{ border: '2px dashed var(--border)', padding: '40px', textAlign: 'center', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '10px' }}>Select Zoom CSV File</h3>
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileUpload} 
            style={{ display: 'block', margin: '0 auto' }}
          />
        </div>

        {isParsing && <p style={{ color: 'var(--c2d)', fontWeight: 'bold' }}>Parsing memory...</p>}

        {csvData.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: 'var(--c1d)', borderBottom: '2px solid var(--border)', paddingBottom: '10px', marginBottom: '15px' }}>
              Purgatory Sandbox Grid: Confirm {csvData.length} Extracted Rows
            </h3>

            {/* Event Binding Form */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', flexWrap: 'wrap' }}>
               <div style={{ flex: 1, minWidth: '180px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '5px' }}>Bind to Event Title</label>
                  <input type="text" placeholder="e.g. Cancer Research Seminar" value={eventTitle} onChange={e => setEventTitle(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }} />
               </div>
               <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '5px' }}>Official Date</label>
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }} />
               </div>
               <div style={{ width: '120px', flexShrink: 0 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--muted)', marginBottom: '5px' }}>Duration (min)</label>
                  <input type="number" value={baseDuration} onChange={e => setBaseDuration(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }} />
               </div>
            </div>
            
            <div style={{ overflowX: 'auto', maxHeight: '400px', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', minWidth: '480px' }}>
                <thead style={{ background: 'var(--c1d)', color: 'white', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '10px' }}>Zoom Name Evaluated</th>
                    <th style={{ padding: '10px' }}>Zoom Email Extracted</th>
                    <th style={{ padding: '10px' }}>Logged Duration (Mins)</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Database Health Check</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'white' }}>
                  {csvData.map((row, index) => {
                    const rawName = row['Name (Original Name)'] || "Unknown";
                    const durationStr = row['Total Duration (Minutes)'] || "0";
                    const email = row['User Email'] || "";

                    return (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--text)' }}>{rawName}</td>
                        <td style={{ padding: '10px', color: 'var(--muted)' }}>{email}</td>
                        <td style={{ padding: '10px' }}>{durationStr} min</td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                           <span style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: 'var(--muted)'}}>Pending DB Match</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
              {isUploading && <span style={{ color: 'var(--warm-4)', fontWeight: 'bold' }}>Executing Cloud Write...</span>}
              <button 
                onClick={handleDeepWriteCommit}
                disabled={isUploading}
                style={{ background: isUploading ? 'gray' : 'var(--c3d)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', cursor: isUploading ? 'not-allowed' : 'pointer' }}
              >
                {isUploading ? 'Locked...' : 'Validate & Commit to Supabase Database'}
              </button>
            </div>
          </div>
        )}
        
        {uploadSuccess && (
          <div style={{ marginTop: '30px', padding: '20px', background: 'var(--green-5)', color: 'white', fontWeight: 'bold', borderRadius: '8px', textAlign: 'center' }}>
            ✅ {uploadSuccess}
          </div>
        )}
      </div>

    </div>
  );
}

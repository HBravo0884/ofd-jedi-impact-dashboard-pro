'use client';

import { useState, useEffect, useRef, DragEvent } from 'react';
import Papa from 'papaparse';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ParsedRow {
  name: string;
  email: string;
  duration: string;
}
interface SeriesOption {
  id: string;
  title: string;
}

export default function IngestionPortal() {
  const router = useRouter();
  const [csvData, setCsvData] = useState<ParsedRow[]>([]);
  const [csvName, setCsvName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [baseDuration, setBaseDuration] = useState('60');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load series options on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/series');
        if (r.ok) {
          const j = await r.json();
          if (!cancelled) setSeriesOptions(j.series ?? []);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Parse a File into the preview grid ─────────────────────────────────────
  const parseFile = (file: File) => {
    setErrorMessage(null);
    setResultMessage(null);
    setCsvName(file.name);
    setIsParsing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cleaned: ParsedRow[] = (results.data as any[])
          .filter((row) => row['Name (Original Name)'] || row['Name'])
          .map((row) => ({
            name: row['Name (Original Name)'] || row['Name'] || '',
            email: row['User Email'] || row['Email'] || '',
            duration: String(
              row['Total Duration (Minutes)'] ||
                row['Duration (Minutes)'] ||
                row['Duration'] ||
                '0'
            ),
          }));
        setCsvData(cleaned);
        setIsParsing(false);
      },
      error: (err) => {
        console.error('CSV parse failure:', err);
        setErrorMessage('Could not parse the CSV. Make sure it is a Zoom-format attendance export.');
        setIsParsing(false);
      },
    });
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  };

  // ── Drag & drop handlers ───────────────────────────────────────────────────
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDraggingFile) setIsDraggingFile(true);
  };
  const handleDragLeave = () => setIsDraggingFile(false);
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setErrorMessage('Drop a .csv file. Other formats are not yet supported.');
      return;
    }
    parseFile(file);
  };

  // ── Submit to /api/ingest ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    setErrorMessage(null);
    setResultMessage(null);
    if (!eventTitle || !eventDate) {
      setErrorMessage('Event Title and Date are required before commit.');
      return;
    }
    if (csvData.length < 5) {
      setErrorMessage(
        'Ghost session filter — fewer than 5 rows. Aborting ingest to keep the dashboard clean.'
      );
      return;
    }

    setIsUploading(true);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTitle,
          eventDate,
          baseDuration: parseInt(baseDuration, 10) || 60,
          seriesId: selectedSeriesId || undefined,
          attendees: csvData,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setResultMessage(
        `✅ Wrote ${data.recordsWritten} attendance records (${data.matchedExisting} matched existing faculty, ${data.createdNew} new). Skipped ${data.recordsSkipped}.`
      );
      setCsvData([]);
      setCsvName('');
      setEventTitle('');
      setEventDate('');
    } catch (err: any) {
      setErrorMessage(`Ingest failed: ${err?.message || 'unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          marginBottom: 20,
          background: 'var(--c1)',
          color: 'white',
          textDecoration: 'none',
          padding: '8px 16px',
          borderRadius: 6,
          fontWeight: 'bold',
        }}
      >
        ← Back to Dashboard
      </Link>

      <h1 style={{ fontSize: '1.6rem', marginBottom: 6, fontFamily: '"Garamond", "EB Garamond", serif' }}>
        Manage Data — Ingestion Portal
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
        Drop a Zoom attendance CSV to commit a new event. Faculty rows are matched
        by email first, then by name; duplicates are reused, never recreated.
      </p>

      <div
        style={{
          background: 'var(--card)',
          padding: 'clamp(16px, 3vw, 30px)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          borderTop: '5px solid var(--mix-4)',
        }}
      >
        {/* ── DRAG-DROP ZONE ──────────────────────────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDraggingFile ? 'var(--c1)' : 'var(--border)'}`,
            background: isDraggingFile ? '#f0fafb' : 'transparent',
            padding: 'clamp(28px, 6vw, 56px) 24px',
            textAlign: 'center',
            borderRadius: 12,
            marginBottom: 20,
            cursor: 'pointer',
            transition: '0.15s',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>📂</div>
          <div style={{ fontWeight: 700, color: 'var(--c1d)', marginBottom: 4 }}>
            {csvName ? csvName : 'Drop a Zoom CSV here'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            …or click to browse. Expected columns:{' '}
            <code>Name (Original Name)</code>, <code>User Email</code>,{' '}
            <code>Total Duration (Minutes)</code>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFilePicked}
            style={{ display: 'none' }}
          />
        </div>

        {isParsing && (
          <p style={{ color: 'var(--c2d)', fontWeight: 'bold' }}>Parsing in browser memory…</p>
        )}
        {errorMessage && (
          <div
            style={{
              background: '#fff0f0',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            {errorMessage}
          </div>
        )}

        {csvData.length > 0 && (
          <>
            <h3
              style={{
                color: 'var(--c1d)',
                borderBottom: '2px solid var(--border)',
                paddingBottom: 10,
                marginBottom: 15,
              }}
            >
              Preview: {csvData.length} extracted attendees
            </h3>

            {/* ── EVENT BINDING FORM ──────────────────────────────────────── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 14,
                marginBottom: 20,
                background: 'var(--bg)',
                padding: 16,
                borderRadius: 8,
              }}
            >
              <div>
                <label style={labelStyle}>Event title</label>
                <input
                  type="text"
                  placeholder="e.g. Faculty Workshop — Grant Writing"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Series (optional)</label>
                <select
                  value={selectedSeriesId}
                  onChange={(e) => setSelectedSeriesId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Standalone (no series) —</option>
                  {seriesOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ maxWidth: 140 }}>
                <label style={labelStyle}>Duration (min)</label>
                <input
                  type="number"
                  value={baseDuration}
                  onChange={(e) => setBaseDuration(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* ── PREVIEW TABLE ──────────────────────────────────────────── */}
            <div className="table-scroll" style={{ maxHeight: 400, border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead style={{ background: 'var(--c1d)', color: 'white', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: 10 }}>Name</th>
                    <th style={{ padding: 10 }}>Email</th>
                    <th style={{ padding: 10 }}>Duration</th>
                  </tr>
                </thead>
                <tbody style={{ background: 'white' }}>
                  {csvData.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 10, fontWeight: 600 }}>{row.name}</td>
                      <td style={{ padding: 10, color: 'var(--muted)' }}>
                        {row.email || <em style={{ color: '#aaa' }}>(no email)</em>}
                      </td>
                      <td style={{ padding: 10 }}>{row.duration} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {isUploading && (
                <span style={{ color: 'var(--warm-4)', fontWeight: 'bold' }}>Writing to Supabase…</span>
              )}
              <button
                onClick={() => {
                  setCsvData([]);
                  setCsvName('');
                  setErrorMessage(null);
                  setResultMessage(null);
                }}
                disabled={isUploading}
                style={{ ...btnStyle, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
              >
                Clear
              </button>
              <button
                onClick={handleSubmit}
                disabled={isUploading}
                style={{ ...btnStyle, background: isUploading ? '#999' : 'var(--c3d)', color: 'white' }}
              >
                {isUploading ? 'Locked…' : 'Commit to database'}
              </button>
            </div>
          </>
        )}

        {resultMessage && (
          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: '#dcfce7',
              border: '1px solid #86efac',
              color: '#166534',
              fontWeight: 600,
              borderRadius: 8,
            }}
          >
            {resultMessage}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--muted)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  background: 'white',
};
const btnStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.9rem',
  cursor: 'pointer',
  border: 'none',
};

'use client';

import { useState, useEffect, useRef, DragEvent } from 'react';
import Papa from 'papaparse';
import Link from 'next/link';
import {
  detectFileKind,
  parseMeetingDetails,
  eventGroupToIngestPayload,
  type ParsedEventGroup,
  type DetectionResult,
} from '@/lib/zoomParser';

interface SeriesOption {
  id: string;
  title: string;
}

// What we show after attempting one /api/ingest for one event group.
interface PerGroupResult {
  key: string;
  ok: boolean;
  message: string;
  recordsWritten?: number;
  matchedExisting?: number;
  createdNew?: number;
  recordsSkipped?: number;
  eventId?: string;
}

export default function IngestionPortal() {
  // ── File state ─────────────────────────────────────────────────────────
  const [csvName, setCsvName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [groups, setGroups] = useState<ParsedEventGroup[]>([]);
  // Per-group include/exclude — keyed by group.key. Defaults: ghosts excluded.
  const [included, setIncluded] = useState<Record<string, boolean>>({});

  // ── Upload / submission state ─────────────────────────────────────────
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progressIndex, setProgressIndex] = useState<number>(0);
  const [results, setResults] = useState<PerGroupResult[]>([]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load series options on mount ──────────────────────────────────────
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

  // ── Parse a dropped file (header:false → raw arrays so we can index) ──
  const parseFile = (file: File) => {
    setErrorMessage(null);
    setDetection(null);
    setGroups([]);
    setIncluded({});
    setResults([]);
    setCsvName(file.name);
    setIsParsing(true);
    Papa.parse<string[]>(file, {
      header: false, // critical — duplicate "Duration (minutes)" columns
      skipEmptyLines: 'greedy',
      complete: (parsed) => {
        const rows = parsed.data || [];
        const det = detectFileKind(rows);
        setDetection(det);
        if (det.kind === 'zoom-meeting-details') {
          const gs = parseMeetingDetails(rows);
          setGroups(gs);
          // Default include-state: include everything that's NOT a likely ghost.
          const init: Record<string, boolean> = {};
          for (const g of gs) init[g.key] = !g.isLikelyGhost;
          setIncluded(init);
        }
        setIsParsing(false);
      },
      error: (err) => {
        console.error('CSV parse failure:', err);
        setErrorMessage('Could not parse the CSV. ' + (err?.message || ''));
        setIsParsing(false);
      },
    });
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  };
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

  // ── Selection helpers ─────────────────────────────────────────────────
  const includedKeys = Object.entries(included).filter(([, v]) => v).map(([k]) => k);
  const includedGroups = groups.filter((g) => included[g.key]);
  const totalIncludedAttendees = includedGroups.reduce((s, g) => s + g.rawRowCount, 0);
  const totalIncludedEvents = includedGroups.length;

  const setAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.key] = val;
    setIncluded(next);
  };

  // ── Submit: call /api/ingest once per included group ──────────────────
  const handleSubmit = () => {
    setErrorMessage(null);
    if (totalIncludedEvents === 0) {
      setErrorMessage('Pick at least one event group to ingest.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmedSubmit = async () => {
    setConfirmOpen(false);
    setIsUploading(true);
    setResults([]);
    setProgressIndex(0);

    const acc: PerGroupResult[] = [];
    for (let i = 0; i < includedGroups.length; i++) {
      const g = includedGroups[i];
      setProgressIndex(i + 1);
      try {
        const payload = eventGroupToIngestPayload(g, {
          seriesId: selectedSeriesId || undefined,
        });
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          acc.push({
            key: g.key,
            ok: true,
            message: `Wrote ${data.recordsWritten ?? 0} attendances · ${data.matchedExisting ?? 0} matched · ${data.createdNew ?? 0} new · ${data.recordsSkipped ?? 0} skipped`,
            recordsWritten: data.recordsWritten ?? 0,
            matchedExisting: data.matchedExisting ?? 0,
            createdNew: data.createdNew ?? 0,
            recordsSkipped: data.recordsSkipped ?? 0,
            eventId: data.eventId,
          });
        } else {
          acc.push({ key: g.key, ok: false, message: data?.error || `HTTP ${res.status}` });
        }
      } catch (err: any) {
        acc.push({ key: g.key, ok: false, message: err?.message || 'Network error' });
      }
      // Snapshot intermediate results so progress is visible mid-loop
      setResults([...acc]);
    }
    setIsUploading(false);
  };

  const reset = () => {
    setCsvName('');
    setDetection(null);
    setGroups([]);
    setIncluded({});
    setResults([]);
    setProgressIndex(0);
    setErrorMessage(null);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Link
        href="/"
        style={{
          display: 'inline-block', marginBottom: 20, background: 'var(--c1)',
          color: 'white', textDecoration: 'none', padding: '8px 16px',
          borderRadius: 6, fontWeight: 'bold',
        }}
      >
        ← Back to Dashboard
      </Link>

      <h1 style={{ fontSize: '1.6rem', marginBottom: 6, fontFamily: '"Garamond", "EB Garamond", serif' }}>
        Manage Data — Ingestion Portal
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
        Drop a Zoom monthly attendance CSV. The portal will detect the file
        type, group rows by event, and let you preview each event group before
        anything is written. Nothing is sent to the database until you click{' '}
        <strong>Confirm &amp; Ingest</strong>.
      </p>

      <div style={{
        background: 'var(--card)', padding: 'clamp(16px, 3vw, 30px)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        borderTop: '5px solid var(--mix-4)',
      }}>
        {/* ── DRAG-DROP ZONE ─────────────────────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDraggingFile ? 'var(--c1)' : 'var(--border)'}`,
            background: isDraggingFile ? '#f0fafb' : 'transparent',
            padding: 'clamp(28px, 6vw, 56px) 24px', textAlign: 'center',
            borderRadius: 12, marginBottom: 20, cursor: 'pointer', transition: '0.15s',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>📂</div>
          <div style={{ fontWeight: 700, color: 'var(--c1d)', marginBottom: 4 }}>
            {csvName ? csvName : 'Drop a Zoom monthly meeting-details CSV here'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            …or click to browse. The portal handles{' '}
            <code>meetinglistdetails_*.csv</code> (multi-event monthly exports).
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
          <p style={{ color: 'var(--c2d)', fontWeight: 'bold' }}>
            Parsing in browser memory…
          </p>
        )}
        {errorMessage && (
          <div style={{
            background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b',
            padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9rem', fontWeight: 600,
          }}>{errorMessage}</div>
        )}

        {/* ── DETECTION RESULT ───────────────────────────────────────── */}
        {detection && (
          <div style={{
            padding: '10px 14px', background: '#f0fafb',
            border: '1px solid #d4eaec', color: '#065e68',
            borderRadius: 8, marginBottom: 16, fontSize: '0.9rem',
          }}>
            <strong>File type:</strong> {detection.kind} — {detection.reason}
          </div>
        )}

        {/* ── NON-ATTENDANCE FILES — show explanation, no ingest ─────── */}
        {detection &&
          detection.kind !== 'zoom-meeting-details' &&
          detection.kind !== 'unknown' && (
          <div style={{
            padding: 16, background: '#fefce8', border: '1px solid #fde68a',
            color: '#854d0e', borderRadius: 8, marginBottom: 16,
          }}>
            This file is recognized as <strong>{detection.kind}</strong>. It is
            not an attendance file, so it will not be ingested here. To upload
            attendance, drop a Zoom monthly{' '}
            <code>meetinglistdetails_*.csv</code> instead.
            <button onClick={reset} style={{
              marginLeft: 12, background: 'transparent', border: '1px solid #854d0e',
              color: '#854d0e', borderRadius: 6, padding: '4px 10px',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
            }}>Choose a different file</button>
          </div>
        )}

        {/* ── ZOOM MEETING DETAILS — group preview ───────────────────── */}
        {detection?.kind === 'zoom-meeting-details' && groups.length > 0 && (
          <>
            <div style={{
              display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
              padding: 12, background: 'var(--bg)', borderRadius: 8, marginBottom: 14,
            }}>
              <div>
                <strong>{groups.length}</strong> event group{groups.length === 1 ? '' : 's'} detected ·{' '}
                <strong>{totalIncludedEvents}</strong> selected ·{' '}
                <strong>{totalIncludedAttendees}</strong> attendee row{totalIncludedAttendees === 1 ? '' : 's'} to ingest
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setAll(true)} style={smallBtn}>Select all</button>
                <button onClick={() => setAll(false)} style={smallBtn}>Clear</button>
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
              padding: '8px 12px', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 8,
            }}>
              <label style={labelStyle}>Default series for selected events</label>
              <select
                value={selectedSeriesId}
                onChange={(e) => setSelectedSeriesId(e.target.value)}
                style={{ ...inputStyle, maxWidth: 320 }}
              >
                <option value="">— Standalone (no series) —</option>
                {seriesOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
              {groups.map((g) => {
                const r = results.find((x) => x.key === g.key);
                const checked = !!included[g.key];
                return (
                  <div key={g.key} style={{
                    border: `1px solid ${g.isLikelyGhost ? '#fed7aa' : '#e2e8f0'}`,
                    background: g.isLikelyGhost ? '#fff7ed' : 'white',
                    borderRadius: 8, padding: 14,
                    opacity: checked ? 1 : 0.55,
                    transition: 'opacity 0.15s',
                  }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isUploading}
                        onChange={(e) => setIncluded({ ...included, [g.key]: e.target.checked })}
                        style={{ marginTop: 4 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--c1d)', fontSize: '1rem' }}>
                          {g.topic}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                          ID {g.meetingId} · {g.startTime}
                          {g.endTime ? ` → ${g.endTime}` : ''}
                          {g.startDate ? ` · ${g.startDate}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: '0.82rem' }}>
                          <span><strong>{g.rawRowCount}</strong> rows</span>
                          <span><strong>{g.uniqueParticipants}</strong> unique</span>
                          {g.missingEmailCount > 0 && (
                            <span style={{ color: '#854d0e' }}>{g.missingEmailCount} missing email</span>
                          )}
                          {g.underTenMinCount > 0 && (
                            <span style={{ color: '#854d0e' }}>{g.underTenMinCount} under 10 min</span>
                          )}
                          {g.isLikelyGhost && (
                            <span style={{
                              padding: '1px 8px', background: '#fed7aa', color: '#9a3412',
                              borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                            }}>likely ghost session</span>
                          )}
                          <span style={{ color: 'var(--muted)' }}>· meeting len: {g.meetingDuration} min</span>
                        </div>
                      </div>
                      {r && (
                        <div style={{
                          marginLeft: 8, padding: '4px 10px', borderRadius: 6,
                          fontSize: '0.78rem', fontWeight: 700,
                          background: r.ok ? '#dcfce7' : '#fee2e2',
                          color: r.ok ? '#166534' : '#991b1b',
                          maxWidth: 280,
                        }}>
                          {r.ok ? '✓ ' : '✕ '}{r.message}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              {isUploading && (
                <span style={{ color: 'var(--warm-4)', fontWeight: 'bold' }}>
                  Writing event {progressIndex} of {totalIncludedEvents}…
                </span>
              )}
              <button onClick={reset} disabled={isUploading} style={{
                ...btnStyle, background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
                Clear file
              </button>
              <button
                onClick={handleSubmit}
                disabled={isUploading || totalIncludedEvents === 0}
                style={{
                  ...btnStyle,
                  background: isUploading ? '#999' : 'var(--c3d)', color: 'white',
                }}
                title={`Send ${totalIncludedEvents} event group${totalIncludedEvents === 1 ? '' : 's'} (${totalIncludedAttendees} attendee row${totalIncludedAttendees === 1 ? '' : 's'}) to the database`}
              >
                {isUploading ? 'Sending…' : `📤 Confirm & ingest ${totalIncludedEvents} event${totalIncludedEvents === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {/* ── ROLL-UP RESULT ─────────────────────────────────────────── */}
        {results.length > 0 && !isUploading && (() => {
          const ok = results.filter((r) => r.ok).length;
          const failed = results.length - ok;
          const totalWritten = results.reduce((s, r) => s + (r.recordsWritten || 0), 0);
          return (
            <div style={{
              marginTop: 18, padding: 16, borderRadius: 10,
              background: failed === 0 ? '#dcfce7' : '#fef3c7',
              border: `1px solid ${failed === 0 ? '#86efac' : '#fcd34d'}`,
              color: failed === 0 ? '#166534' : '#854d0e',
            }}>
              <strong>
                {failed === 0
                  ? `✅ All ${ok} event${ok === 1 ? '' : 's'} ingested`
                  : `⚠️ ${ok}/${results.length} ingested · ${failed} failed`}
              </strong>{' '}
              · {totalWritten} attendance row{totalWritten === 1 ? '' : 's'} written
              <div style={{ marginTop: 8, fontSize: '0.82rem' }}>
                See per-event status above. You can verify the records in{' '}
                <a href="/drilldown" style={{ color: '#097C87', fontWeight: 700 }}>
                  Drilldown → Meeting History
                </a>{' '}
                or print the sign-in sheet from{' '}
                <a href="/admin/events" style={{ color: '#097C87', fontWeight: 700 }}>
                  Manage Events
                </a>.
              </div>
            </div>
          );
        })()}

        {/* ── PRE-COMMIT CONFIRM MODAL ───────────────────────────────── */}
        {confirmOpen && (
          <div role="dialog" aria-modal="true" style={{
            position: 'fixed', inset: 0, background: 'rgba(13, 46, 50, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}>
            <div style={{
              background: 'white', borderRadius: 12, maxWidth: 520, width: '100%',
              padding: 22, boxShadow: '0 18px 60px rgba(0,0,0,0.3)',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--c1d)' }}>Confirm ingest</h3>
              <p style={{ fontSize: '0.92rem', color: '#475569', margin: '8px 0 14px' }}>
                You're about to write <strong>{totalIncludedEvents}</strong> event{totalIncludedEvents === 1 ? '' : 's'} ·{' '}
                <strong>{totalIncludedAttendees}</strong> attendee row{totalIncludedAttendees === 1 ? '' : 's'} to Supabase.
                This is irreversible without admin SQL. Backend identity matching
                (T1 email, T2 name, T3 fuzzy alias) is unchanged.
              </p>
              <ul style={{ fontSize: '0.85rem', color: '#475569', paddingLeft: 18, margin: '0 0 14px' }}>
                <li>Each event group will create or reuse one Event row.</li>
                <li>Faculty are matched first by email, then exact name, then fuzzy alias.</li>
                <li>Rows under 10 min and rows with no name are dropped (ghost-session filter).</li>
                <li>Default series:{' '}
                  <strong>{seriesOptions.find((s) => s.id === selectedSeriesId)?.title || 'Standalone'}</strong></li>
              </ul>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setConfirmOpen(false)} style={{
                  padding: '9px 14px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
                <button onClick={handleConfirmedSubmit} style={{
                  padding: '9px 14px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                  border: 'none', background: 'var(--c1)', color: 'white',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>📤 Send to database</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)',
  marginBottom: 0, marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.4px',
  whiteSpace: 'nowrap',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: 'white',
};
const btnStyle: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6, fontWeight: 700, fontSize: '0.9rem',
  cursor: 'pointer', border: 'none',
};
const smallBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, fontWeight: 600, fontSize: '0.78rem',
  cursor: 'pointer', border: '1px solid var(--border)',
  background: 'white', color: 'var(--c1d)',
};

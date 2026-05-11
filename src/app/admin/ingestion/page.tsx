'use client';

import { useState, useEffect, useMemo, useRef, DragEvent } from 'react';
import Papa from 'papaparse';
import Link from 'next/link';
import {
  detectFileKind,
  parseMeetingDetails,
  parseDirectoryRoster,
  eventGroupToIngestPayload,
  type ParsedEventGroup,
  type DetectionResult,
  type DirectoryRow,
} from '@/lib/zoomParser';

interface SeriesOption {
  id: string;
  title: string;
}

// What we show after attempting one /api/ingest for one event group.
interface NewFacultySummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  degrees: string[];
  status: string;
  sourceName: string;
  // Filled client-side: which event group this person was first created in
  fromGroupKey?: string;
}

interface MatchAuditRow {
  sourceName: string;
  sourceEmail: string;
  sourceDuration: number;
  tier:
    | 'OVERRIDE'
    | 'T1_EMAIL'
    | 'T2_NAME'
    | 'T3_FUZZY'
    | 'T4_NEW'
    | 'SKIPPED_NO_NAME'
    | 'SKIPPED_SHORT';
  facultyId: string | null;
  facultyName: string | null;
  facultyDept: string | null;
  reason?: string;
}

interface PerGroupResult {
  key: string;
  ok: boolean;
  message: string;
  recordsWritten?: number;
  matchedExisting?: number;
  createdNew?: number;
  recordsSkipped?: number;
  eventId?: string;
  newFaculty?: NewFacultySummary[];
  // Per-row match audit, returned by /api/ingest. Ordered the same as the
  // attendees array we sent (filtered by excludedRows).
  matchAudit?: MatchAuditRow[];
  // The indices into the ORIGINAL group.attendees that were actually sent
  // (i.e. not in excludedRows). Lets us line up matchAudit[k] with the
  // attendee at originalIndices[k] when rendering the expanded card.
  sentIndices?: number[];
}

interface ExistingEvent {
  id: string;
  title: string;
  date: string;
  seriesTitle: string | null;
  attendances: number;
}

interface FacultyOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  department: string;
  division: string | null;
  status: string;
  attendances: number;
}

// Predicted-match preview — runs client-side T1 (email) and T2 (exact name)
// matching against the fetched faculty list. T3 (fuzzy / alias) and T4
// (create new) can't be predicted client-side without the full alias list,
// so we return null for those cases and show '(automatic — T3 fuzzy or T4
// new)' in the UI to be honest about the uncertainty.
function predictedFacultyMatch(
  email: string,
  displayName: string,
  options: FacultyOption[]
): { tier: 'T1' | 'T2'; faculty: FacultyOption } | null {
  // T1 — exact email match (only against non-phantom emails)
  const normEmail = email.trim().toLowerCase();
  if (normEmail) {
    const f = options.find(
      (o) => o.email && o.email.toLowerCase() === normEmail
    );
    if (f) return { tier: 'T1', faculty: f };
  }
  // T2 — exact firstName + lastName match. Use a simple split on the first
  // space; matches the backend's nameParts logic for the common case.
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0].toLowerCase();
    const last = parts.slice(1).join(' ').toLowerCase();
    const f = options.find(
      (o) =>
        o.firstName.toLowerCase() === first &&
        o.lastName.toLowerCase() === last
    );
    if (f) return { tier: 'T2', faculty: f };
  }
  return null;
}

// Format a faculty option for the datalist <option value="..."> string.
// MUST match what the user sees in the dropdown so the input round-trips.
function facultyDisplayString(f: FacultyOption): string {
  const dept = f.department.replace(/([A-Z])/g, ' $1').trim();
  const pending = f.status !== 'VERIFIED' ? ' [pending]' : '';
  return `${f.lastName}, ${f.firstName}${dept ? ' — ' + dept : ''}${pending}`;
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

  // ── New: per-row include/exclude on expanded event-group cards ────────
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // excludedRows[groupKey] = Set of attendee indices the admin wants to drop
  const [excludedRows, setExcludedRows] = useState<Record<string, Set<number>>>({});

  // ── New: duplicate-event detection — fetch existing events once ───────
  // Keyed by 'YYYY-MM-DD|topic-lowercased' so we can match parsed groups
  // against what's already in the database.
  const [existingByKey, setExistingByKey] = useState<Map<string, ExistingEvent>>(new Map());

  // ── New: dismiss state for the pending-profiles panel ─────────────────
  const [pendingPanelDismissed, setPendingPanelDismissed] = useState(false);

  // ── Directory roster import (separate flow from Zoom attendance) ──────
  const [directoryRows, setDirectoryRows] = useState<DirectoryRow[]>([]);
  const [createMissingProfiles, setCreateMissingProfiles] = useState(false);
  const [directoryImportRunning, setDirectoryImportRunning] = useState(false);
  const [directoryImportResult, setDirectoryImportResult] = useState<{
    summary: { total: number; t1Email: number; t2Name: number; t3Fuzzy: number; t4New: number; skipped: number };
    results: Array<{
      sourceName: string; tier: string; facultyId: string | null;
      facultyName: string | null; updatedFields: string[]; reason?: string;
    }>;
  } | null>(null);

  // ── Override map: admin-picked faculty for specific attendee rows ─────
  // Keyed by `${groupKey}|${rowIndex}` → facultyId. When set, the backend
  // skips T1/T2/T3/T4 and links the attendance to that faculty directly.
  const [overrideRows, setOverrideRows] = useState<Record<string, string>>({});

  // ── All faculty (fetched on mount) — populates the override dropdown ──
  const [facultyOptions, setFacultyOptions] = useState<FacultyOption[]>([]);

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
    // ── Existing events — for duplicate-detection badges ──
    (async () => {
      try {
        const r = await fetch('/api/admin/events');
        if (r.ok) {
          const j = await r.json();
          if (cancelled) return;
          const m = new Map<string, ExistingEvent>();
          for (const e of (j.events ?? []) as any[]) {
            const k = `${e.date}|${String(e.title || '').trim().toLowerCase()}`;
            m.set(k, {
              id: e.id,
              title: e.title,
              date: e.date,
              seriesTitle: e.seriesTitle || null,
              attendances: e.attendances ?? 0,
            });
          }
          setExistingByKey(m);
        }
      } catch {}
    })();
    // ── Full faculty list — for the Match-override dropdown ──
    (async () => {
      try {
        const r = await fetch('/api/admin/faculty-list');
        if (r.ok) {
          const j = await r.json();
          if (!cancelled) setFacultyOptions(j.faculty ?? []);
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
    setDirectoryRows([]);
    setDirectoryImportResult(null);
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
        } else if (det.kind === 'directory-roster') {
          const rosterRows = parseDirectoryRoster(rows);
          setDirectoryRows(rosterRows);
        }
        // Reset per-row UI state on every fresh file
        setExpandedKey(null);
        setExcludedRows({});
        setOverrideRows({});
        setPendingPanelDismissed(false);
        setDirectoryImportResult(null);
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
  const totalIncludedAttendees = includedGroups.reduce((s, g) => {
    const exc = excludedRows[g.key]?.size ?? 0;
    return s + Math.max(0, g.rawRowCount - exc);
  }, 0);
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

  // Ingest a single event group. Reused by the per-card Approve button
  // and the batch Confirm flow. Returns the PerGroupResult so callers
  // can chain (e.g. batch loop) or update local state immediately.
  const ingestOneGroup = async (g: ParsedEventGroup): Promise<PerGroupResult> => {
    try {
      // Filter out individually-excluded attendees + remember surviving indices
      const excludeSet = excludedRows[g.key];
      const survivingIndices: number[] = [];
      for (let i = 0; i < g.attendees.length; i++) {
        if (!excludeSet || !excludeSet.has(i)) survivingIndices.push(i);
      }
      const filteredGroup = {
        ...g,
        attendees: survivingIndices.map((i) => g.attendees[i]),
      };
      const payload = eventGroupToIngestPayload(filteredGroup, {
        seriesId: selectedSeriesId || undefined,
      });
      // Attach per-attendee override IDs
      payload.attendees = payload.attendees.map((a: any, idx: number) => {
        const originalIdx = survivingIndices[idx];
        const ov = overrideRows[`${g.key}|${originalIdx}`];
        return ov ? { ...a, overrideFacultyId: ov } : a;
      });
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { key: g.key, ok: false, message: data?.error || `HTTP ${res.status}` };
      }
      return {
        key: g.key,
        ok: true,
        message: `Wrote ${data.recordsWritten ?? 0} attendances · ${data.matchedExisting ?? 0} matched · ${data.createdNew ?? 0} new · ${data.recordsSkipped ?? 0} skipped`,
        recordsWritten: data.recordsWritten ?? 0,
        matchedExisting: data.matchedExisting ?? 0,
        createdNew: data.createdNew ?? 0,
        recordsSkipped: data.recordsSkipped ?? 0,
        eventId: data.eventId,
        newFaculty: Array.isArray(data.newFaculty) ? data.newFaculty : [],
        matchAudit: Array.isArray(data.matchAudit) ? data.matchAudit : [],
        sentIndices: survivingIndices,
      };
    } catch (err: any) {
      return { key: g.key, ok: false, message: err?.message || 'Network error' };
    }
  };

  // Track which single event is currently being ingested via its Approve
  // button (so its button can show "Approving…" without freezing the whole
  // page like the batch Confirm does).
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  const approveOne = async (g: ParsedEventGroup) => {
    setApprovingKey(g.key);
    const r = await ingestOneGroup(g);
    // Merge into results (replace if already exists)
    setResults((prev) => {
      const i = prev.findIndex((x) => x.key === g.key);
      if (i >= 0) {
        const next = [...prev];
        next[i] = r;
        return next;
      }
      return [...prev, r];
    });
    setApprovingKey(null);
  };

  const handleConfirmedSubmit = async () => {
    setConfirmOpen(false);
    setIsUploading(true);
    // Only ingest events that haven't already been ingested successfully via
    // an individual Approve click. So Confirm becomes "Approve all remaining".
    const alreadyOk = new Set(results.filter((r) => r.ok).map((r) => r.key));
    const remaining = includedGroups.filter((g) => !alreadyOk.has(g.key));
    setProgressIndex(0);

    const acc: PerGroupResult[] = [...results];
    for (let i = 0; i < remaining.length; i++) {
      const g = remaining[i];
      setProgressIndex(i + 1);
      const r = await ingestOneGroup(g);
      // Replace existing entry for this key (e.g. from a previous failed
      // attempt) or append.
      const idx = acc.findIndex((x) => x.key === g.key);
      if (idx >= 0) acc[idx] = r;
      else acc.push(r);
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
    setExpandedKey(null);
    setExcludedRows({});
    setOverrideRows({});
    setPendingPanelDismissed(false);
    setDirectoryRows([]);
    setDirectoryImportResult(null);
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

        {/* ── DIRECTORY ROSTER — preview + import flow ────────────────── */}
        {detection?.kind === 'directory-roster' && directoryRows.length > 0 && !directoryImportResult && (
          <DirectoryRosterPreview
            rows={directoryRows}
            createMissing={createMissingProfiles}
            onToggleCreateMissing={setCreateMissingProfiles}
            isRunning={directoryImportRunning}
            onCancel={reset}
            onImport={async () => {
              setDirectoryImportRunning(true);
              setErrorMessage(null);
              try {
                const res = await fetch('/api/admin/directory-import', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    rows: directoryRows,
                    createMissing: createMissingProfiles,
                  }),
                });
                const j = await res.json();
                if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
                setDirectoryImportResult(j);
              } catch (err: any) {
                setErrorMessage(err?.message || 'Directory import failed.');
              } finally {
                setDirectoryImportRunning(false);
              }
            }}
          />
        )}

        {/* ── DIRECTORY ROSTER — post-import results ──────────────────── */}
        {directoryImportResult && (
          <DirectoryImportResultPanel
            result={directoryImportResult}
            onClose={reset}
          />
        )}

        {/* ── OTHER NON-ATTENDANCE FILES — show explanation, no ingest ─ */}
        {detection &&
          detection.kind !== 'zoom-meeting-details' &&
          detection.kind !== 'directory-roster' &&
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
                const isExpanded = expandedKey === g.key;
                const excluded = excludedRows[g.key] || new Set<number>();
                const includedRowCount = g.attendees.length - excluded.size;
                // Duplicate detection: same date + same title (case-insensitive)
                const dupKey = `${g.startDate}|${(g.topic || '').trim().toLowerCase()}`;
                const dup = g.startDate ? existingByKey.get(dupKey) : undefined;
                return (
                  <div key={g.key} style={{
                    border: r && r.ok
                      ? '2px solid #86efac'
                      : `1px solid ${g.isLikelyGhost ? '#fed7aa' : '#e2e8f0'}`,
                    background: r && r.ok
                      ? '#f0fdf4'
                      : (g.isLikelyGhost ? '#fff7ed' : 'white'),
                    borderRadius: 8, padding: 14,
                    opacity: checked ? 1 : 0.55,
                    transition: 'opacity 0.15s, border-color 0.2s, background 0.2s',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 700, color: 'var(--c1d)', fontSize: '1rem' }}>
                            {g.topic}
                          </div>
                          {dup && (
                            <span
                              title={`This event already exists in the database (${dup.attendances} attendances on file). Re-ingesting is safe — the database uses idempotent upserts so no duplicate event or duplicate attendance will be created.`}
                              style={{
                                padding: '1px 8px', background: '#fde68a', color: '#854d0e',
                                borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
                              }}
                            >
                              ⓘ already in DB — safe to re-ingest
                            </span>
                          )}
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
                          {excluded.size > 0 && (
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>
                              {excluded.size} excluded by you ({includedRowCount} will ingest)
                            </span>
                          )}
                          {g.isLikelyGhost && (
                            <span style={{
                              padding: '1px 8px', background: '#fed7aa', color: '#9a3412',
                              borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                            }}>likely ghost session</span>
                          )}
                          <span style={{ color: 'var(--muted)' }}>· meeting len: {g.meetingDuration} min</span>
                        </div>
                        <button
                          onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                          disabled={isUploading}
                          style={{
                            marginTop: 8, padding: '3px 10px', background: 'transparent',
                            border: '1px solid var(--border)', borderRadius: 6,
                            color: 'var(--c1d)', cursor: 'pointer', fontSize: '0.78rem',
                            fontWeight: 600,
                          }}
                          title="Show every attendee row in this event and individually include or exclude any of them"
                        >
                          {isExpanded ? 'Hide details ▲' : `Show ${g.attendees.length} attendee${g.attendees.length === 1 ? '' : 's'} ▼`}
                        </button>
                      </div>
                      {(() => {
                        const alreadyIngested = !!(r && r.ok);
                        const isApprovingNow = approvingKey === g.key;
                        return (
                          <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            <button
                              onClick={() => approveOne(g)}
                              disabled={
                                isUploading ||
                                isApprovingNow ||
                                alreadyIngested ||
                                !checked
                              }
                              title={
                                alreadyIngested
                                  ? 'Already approved & ingested. Drop a fresh file to redo.'
                                  : !checked
                                  ? 'Tick the box first to include this event.'
                                  : 'Approve & ingest this single event right now (with any overrides/exclusions you set). Skip events you are not ready for.'
                              }
                              style={{
                                padding: '5px 12px', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem',
                                cursor: alreadyIngested || isUploading || isApprovingNow || !checked ? 'not-allowed' : 'pointer',
                                border: alreadyIngested ? '1px solid #86efac' : '1px solid var(--c3d)',
                                background: alreadyIngested ? '#dcfce7' : isApprovingNow ? '#999' : 'var(--c3d)',
                                color: alreadyIngested ? '#166534' : 'white',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {alreadyIngested
                                ? '✓ Approved'
                                : isApprovingNow
                                ? 'Approving…'
                                : '✓ Approve this event'}
                            </button>
                            {r && (
                              <div style={{
                                padding: '4px 10px', borderRadius: 6,
                                fontSize: '0.78rem', fontWeight: 700,
                                background: r.ok ? '#dcfce7' : '#fee2e2',
                                color: r.ok ? '#166534' : '#991b1b',
                                maxWidth: 280, textAlign: 'right',
                              }}>
                                {r.ok ? '✓ ' : '✕ '}{r.message}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* ── Expanded per-attendee table ──────────────────── */}
                    {isExpanded && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap',
                        }}>
                          <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                            Tick the box for each row to <strong>exclude</strong> it
                            from this event's ingest. Under-10-min rows are highlighted
                            since the backend would auto-drop them anyway.
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => {
                                const next = { ...excludedRows };
                                next[g.key] = new Set(g.attendees.map((_, i) => i));
                                setExcludedRows(next);
                              }}
                              disabled={isUploading}
                              style={smallBtn}
                            >
                              Exclude all
                            </button>
                            <button
                              onClick={() => {
                                const next = { ...excludedRows };
                                delete next[g.key];
                                setExcludedRows(next);
                              }}
                              disabled={isUploading}
                              style={smallBtn}
                            >
                              Include all
                            </button>
                            <button
                              onClick={() => {
                                const next = { ...excludedRows };
                                const s = new Set<number>();
                                for (let i = 0; i < g.attendees.length; i++) {
                                  if (g.attendees[i].duration < 10) s.add(i);
                                }
                                if (s.size === 0) delete next[g.key]; else next[g.key] = s;
                                setExcludedRows(next);
                              }}
                              disabled={isUploading}
                              style={smallBtn}
                              title="Auto-exclude every row whose duration is under 10 minutes"
                            >
                              Exclude under-10-min
                            </button>
                          </div>
                        </div>
                        <div style={{
                          maxHeight: 360, overflowY: 'auto',
                          background: '#fafcfc', borderRadius: 6, border: '1px solid var(--border)',
                        }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                              <tr>
                                <th style={th3}><span title="Tick to exclude">✕</span></th>
                                <th style={th3}>#</th>
                                <th style={th3}>Name (raw)</th>
                                <th style={th3}>Email</th>
                                <th style={th3}>Duration</th>
                                <th style={th3} title="Pick a directory profile to force this row to link to that person.">Match override</th>
                                <th style={th3}>Matched to</th>
                                <th style={th3}>Tier</th>
                                <th style={th3}>Join</th>
                                <th style={th3}>Leave</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.attendees.map((a, i) => {
                                const isExcluded = excluded.has(i);
                                const isShort = a.duration < 10;
                                const missingEmail = !a.email;
                                // Look up the match audit row for this attendee, if any.
                                let m: MatchAuditRow | null = null;
                                if (r && r.matchAudit && r.sentIndices) {
                                  const pos = r.sentIndices.indexOf(i);
                                  if (pos >= 0 && r.matchAudit[pos]) m = r.matchAudit[pos];
                                }
                                const tierLabel = m
                                  ? ({
                                      OVERRIDE: { lbl: 'override', bg: '#fde68a', fg: '#854d0e' },
                                      T1_EMAIL: { lbl: 'T1 email', bg: '#dcfce7', fg: '#166534' },
                                      T2_NAME:  { lbl: 'T2 name',  bg: '#dbeafe', fg: '#1e40af' },
                                      T3_FUZZY: { lbl: 'T3 fuzzy', bg: '#ede9fe', fg: '#5b21b6' },
                                      T4_NEW:   { lbl: 'T4 new',   bg: '#fef3c7', fg: '#92400e' },
                                      SKIPPED_NO_NAME: { lbl: 'skipped', bg: '#f1f5f9', fg: '#64748b' },
                                      SKIPPED_SHORT:   { lbl: 'skipped', bg: '#f1f5f9', fg: '#64748b' },
                                    }[m.tier])
                                  : null;
                                return (
                                      <tr key={i} style={{
                                        borderTop: '1px solid var(--border)',
                                        background: isExcluded ? '#fef2f2' : (isShort ? '#fefce8' : 'transparent'),
                                        opacity: isExcluded ? 0.55 : 1,
                                        textDecoration: isExcluded ? 'line-through' : 'none',
                                      }}>
                                        <td style={td3}>
                                          <input
                                            type="checkbox"
                                            checked={isExcluded}
                                            disabled={isUploading}
                                            onChange={(e) => {
                                              const next = { ...excludedRows };
                                              const cur = new Set(next[g.key] || []);
                                              if (e.target.checked) cur.add(i); else cur.delete(i);
                                              if (cur.size === 0) delete next[g.key]; else next[g.key] = cur;
                                              setExcludedRows(next);
                                            }}
                                          />
                                        </td>
                                        <td style={{ ...td3, color: '#94a3b8' }}>{i + 1}</td>
                                        <td style={{ ...td3, fontWeight: 600 }}>
                                          {a.displayName}
                                          {a.joinCount > 1 && (
                                            <span
                                              title={`Consolidated from ${a.joinCount} raw rows: ${a.rawNames}`}
                                              style={{
                                                marginLeft: 6, padding: '1px 6px',
                                                background: '#dbeafe', color: '#1e40af',
                                                borderRadius: 999, fontSize: '0.65rem',
                                                fontWeight: 700,
                                              }}
                                            >
                                              joined {a.joinCount}×
                                            </span>
                                          )}
                                          {a.rawNames !== a.displayName && a.joinCount === 1 && a.rawName !== a.displayName && (
                                            <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4, fontSize: '0.72rem' }}>
                                              ({a.rawName})
                                            </span>
                                          )}
                                        </td>
                                        <td style={td3}>
                                          {missingEmail
                                            ? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(none)</span>
                                            : a.email}
                                        </td>
                                        <td style={{
                                          ...td3, fontWeight: 700,
                                          color: isShort ? '#92400e' : '#0d2e32',
                                          textAlign: 'right',
                                        }}>
                                          {a.duration} min
                                        </td>
                                        <td style={td3}>
                                          <MatchOverrideAutocomplete
                                            attendee={a}
                                            groupKey={g.key}
                                            rowIndex={i}
                                            facultyOptions={facultyOptions}
                                            currentOverrideId={overrideRows[`${g.key}|${i}`] || ''}
                                            disabled={isUploading || isExcluded}
                                            onChange={(facultyId) => {
                                              const next = { ...overrideRows };
                                              const k = `${g.key}|${i}`;
                                              if (facultyId) next[k] = facultyId;
                                              else delete next[k];
                                              setOverrideRows(next);
                                            }}
                                          />
                                        </td>
                                        <td style={td3}>
                                          {isExcluded ? (
                                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                              excluded by you
                                            </span>
                                          ) : m && m.facultyName ? (
                                            <span>
                                              <strong>{m.facultyName}</strong>
                                              {m.facultyDept && (
                                                <span style={{ color: '#64748b', marginLeft: 4 }}>
                                                  · {m.facultyDept.replace(/([A-Z])/g, ' $1').trim()}
                                                </span>
                                              )}
                                            </span>
                                          ) : m ? (
                                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                              {m.reason || '—'}
                                            </span>
                                          ) : (
                                            <span style={{ color: '#cbd5e1' }}>—</span>
                                          )}
                                        </td>
                                        <td style={td3}>
                                          {tierLabel ? (
                                            <span
                                              title={m?.reason || ''}
                                              style={{
                                                padding: '1px 8px', borderRadius: 999,
                                                background: tierLabel.bg, color: tierLabel.fg,
                                                fontSize: '0.7rem', fontWeight: 700,
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              {tierLabel.lbl}
                                            </span>
                                          ) : (
                                            <span style={{ color: '#cbd5e1' }}>—</span>
                                          )}
                                        </td>
                                        <td style={{ ...td3, color: '#64748b', fontSize: '0.75rem' }}>{a.joinTime}</td>
                                        <td style={{ ...td3, color: '#64748b', fontSize: '0.75rem' }}>{a.leaveTime}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
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
              {(() => {
                const okKeys = new Set(results.filter((x) => x.ok).map((x) => x.key));
                const remaining = includedGroups.filter((g) => !okKeys.has(g.key)).length;
                return (
                  <button
                    onClick={handleSubmit}
                    disabled={isUploading || remaining === 0}
                    style={{
                      ...btnStyle,
                      background: isUploading || remaining === 0 ? '#999' : 'var(--c3d)', color: 'white',
                    }}
                    title={remaining === 0
                      ? 'All selected events have already been approved individually. Drop a new file to ingest more.'
                      : `Approve every event still pending. You can also approve them one at a time using the per-card buttons above.`}
                  >
                    {isUploading
                      ? `Approving event ${progressIndex} of ${remaining}…`
                      : remaining === 0
                      ? '✓ All selected events approved'
                      : `📤 Approve all remaining (${remaining})`}
                  </button>
                );
              })()}
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

        {/* ── NEWLY-CREATED PENDING PROFILES ─────────────────────────── */}
        {!isUploading && results.length > 0 && (() => {
          // Flatten newFaculty across all groups + tag with source group key
          const allNew: NewFacultySummary[] = [];
          for (const r of results) {
            if (r.ok && r.newFaculty) {
              for (const n of r.newFaculty) {
                allNew.push({ ...n, fromGroupKey: r.key });
              }
            }
          }
          if (allNew.length === 0) return null;
          if (pendingPanelDismissed) return null;
          return (
            <NewPendingProfilesPanel
              rows={allNew}
              groups={groups}
              onDismiss={() => setPendingPanelDismissed(true)}
            />
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

// ───────────────────────────────────────────────────────────────────────
// NewPendingProfilesPanel
// Lists every Faculty row the backend auto-created during this ingest, so
// admins can eyeball "who got auto-pending and might need to be merged
// into an existing profile". Provides CSV export so the list can be
// reviewed offline. Full merge UI comes in PR #19 (quarantine adjudication).
// ───────────────────────────────────────────────────────────────────────
function NewPendingProfilesPanel({
  rows,
  groups,
  onDismiss,
}: {
  rows: NewFacultySummary[];
  groups: ParsedEventGroup[];
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const groupTitleByKey = new Map(groups.map((g) => [g.key, g.topic]));

  const downloadCSV = () => {
    const escape = (v: string) =>
      /[,\"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const header = ['Name', 'Email', 'Department', 'Degrees', 'Source name (raw)', 'Event'].join(',');
    const lines = rows.map((r) =>
      [
        escape(`${r.firstName} ${r.lastName}`),
        escape(r.email),
        escape(r.department),
        escape(r.degrees.join('; ')),
        escape(r.sourceName),
        escape(groupTitleByKey.get(r.fromGroupKey || '') || ''),
      ].join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `new_pending_profiles_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div style={{
      marginTop: 12, padding: 14, borderRadius: 10,
      background: '#fffbeb', border: '1px solid #fcd34d',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ color: '#854d0e', fontWeight: 700, fontSize: '0.95rem' }}>
          ⚠️ {rows.length} new pending profile{rows.length === 1 ? '' : 's'} created
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={downloadCSV}
            style={{
              padding: '5px 12px', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem',
              cursor: 'pointer', border: '1px solid #fcd34d',
              background: 'white', color: '#854d0e',
            }}
            title="Download this list as a CSV so you can review it offline"
          >
            Download CSV
          </button>
          <button
            onClick={() => setOpen(!open)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontWeight: 600, fontSize: '0.8rem',
              cursor: 'pointer', border: '1px solid #fcd34d',
              background: 'white', color: '#854d0e',
            }}
          >
            {open ? 'Hide' : 'Show'} list
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              title="Dismiss this panel for the rest of the session"
              style={{
                padding: '5px 10px', borderRadius: 6, fontWeight: 700, fontSize: '0.9rem',
                cursor: 'pointer', border: '1px solid #fcd34d',
                background: 'white', color: '#854d0e',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: '0.82rem', color: '#854d0e' }}>
        These are people Zoom recorded under a name that didn't match any
        existing faculty record. Their attendance IS saved — but each profile
        is flagged as <code>PENDING_RESOLUTION</code> and may need to be
        merged into an existing faculty row. Full merge tooling is coming in
        PR #19 (Quarantine Adjudication).
      </div>

      {open && (
        <div style={{
          marginTop: 12, maxHeight: 360, overflowY: 'auto',
          background: 'white', borderRadius: 8, border: '1px solid #fde68a',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead style={{ background: '#fef3c7', position: 'sticky', top: 0 }}>
              <tr>
                <th style={th2}>Name</th>
                <th style={th2}>Email</th>
                <th style={th2}>Department</th>
                <th style={th2}>Degrees</th>
                <th style={th2}>Source name</th>
                <th style={th2}>Event</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #fef3c7' }}>
                  <td style={td2}>
                    <strong>{r.lastName}, {r.firstName}</strong>
                  </td>
                  <td style={td2}>
                    {r.email.startsWith('phantom_')
                      ? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(none on file)</span>
                      : r.email}
                  </td>
                  <td style={td2}>{r.department}</td>
                  <td style={td2}>{r.degrees.join(', ') || '—'}</td>
                  <td style={td2}>{r.sourceName}</td>
                  <td style={td2}>{groupTitleByKey.get(r.fromGroupKey || '') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th2: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left',
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.4px',
  color: '#854d0e', fontWeight: 700, whiteSpace: 'nowrap',
};
const td2: React.CSSProperties = {
  padding: '6px 10px', color: '#0d2e32', verticalAlign: 'top',
};

// Per-row attendee table inside the expanded event-group card
const th3: React.CSSProperties = {
  padding: '5px 8px', textAlign: 'left',
  fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.4px',
  color: '#475569', fontWeight: 700, whiteSpace: 'nowrap',
};
const td3: React.CSSProperties = {
  padding: '5px 8px', color: '#0d2e32', verticalAlign: 'top',
};

// ─────────────────────────────────────────────────────────────────────────
// DirectoryRosterPreview — preview rows from a faculty-directory CSV and
// trigger the import (admin update of profile fields, not attendance).
// ─────────────────────────────────────────────────────────────────────────
function DirectoryRosterPreview({
  rows,
  createMissing,
  onToggleCreateMissing,
  isRunning,
  onImport,
  onCancel,
}: {
  rows: DirectoryRow[];
  createMissing: boolean;
  onToggleCreateMissing: (v: boolean) => void;
  isRunning: boolean;
  onImport: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        padding: '10px 14px', background: '#ecfdf5',
        border: '1px solid #6ee7b7', color: '#065f46',
        borderRadius: 8, marginBottom: 12,
      }}>
        <strong>Faculty directory roster detected.</strong>{' '}
        {rows.length} row{rows.length === 1 ? '' : 's'} ready to update profile
        fields (email, title, position, division, rank, degrees). Attendance
        records are NOT created from this file.
      </div>

      <div style={{
        display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 10, padding: '10px 12px', background: '#f8fafc',
        border: '1px solid #e2e8f0', borderRadius: 8,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.88rem' }}>
          <input type="checkbox" checked={createMissing}
                 onChange={(e) => onToggleCreateMissing(e.target.checked)} />
          Create new faculty for unmatched rows
          <span style={{ color: '#64748b', fontSize: '0.78rem', marginLeft: 4 }}>
            (otherwise unmatched rows are skipped)
          </span>
        </label>
      </div>

      <div style={{
        maxHeight: 400, overflowY: 'auto',
        border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
            <tr>
              <th style={th3}>#</th>
              <th style={th3}>Name</th>
              <th style={th3}>Email</th>
              <th style={th3}>Dept</th>
              <th style={th3}>Division</th>
              <th style={th3}>Rank</th>
              <th style={th3}>Degree</th>
              <th style={th3}>Position</th>
              <th style={th3}>Title</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td3, color: '#94a3b8' }}>{i + 1}</td>
                <td style={{ ...td3, fontWeight: 600 }}>{r.name}</td>
                <td style={td3}>{r.email || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={td3}>{r.dept}</td>
                <td style={td3}>{r.division || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={td3}>{r.rank || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={td3}>{r.degree || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={td3}>{r.pos || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={td3}>{r.adminTitle || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={isRunning} style={{
          padding: '9px 14px', background: 'transparent', color: 'var(--muted)',
          border: '1px solid var(--border)', borderRadius: 6, fontWeight: 700, fontSize: '0.88rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
        <button onClick={() => onImport()} disabled={isRunning} style={{
          padding: '9px 14px', background: isRunning ? '#999' : '#059669', color: 'white',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.88rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {isRunning ? 'Importing…' : `📋 Import ${rows.length} row${rows.length === 1 ? '' : 's'} to directory`}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DirectoryImportResultPanel — shows per-row outcome of the import.
// ─────────────────────────────────────────────────────────────────────────
function DirectoryImportResultPanel({
  result,
  onClose,
}: {
  result: {
    summary: { total: number; t1Email: number; t2Name: number; t3Fuzzy: number; t4New: number; skipped: number };
    results: Array<{ sourceName: string; tier: string; facultyId: string | null; facultyName: string | null; updatedFields: string[]; reason?: string }>;
  };
  onClose: () => void;
}) {
  const s = result.summary;
  return (
    <div style={{
      marginTop: 14, padding: 14, background: '#f0fdf4',
      border: '1px solid #86efac', borderRadius: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ color: '#166534', fontWeight: 700, fontSize: '1rem' }}>
          ✅ Directory import complete · {s.total} row{s.total === 1 ? '' : 's'}
        </div>
        <button onClick={onClose} style={{
          padding: '5px 12px', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem',
          cursor: 'pointer', border: '1px solid #86efac', background: 'white', color: '#166534',
        }}>Done</button>
      </div>
      <div style={{
        marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap',
        fontSize: '0.85rem', color: '#0d2e32',
      }}>
        <span><strong>{s.t1Email}</strong> by email</span>
        <span><strong>{s.t2Name}</strong> by name</span>
        <span><strong>{s.t3Fuzzy}</strong> fuzzy</span>
        <span><strong>{s.t4New}</strong> new</span>
        <span><strong>{s.skipped}</strong> skipped</span>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#166534', fontSize: '0.85rem' }}>
          Per-row outcomes
        </summary>
        <div style={{
          marginTop: 8, maxHeight: 320, overflowY: 'auto',
          background: 'white', borderRadius: 6, border: '1px solid #d1fae5',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead style={{ background: '#ecfdf5', position: 'sticky', top: 0 }}>
              <tr>
                <th style={th3}>Source name</th>
                <th style={th3}>Resolved to</th>
                <th style={th3}>Tier</th>
                <th style={th3}>Fields updated</th>
                <th style={th3}>Note</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid #d1fae5' }}>
                  <td style={{ ...td3, fontWeight: 600 }}>{r.sourceName}</td>
                  <td style={td3}>{r.facultyName || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  <td style={td3}>
                    <span style={{
                      padding: '1px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
                      background:
                        r.tier === 'T1_EMAIL' ? '#dcfce7' :
                        r.tier === 'T2_NAME'  ? '#dbeafe' :
                        r.tier === 'T3_FUZZY' ? '#ede9fe' :
                        r.tier === 'T4_NEW'   ? '#fef3c7' : '#f1f5f9',
                      color:
                        r.tier === 'T1_EMAIL' ? '#166534' :
                        r.tier === 'T2_NAME'  ? '#1e40af' :
                        r.tier === 'T3_FUZZY' ? '#5b21b6' :
                        r.tier === 'T4_NEW'   ? '#92400e' : '#64748b',
                    }}>{r.tier.replace('_', ' ').toLowerCase()}</span>
                  </td>
                  <td style={{ ...td3, color: '#475569' }}>{r.updatedFields.join(', ') || '—'}</td>
                  <td style={{ ...td3, color: '#94a3b8', fontSize: '0.72rem' }}>{r.reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────
// MatchOverrideAutocomplete
// Text input + <datalist> for picking a faculty by typing. Shows the
// system's predicted T1/T2 match underneath so the admin can verify
// without having to override blindly.
// ─────────────────────────────────────────────────────────────────────────
function MatchOverrideAutocomplete({
  attendee,
  groupKey,
  rowIndex,
  facultyOptions,
  currentOverrideId,
  disabled,
  onChange,
}: {
  attendee: { rawName: string; displayName: string; email: string };
  groupKey: string;
  rowIndex: number;
  facultyOptions: FacultyOption[];
  currentOverrideId: string;
  disabled: boolean;
  onChange: (facultyId: string) => void;
}) {
  // Build the displayString → facultyId map once
  const displayToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of facultyOptions) m.set(facultyDisplayString(f), f.id);
    return m;
  }, [facultyOptions]);

  const idToFaculty = useMemo(() => {
    const m = new Map<string, FacultyOption>();
    for (const f of facultyOptions) m.set(f.id, f);
    return m;
  }, [facultyOptions]);

  const predicted = useMemo(
    () => predictedFacultyMatch(attendee.email, attendee.displayName, facultyOptions),
    [attendee.email, attendee.displayName, facultyOptions]
  );

  const currentFaculty = currentOverrideId ? idToFaculty.get(currentOverrideId) : null;
  const [text, setText] = useState<string>(
    currentFaculty ? facultyDisplayString(currentFaculty) : ''
  );

  // Keep input in sync if the override changes from elsewhere (e.g., reset)
  useEffect(() => {
    const f = currentOverrideId ? idToFaculty.get(currentOverrideId) : null;
    setText(f ? facultyDisplayString(f) : '');
  }, [currentOverrideId, idToFaculty]);

  const listId = `faculty-list-${groupKey}-${rowIndex}`;

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="text"
          list={listId}
          value={text}
          disabled={disabled}
          placeholder={predicted ? '(auto — see below)' : 'Type a name…'}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            const id = displayToId.get(v);
            if (id) onChange(id);            // exact match → set override
            else if (!v) onChange('');       // cleared → remove override
            // otherwise: typed but no exact match yet → don't fire onChange
          }}
          style={{
            flex: 1, minWidth: 0, maxWidth: 240,
            fontSize: '0.75rem', padding: '3px 6px',
            borderRadius: 4, border: '1px solid var(--border)',
            background: currentOverrideId ? '#fef3c7' : 'white',
          }}
          title={
            currentOverrideId
              ? `Override active. Attendance for this row will be credited to ${currentFaculty ? facultyDisplayString(currentFaculty) : currentOverrideId}.`
              : 'Type a directory name. Pick from the dropdown to override the automatic match.'
          }
        />
        {currentOverrideId && !disabled && (
          <button
            onClick={() => { setText(''); onChange(''); }}
            title="Clear override (return to automatic matching)"
            style={{
              background: 'transparent', border: 'none', color: '#854d0e',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', padding: '0 4px',
            }}
          >
            ✕
          </button>
        )}
        <datalist id={listId}>
          {facultyOptions.map((f) => (
            <option key={f.id} value={facultyDisplayString(f)} />
          ))}
        </datalist>
      </div>
      {/* Predicted-match preview, when no override is set */}
      {!currentOverrideId && (
        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2, lineHeight: 1.3 }}>
          {predicted ? (
            <span>
              auto → <strong>{predicted.faculty.lastName}, {predicted.faculty.firstName}</strong>
              {' '}<span style={{ color: '#94a3b8' }}>({predicted.tier} {predicted.tier === 'T1' ? 'email' : 'name'})</span>
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
              auto → T3 fuzzy or T4 new (can't preview)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

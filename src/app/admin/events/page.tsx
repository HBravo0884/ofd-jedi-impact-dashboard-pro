'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface SeriesOption { id: string; title: string; }
interface EventRow {
  id: string;
  title: string;
  topic: string | null;
  date: string;
  baseDuration: number;
  seriesId: string | null;
  seriesTitle: string | null;
  attendances: number;
  hiddenFromKiosk: boolean;
  learningObjectives?: string[];
  disclosureReport?: string | null;
  planningCommittee?: string | null;
  acknowledgmentOfSupport?: string | null;
  eventTime?: string | null;
  location?: string | null;
  isGrandRounds?: boolean;
}
interface Template {
  mostCommonDuration: number;
  lastTitle: string;
  lastTopic: string;
  sampleTitles: string[];
  pastCount: number;
}

type SortKey = 'date' | 'series' | 'title' | 'attendances';

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function ManageEventsPage() {
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Search / sort / filter
  const [q, setQ] = useState('');
  const [seriesFilter, setSeriesFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Create-form state
  const [seriesId, setSeriesId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(todayISO());
  const [baseDuration, setBaseDuration] = useState('60');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [isGrandRounds, setIsGrandRounds] = useState(false);
  const [learningObjectives, setLearningObjectives] = useState<string[]>(['', '', '', '', '']);
  const [disclosureReport, setDisclosureReport] = useState('');
  const [planningCommittee, setPlanningCommittee] = useState('');
  const [acknowledgmentOfSupport, setAcknowledgmentOfSupport] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCmeFields, setShowCmeFields] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Merge modal
  const [merging, setMerging] = useState<EventRow | null>(null);
  const [mergeTargetQ, setMergeTargetQ] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergingNow, setMergingNow] = useState(false);

  // Template autopopulation
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // Feedback
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [seriesR, eventsR] = await Promise.all([
        fetch('/api/admin/series'),
        fetch('/api/admin/events'),
      ]);
      if (seriesR.ok) setSeriesOptions((await seriesR.json()).series || []);
      if (eventsR.ok) setEvents((await eventsR.json()).events || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  useEffect(() => {
    setTemplate(null);
    setAutoFilled(false);
    if (!seriesId) return;
    setTemplateLoading(true);
    (async () => {
      try {
        const r = await fetch('/api/admin/event-template?seriesId=' + encodeURIComponent(seriesId));
        if (!r.ok) return;
        const j = await r.json();
        if (j.template) {
          setTemplate(j.template);
          if (!title) setTitle(j.template.lastTitle);
          if (!topic) setTopic(j.template.lastTopic);
          if (!baseDuration || baseDuration === '60') setBaseDuration(String(j.template.mostCommonDuration));
          setAutoFilled(true);
        }
      } finally {
        setTemplateLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = events.filter((e) => {
      if (seriesFilter === '__standalone__' && e.seriesId) return false;
      if (seriesFilter !== 'all' && seriesFilter !== '__standalone__' && e.seriesId !== seriesFilter) return false;
      if (visibilityFilter === 'visible' && e.hiddenFromKiosk) return false;
      if (visibilityFilter === 'hidden' && !e.hiddenFromKiosk) return false;
      return true;
    });
    if (needle) {
      rows = rows.filter((e) =>
        e.title.toLowerCase().includes(needle) ||
        (e.topic || '').toLowerCase().includes(needle) ||
        (e.seriesTitle || '').toLowerCase().includes(needle) ||
        e.date.includes(needle)
      );
    }
    rows = rows.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date':        cmp = a.date.localeCompare(b.date); break;
        case 'series':      cmp = (a.seriesTitle || 'ZZZZ').localeCompare(b.seriesTitle || 'ZZZZ'); break;
        case 'title':       cmp = a.title.localeCompare(b.title); break;
        case 'attendances': cmp = a.attendances - b.attendances; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [events, q, seriesFilter, visibilityFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'attendances' ? 'desc' : 'desc'); }
  };
  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <span style={{ opacity: 0.3 }}> ⇅</span>;
    return sortDir === 'asc' ? <span> ↑</span> : <span> ↓</span>;
  };

  // ── Toggle kiosk visibility inline (no modal) ──────────────────────────
  const toggleKioskVisibility = async (e: EventRow) => {
    const next = !e.hiddenFromKiosk;
    // Optimistic update
    setEvents((rows) => rows.map((r) => r.id === e.id ? { ...r, hiddenFromKiosk: next } : r));
    try {
      const r = await fetch(`/api/admin/events?id=${encodeURIComponent(e.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiddenFromKiosk: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setFlashMessage(next ? `Hidden "${e.title}" from kiosk.` : `"${e.title}" visible on kiosk again.`);
      setTimeout(() => setFlashMessage(null), 3000);
    } catch {
      // Revert on failure
      setEvents((rows) => rows.map((r) => r.id === e.id ? { ...r, hiddenFromKiosk: e.hiddenFromKiosk } : r));
      setErrorMessage('Failed to update kiosk visibility.');
    }
  };

  // ── Create event ──────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          topic: topic.trim() || null,
          date,
          baseDuration: parseInt(baseDuration, 10) || 60,
          seriesId: seriesId || null,
          ...(showCmeFields ? {
            eventTime: eventTime.trim() || null,
            location: location.trim() || null,
            isGrandRounds,
            learningObjectives: learningObjectives.map((s) => s.trim()).filter(Boolean),
            disclosureReport: disclosureReport.trim() || null,
            planningCommittee: planningCommittee.trim() || null,
            acknowledgmentOfSupport: acknowledgmentOfSupport.trim() || null,
          } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setFlashMessage(`Created "${j.event.title}".`);
      setTimeout(() => setFlashMessage(null), 4000);
      setTitle(''); setTopic(''); setDate(todayISO());
      setEventTime(''); setLocation(''); setIsGrandRounds(false);
      setLearningObjectives(['', '', '', '', '']);
      setDisclosureReport(''); setPlanningCommittee(''); setAcknowledgmentOfSupport('');
      setShowCreate(false);
      reload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not create event.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ev: EventRow) => {
    const force = ev.attendances > 0;
    const msg = force
      ? `"${ev.title}" has ${ev.attendances} attendance records. Delete event AND all attendances?`
      : `Delete "${ev.title}"?`;
    if (!confirm(msg)) return;
    const url = `/api/admin/events?id=${encodeURIComponent(ev.id)}${force ? '&force=1' : ''}`;
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert('Delete failed: ' + (j?.error || r.status));
      return;
    }
    reload();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/admin/events?id=${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editing.title,
          topic: editing.topic,
          date: editing.date,
          baseDuration: editing.baseDuration,
          seriesId: editing.seriesId,
          hiddenFromKiosk: !!editing.hiddenFromKiosk,
          eventTime: editing.eventTime ?? null,
          location: editing.location ?? null,
          isGrandRounds: !!editing.isGrandRounds,
          learningObjectives: (editing.learningObjectives ?? []).filter(Boolean),
          disclosureReport: editing.disclosureReport ?? null,
          planningCommittee: editing.planningCommittee ?? null,
          acknowledgmentOfSupport: editing.acknowledgmentOfSupport ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setEditing(null);
      reload();
    } catch (err: any) {
      alert('Save failed: ' + (err?.message || 'unknown'));
    } finally {
      setSavingEdit(false);
    }
  };

  // Merge candidates exclude source
  const mergeTargetCandidates = useMemo(() => {
    if (!merging) return [];
    const needle = mergeTargetQ.trim().toLowerCase();
    return events
      .filter((e) => e.id !== merging.id)
      .filter((e) => !needle ||
        e.title.toLowerCase().includes(needle) ||
        (e.topic || '').toLowerCase().includes(needle) ||
        (e.seriesTitle || '').toLowerCase().includes(needle) ||
        e.date.includes(needle)
      )
      .slice(0, 30);
  }, [events, merging, mergeTargetQ]);

  const confirmMerge = async () => {
    if (!merging || !mergeTargetId) return;
    const t = events.find((e) => e.id === mergeTargetId);
    if (!confirm(`Merge "${merging.title}" (${merging.attendances} attendances) INTO "${t?.title || 'target'}"? Source event will be DELETED. This cannot be undone from the UI.`)) return;
    setMergingNow(true);
    setErrorMessage(null);
    try {
      const r = await fetch('/api/admin/events/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: merging.id, targetId: mergeTargetId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setFlashMessage(`Merged "${j.sourceTitle}" into "${j.targetTitle}" — ${j.movedAttendances} attendances moved, ${j.mergedConflicts} duration sums.`);
      setTimeout(() => setFlashMessage(null), 8000);
      setMerging(null); setMergeTargetId(''); setMergeTargetQ('');
      reload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Merge failed.');
    } finally {
      setMergingNow(false);
    }
  };

  const exportCSV = () => {
    const header = ['Date','Series','Title','Topic','Duration (min)','Attendances','Hidden from kiosk','Event ID'];
    const lines = [header.map(escapeCsv).join(',')];
    for (const e of filteredSorted) {
      lines.push([
        e.date, e.seriesTitle || 'Standalone', e.title, e.topic || '',
        e.baseDuration, e.attendances,
        e.hiddenFromKiosk ? 'YES' : 'NO',
        e.id,
      ].map(escapeCsv).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `events_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Link href="/" style={{
        display: 'inline-block', marginBottom: 16, padding: '8px 14px',
        background: 'var(--c1)', color: 'white', borderRadius: 6,
        textDecoration: 'none', fontWeight: 'bold',
      }}>← Back to Dashboard</Link>

      <h1 style={{ fontSize: '1.6rem', fontFamily: '"Garamond", "EB Garamond", serif', marginBottom: 6 }}>
        Manage Events
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 18, fontSize: '0.92rem' }}>
        Full event list. Search, filter by series or kiosk visibility, edit any event's
        details and CME fields, toggle kiosk visibility with one click, or merge duplicate
        events.
      </p>

      {flashMessage && (
        <div style={{
          background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.88rem', fontWeight: 600,
        }}>✅ {flashMessage}</div>
      )}
      {errorMessage && (
        <div style={{
          background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.88rem', fontWeight: 600,
        }}>
          {errorMessage}
          <button onClick={() => setErrorMessage(null)} style={{
            float: 'right', background: 'transparent', border: 'none', color: '#991b1b',
            cursor: 'pointer', fontWeight: 700,
          }}>×</button>
        </div>
      )}

      {/* ── SEARCH / FILTER BAR ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by title, topic, series, or date…"
               style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', fontSize: '0.95rem',
                        border: '1px solid var(--border)', borderRadius: 8, background: 'white',
                        fontFamily: 'inherit', outline: 'none' }} />
        <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}
                style={selectStyle} title="Filter by series">
          <option value="all">All series</option>
          <option value="__standalone__">Standalone only</option>
          {seriesOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value as any)}
                style={selectStyle} title="Filter by kiosk visibility">
          <option value="all">All visibility</option>
          <option value="visible">Visible on kiosk</option>
          <option value="hidden">Hidden from kiosk</option>
        </select>
        <button onClick={exportCSV} style={{
          padding: '10px 16px', background: '#e0fbfe', color: '#097c87',
          border: '1px solid #bcebec', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem',
          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}>⬇ Export CSV ({filteredSorted.length})</button>
        <button onClick={() => setShowCreate(!showCreate)} style={{
          padding: '10px 16px', background: showCreate ? '#999' : 'var(--c3d)', color: 'white',
          border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem',
          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}>{showCreate ? '× Cancel' : '+ New event'}</button>
      </div>

      {/* ── CREATE FORM (collapsible) ───────────────────────────────────── */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{
          background: 'var(--card)', padding: 'clamp(16px, 3vw, 28px)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
          borderTop: '5px solid var(--mix-4)', marginBottom: 24,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="Series">
              <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} style={inputStyle}>
                <option value="">— Standalone —</option>
                {seriesOptions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              {templateLoading && <div style={hintStyle}>Looking up past events…</div>}
              {template && autoFilled && (
                <div style={{ ...hintStyle, color: '#047857', fontWeight: 600 }}>
                  ✨ Autofilled from {template.pastCount} past event{template.pastCount === 1 ? '' : 's'}.
                </div>
              )}
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} required />
            </Field>
            <Field label="Duration (min)">
              <input type="number" min={5} max={600} value={baseDuration}
                     onChange={(e) => setBaseDuration(e.target.value)} style={inputStyle} required />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Title (what the kiosk shows)">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
                     placeholder="e.g. Faculty Workshop: Promotion & Tenure" style={inputStyle} />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Topic (optional)">
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                     placeholder="e.g. Putting your case together" style={inputStyle} />
            </Field>
          </div>
          {/* CME toggle */}
          <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8fafc',
                        borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <button type="button" onClick={() => setShowCmeFields(!showCmeFields)} style={{
              background: 'transparent', border: 'none', color: 'var(--c1d)',
              fontWeight: 700, cursor: 'pointer', fontSize: '0.92rem', padding: 0,
            }}>
              {showCmeFields ? '▾' : '▸'} HU CME form fields {showCmeFields ? '' : '(optional)'}
            </button>
            {showCmeFields && (
              <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <Field label="Time">
                    <input type="text" value={eventTime} onChange={(e) => setEventTime(e.target.value)}
                           placeholder="12:00pm – 1:00pm" style={inputStyle} />
                  </Field>
                  <Field label="Location">
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                           placeholder="Cancer Center Auditorium" style={inputStyle} />
                  </Field>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={isGrandRounds}
                           onChange={(e) => setIsGrandRounds(e.target.checked)} />
                    Grand Rounds
                  </label>
                </div>
                <Field label="Learning Objectives (1 per line)">
                  {learningObjectives.map((obj, i) => (
                    <input key={i} type="text" value={obj}
                           onChange={(e) => {
                             const next = [...learningObjectives];
                             next[i] = e.target.value;
                             setLearningObjectives(next);
                           }}
                           placeholder={`Objective ${i + 1}`}
                           style={{ ...inputStyle, marginBottom: 6 }} />
                  ))}
                </Field>
                <Field label="Disclosure Report">
                  <textarea value={disclosureReport} onChange={(e) => setDisclosureReport(e.target.value)}
                            style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
                </Field>
                <Field label="Planning Committee">
                  <textarea value={planningCommittee} onChange={(e) => setPlanningCommittee(e.target.value)}
                            style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
                </Field>
                <Field label="Acknowledgment of Support">
                  <textarea value={acknowledgmentOfSupport} onChange={(e) => setAcknowledgmentOfSupport(e.target.value)}
                            style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
                </Field>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowCreate(false)} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={submitting} style={{
              ...btnPrimary, background: submitting ? '#999' : 'var(--c3d)',
            }}>{submitting ? 'Creating…' : 'Create event'}</button>
          </div>
        </form>
      )}

      {/* ── EVENT TABLE ─────────────────────────────────────────────────── */}
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>
        Showing <strong>{filteredSorted.length}</strong> of <strong>{events.length}</strong> events.
        {' '}<span style={{ color: '#854d0e' }}>{events.filter((e) => e.hiddenFromKiosk).length} hidden from kiosk.</span>
      </div>
      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--c1d)', color: 'white' }}>
              <tr>
                <th style={th} title="Click to toggle kiosk visibility on each event">👁</th>
                <th style={th} onClick={() => toggleSort('date')}>Date{sortIcon('date')}</th>
                <th style={th} onClick={() => toggleSort('series')}>Series{sortIcon('series')}</th>
                <th style={th} onClick={() => toggleSort('title')}>Title{sortIcon('title')}</th>
                <th style={th}>Topic</th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('attendances')}>Attend.{sortIcon('attendances')}</th>
                <th style={{ ...th, width: 200 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No events match.</td></tr>
              ) : filteredSorted.map((e, i) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)',
                                         background: i % 2 ? '#fafcfc' : 'white',
                                         opacity: e.hiddenFromKiosk ? 0.7 : 1 }}>
                  <td style={td}>
                    <button onClick={() => toggleKioskVisibility(e)}
                            title={e.hiddenFromKiosk ? 'Hidden from kiosk — click to show' : 'Visible on kiosk — click to hide'}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              fontSize: '1.1rem', padding: 4, lineHeight: 1,
                              opacity: e.hiddenFromKiosk ? 0.35 : 1,
                            }}>
                      {e.hiddenFromKiosk ? '🚫' : '👁'}
                    </button>
                  </td>
                  <td style={td}>{e.date}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{e.seriesTitle || <em>Standalone</em>}</td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {e.title}
                    {e.hiddenFromKiosk && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', background: '#fef3c7',
                                      color: '#854d0e', borderRadius: 999, fontSize: '0.68rem',
                                      fontWeight: 700, verticalAlign: 'middle' }}>
                        hidden
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{e.topic || ''}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700,
                                color: e.attendances > 0 ? 'var(--c1)' : 'var(--muted)' }}>
                    {e.attendances}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing({ ...e, learningObjectives: [...(e.learningObjectives || []), '', '', '', '', ''].slice(0, 5) })}
                            style={miniBtn} title="Edit event including HU CME fields">Edit</button>
                    <button onClick={() => { setMerging(e); setMergeTargetQ(''); setMergeTargetId(''); }}
                            style={{ ...miniBtn, marginLeft: 4, borderColor: '#fcd34d', color: '#854d0e' }}
                            title="Merge this event into another (consolidate duplicates)">Merge</button>
                    <button onClick={() => handleDelete(e)}
                            style={{ background: 'transparent', border: 'none', color: '#b91c1c',
                                     cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, marginLeft: 4 }}
                            title="Delete event">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EDIT MODAL ──────────────────────────────────────────────────── */}
      {editing && (
        <Modal title="Edit event" onClose={savingEdit ? undefined : () => setEditing(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Title"><input type="text" value={editing.title}
                   onChange={(e) => setEditing({ ...editing, title: e.target.value })} style={inputStyle} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <Field label="Date">
                <input type="date" value={editing.date}
                       onChange={(e) => setEditing({ ...editing, date: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Duration (min)">
                <input type="number" value={editing.baseDuration}
                       onChange={(e) => setEditing({ ...editing, baseDuration: parseInt(e.target.value, 10) || 60 })}
                       style={inputStyle} />
              </Field>
              <Field label="Time">
                <input type="text" value={editing.eventTime ?? ''}
                       onChange={(e) => setEditing({ ...editing, eventTime: e.target.value })}
                       placeholder="12:00pm – 1:00pm" style={inputStyle} />
              </Field>
              <Field label="Location">
                <input type="text" value={editing.location ?? ''}
                       onChange={(e) => setEditing({ ...editing, location: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <Field label="Topic">
              <input type="text" value={editing.topic ?? ''}
                     onChange={(e) => setEditing({ ...editing, topic: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Series">
              <select value={editing.seriesId ?? ''}
                      onChange={(e) => setEditing({ ...editing, seriesId: e.target.value || null })} style={inputStyle}>
                <option value="">— Standalone —</option>
                {seriesOptions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </Field>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!editing.isGrandRounds}
                       onChange={(e) => setEditing({ ...editing, isGrandRounds: e.target.checked })} />
                Grand Rounds
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                     title="When hidden, this event does NOT appear on the kiosk picker.">
                <input type="checkbox" checked={!!editing.hiddenFromKiosk}
                       onChange={(e) => setEditing({ ...editing, hiddenFromKiosk: e.target.checked })} />
                Hidden from kiosk
              </label>
            </div>
            <Field label="Learning Objectives (1 per line)">
              {[0, 1, 2, 3, 4].map((i) => {
                const list = editing.learningObjectives ?? [];
                return (
                  <input key={i} type="text" value={list[i] ?? ''}
                         onChange={(e) => {
                           const next = [...list];
                           while (next.length < 5) next.push('');
                           next[i] = e.target.value;
                           setEditing({ ...editing, learningObjectives: next });
                         }}
                         placeholder={`Objective ${i + 1}`}
                         style={{ ...inputStyle, marginBottom: 6 }} />
                );
              })}
            </Field>
            <Field label="Disclosure Report">
              <textarea value={editing.disclosureReport ?? ''}
                        onChange={(e) => setEditing({ ...editing, disclosureReport: e.target.value })}
                        style={{ ...inputStyle, minHeight: 70, fontFamily: 'inherit' }} />
            </Field>
            <Field label="Planning Committee">
              <textarea value={editing.planningCommittee ?? ''}
                        onChange={(e) => setEditing({ ...editing, planningCommittee: e.target.value })}
                        style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
            </Field>
            <Field label="Acknowledgment of Support">
              <textarea value={editing.acknowledgmentOfSupport ?? ''}
                        onChange={(e) => setEditing({ ...editing, acknowledgmentOfSupport: e.target.value })}
                        style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
            </Field>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(null)} disabled={savingEdit} style={btnGhost}>Cancel</button>
            <button onClick={saveEdit} disabled={savingEdit} style={{
              ...btnPrimary, background: savingEdit ? '#999' : 'var(--c3d)',
            }}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
          </div>
        </Modal>
      )}

      {/* ── MERGE MODAL ─────────────────────────────────────────────────── */}
      {merging && (
        <Modal title={`Merge "${merging.title}" into…`} onClose={mergingNow ? undefined : () => setMerging(null)}>
          <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 12px' }}>
            All attendances from <strong>{merging.title}</strong> ({merging.date}, {merging.attendances} attendees)
            will be moved into the event you pick. Duration conflicts on the same faculty are SUMMED.
            The source event is then deleted.
          </p>
          <input type="search" value={mergeTargetQ}
                 onChange={(e) => { setMergeTargetQ(e.target.value); setMergeTargetId(''); }}
                 placeholder="Search target by title, topic, series, or date…"
                 style={{ ...inputStyle, marginBottom: 12 }} autoFocus />
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {mergeTargetCandidates.length === 0 ? (
              <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                No matching events.
              </div>
            ) : mergeTargetCandidates.map((c) => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background: mergeTargetId === c.id ? '#fef3c7' : 'white',
              }}>
                <input type="radio" name="merge-event-target" checked={mergeTargetId === c.id}
                       onChange={() => setMergeTargetId(c.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {c.date} · {c.seriesTitle || 'Standalone'} · {c.attendances} attendees
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setMerging(null)} disabled={mergingNow} style={btnGhost}>Cancel</button>
            <button onClick={confirmMerge} disabled={mergingNow || !mergeTargetId} style={{
              ...btnPrimary, background: mergingNow || !mergeTargetId ? '#999' : '#dc2626',
            }} title="Move attendances and delete source event.">
              {mergingNow ? 'Merging…' : 'Confirm merge'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(13, 46, 50, 0.55)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 16px', zIndex: 200, overflowY: 'auto',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 22, maxWidth: 720, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: '"Garamond", serif' }}>{title}</h3>
          {onClose && (
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', fontSize: '1.4rem',
              color: 'var(--muted)', cursor: 'pointer', padding: 0,
            }}>×</button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)',
        marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>{label}</div>
      {children}
    </div>
  );
}

function escapeCsv(s: any): string {
  const v = String(s ?? '');
  return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ─── Styles ────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: '0.95rem', fontFamily: 'inherit', background: 'white',
};
const selectStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)',
  fontFamily: 'inherit', fontSize: '0.88rem', background: 'white',
};
const hintStyle: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--muted)', marginTop: 6 };
const th: React.CSSProperties = {
  padding: '10px 14px', fontSize: '0.78rem', textTransform: 'uppercase',
  letterSpacing: '0.4px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };
const miniBtn: React.CSSProperties = {
  padding: '3px 10px', background: 'transparent', border: '1px solid var(--c1d)',
  color: 'var(--c1d)', borderRadius: 4, fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '9px 14px', background: 'transparent', color: 'var(--muted)',
  border: '1px solid var(--border)', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnPrimary: React.CSSProperties = {
  padding: '9px 14px', background: 'var(--c1)', color: 'white',
  border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', fontFamily: 'inherit',
};

'use client';

import { useEffect, useState } from 'react';
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
  const [showCmeFields, setShowCmeFields] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit modal state
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Template autopopulation
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // Feedback
  const [success, setSuccess] = useState<string | null>(null);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccess(null);
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
          // CME fields — only sent if the toggle was opened
          ...(showCmeFields
            ? {
                eventTime: eventTime.trim() || null,
                location: location.trim() || null,
                isGrandRounds,
                learningObjectives: learningObjectives.map((s) => s.trim()).filter(Boolean),
                disclosureReport: disclosureReport.trim() || null,
                planningCommittee: planningCommittee.trim() || null,
                acknowledgmentOfSupport: acknowledgmentOfSupport.trim() || null,
              }
            : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSuccess(`Created "${j.event.title}" — it's now selectable on the kiosk.`);
      // Reset form
      setTitle('');
      setTopic('');
      setDate(todayISO());
      setEventTime('');
      setLocation('');
      setIsGrandRounds(false);
      setLearningObjectives(['', '', '', '', '']);
      setDisclosureReport('');
      setPlanningCommittee('');
      setAcknowledgmentOfSupport('');
      reload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not create event.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ev: EventRow) => {
    const force = ev.attendances > 0;
    const confirmMsg = force
      ? `"${ev.title}" has ${ev.attendances} attendance records. Delete event AND all attendances?`
      : `Delete "${ev.title}"?`;
    if (!confirm(confirmMsg)) return;
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
      alert('Save failed: ' + (err?.message || 'unknown error'));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <Link
        href="/"
        style={{
          display: 'inline-block', marginBottom: 16, padding: '8px 14px',
          background: 'var(--c1)', color: 'white', borderRadius: 6,
          textDecoration: 'none', fontWeight: 'bold',
        }}
      >
        ← Back to Dashboard
      </Link>

      <h1 style={{ fontSize: '1.6rem', fontFamily: '"Garamond", "EB Garamond", serif', marginBottom: 6 }}>
        Manage Events
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 22, fontSize: '0.92rem' }}>
        Create an event before its session starts so attendees can check in via the kiosk.
        Selecting a series autopopulates the form from the most recent past event in that series.
        Click any row below to edit CME fields (Learning Objectives, Disclosure Report, etc.).
      </p>

      {/* ── CREATE FORM ───────────────────────────────────────────────── */}
      <form
        onSubmit={handleCreate}
        style={{
          background: 'var(--card)', padding: 'clamp(16px, 3vw, 28px)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
          borderTop: '5px solid var(--mix-4)', marginBottom: 28,
        }}
      >
        <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)', textTransform: 'uppercase', marginBottom: 14, letterSpacing: '0.4px' }}>
          New event
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div>
            <label style={labelStyle}>Series</label>
            <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} style={inputStyle}>
              <option value="">— Standalone (no series) —</option>
              {seriesOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            {templateLoading && <div style={hintStyle}>Looking up past events in this series…</div>}
            {template && autoFilled && (
              <div style={{ ...hintStyle, color: '#047857', fontWeight: 600 }}>
                ✨ Autofilled from {template.pastCount} past event{template.pastCount === 1 ? '' : 's'} in this series.
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} required />
          </div>
          <div style={{ maxWidth: 160 }}>
            <label style={labelStyle}>Duration (min)</label>
            <input type="number" min={5} max={600} value={baseDuration} onChange={(e) => setBaseDuration(e.target.value)} style={inputStyle} required />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>
            Title <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(what the kiosk shows)</span>
          </label>
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Faculty Workshop: Promotion & Tenure"
            style={inputStyle} required list="title-suggestions"
          />
          {template && template.sampleTitles.length > 0 && (
            <datalist id="title-suggestions">
              {template.sampleTitles.map((t) => <option key={t} value={t} />)}
            </datalist>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Topic <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} style={inputStyle} placeholder="e.g. Putting your case together" />
        </div>

        {/* CME fields toggle */}
        <div style={{ marginTop: 18, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => setShowCmeFields(!showCmeFields)}
            style={{ background: 'transparent', border: 'none', color: 'var(--c1d)', fontWeight: 700, cursor: 'pointer', fontSize: '0.92rem', padding: 0 }}
          >
            {showCmeFields ? '▾' : '▸'} HU CME form fields {showCmeFields ? '' : '(optional — Learning Objectives, Disclosure, etc.)'}
          </button>

          {showCmeFields && (
            <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Time</label>
                  <input type="text" value={eventTime} onChange={(e) => setEventTime(e.target.value)} placeholder="e.g. 12:00pm – 1:00pm" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Location</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cancer Center Auditorium" style={inputStyle} />
                </div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: '0.92rem' }}>
                  <input type="checkbox" checked={isGrandRounds} onChange={(e) => setIsGrandRounds(e.target.checked)} />
                  Grand Rounds
                </label>
              </div>

              <div>
                <label style={labelStyle}>Learning Objectives (1 per line)</label>
                {learningObjectives.map((obj, i) => (
                  <input
                    key={i}
                    type="text"
                    value={obj}
                    onChange={(e) => {
                      const next = [...learningObjectives];
                      next[i] = e.target.value;
                      setLearningObjectives(next);
                    }}
                    placeholder={`Objective ${i + 1}`}
                    style={{ ...inputStyle, marginBottom: 6 }}
                  />
                ))}
              </div>

              <div>
                <label style={labelStyle}>Disclosure Report</label>
                <textarea value={disclosureReport} onChange={(e) => setDisclosureReport(e.target.value)} style={{ ...inputStyle, minHeight: 70, fontFamily: 'inherit' }} placeholder="Speakers and planners disclose…" />
              </div>
              <div>
                <label style={labelStyle}>Planning Committee</label>
                <textarea value={planningCommittee} onChange={(e) => setPlanningCommittee(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} placeholder="Names of committee members" />
              </div>
              <div>
                <label style={labelStyle}>Acknowledgment of Support</label>
                <textarea value={acknowledgmentOfSupport} onChange={(e) => setAcknowledgmentOfSupport(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} placeholder="Sponsorship, grants, etc." />
              </div>
            </div>
          )}
        </div>

        {errorMessage && <div style={errorBox}>{errorMessage}</div>}
        {success && <div style={successBox}>{success}</div>}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={() => {
              setTitle(''); setTopic(''); setSeriesId(''); setDate(todayISO()); setBaseDuration('60');
              setTemplate(null); setAutoFilled(false);
              setEventTime(''); setLocation(''); setIsGrandRounds(false);
              setLearningObjectives(['', '', '', '', '']);
              setDisclosureReport(''); setPlanningCommittee(''); setAcknowledgmentOfSupport('');
            }}
            style={{ ...btnStyle, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ ...btnStyle, background: submitting ? '#999' : 'var(--c3d)', color: 'white' }}
          >
            {submitting ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </form>

      {/* ── EXISTING EVENTS LIST ─────────────────────────────────────── */}
      <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.4px' }}>
        Recent events ({events.length})
      </h2>
      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
          No events in the past 60 days.
        </div>
      ) : (
        <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--c1d)', color: 'white' }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Series</th>
                <th style={th}>Title</th>
                <th style={th}>Topic</th>
                <th style={{ ...th, textAlign: 'right' }}>Attendances</th>
                <th style={{ ...th, width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? '#fafcfc' : 'white' }}>
                  <td style={td}>{e.date}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{e.seriesTitle || <em>Standalone</em>}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{e.topic || ''}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: e.attendances > 0 ? 'var(--c1)' : 'var(--muted)' }}>
                    {e.attendances}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setEditing({ ...e, learningObjectives: [...(e.learningObjectives || []), '', '', '', '', ''].slice(0, 5) })}
                      style={{ background: 'transparent', border: '1px solid var(--c1d)', color: 'var(--c1d)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '4px 10px', borderRadius: 4, marginRight: 6 }}
                      title="Edit event including HU CME fields"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(e)}
                      style={{ background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                      title="Delete event"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EDIT MODAL ─────────────────────────────────────────────── */}
      {editing && (
        <div
          onClick={() => !savingEdit && setEditing(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(13, 46, 50, 0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 16px', zIndex: 50, overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 12, padding: 24, maxWidth: 720, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontFamily: '"Garamond", serif' }}>Edit event</h3>
              <button onClick={() => !savingEdit && setEditing(null)} style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input type="text" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Duration (min)</label>
                  <input type="number" value={editing.baseDuration} onChange={(e) => setEditing({ ...editing, baseDuration: parseInt(e.target.value, 10) || 60 })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Time</label>
                  <input type="text" value={editing.eventTime ?? ''} onChange={(e) => setEditing({ ...editing, eventTime: e.target.value })} placeholder="e.g. 12:00pm – 1:00pm" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Location</label>
                  <input type="text" value={editing.location ?? ''} onChange={(e) => setEditing({ ...editing, location: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Topic</label>
                <input type="text" value={editing.topic ?? ''} onChange={(e) => setEditing({ ...editing, topic: e.target.value })} style={inputStyle} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!editing.isGrandRounds} onChange={(e) => setEditing({ ...editing, isGrandRounds: e.target.checked })} />
                Grand Rounds
              </label>

              <div>
                <label style={labelStyle}>Learning Objectives (1 per line)</label>
                {[0, 1, 2, 3, 4].map((i) => {
                  const list = editing.learningObjectives ?? [];
                  return (
                    <input
                      key={i}
                      type="text"
                      value={list[i] ?? ''}
                      onChange={(e) => {
                        const next = [...list];
                        while (next.length < 5) next.push('');
                        next[i] = e.target.value;
                        setEditing({ ...editing, learningObjectives: next });
                      }}
                      placeholder={`Objective ${i + 1}`}
                      style={{ ...inputStyle, marginBottom: 6 }}
                    />
                  );
                })}
              </div>

              <div>
                <label style={labelStyle}>Disclosure Report</label>
                <textarea value={editing.disclosureReport ?? ''} onChange={(e) => setEditing({ ...editing, disclosureReport: e.target.value })} style={{ ...inputStyle, minHeight: 70, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={labelStyle}>Planning Committee</label>
                <textarea value={editing.planningCommittee ?? ''} onChange={(e) => setEditing({ ...editing, planningCommittee: e.target.value })} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={labelStyle}>Acknowledgment of Support</label>
                <textarea value={editing.acknowledgmentOfSupport ?? ''} onChange={(e) => setEditing({ ...editing, acknowledgmentOfSupport: e.target.value })} style={{ ...inputStyle, minHeight: 60, fontFamily: 'inherit' }} />
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} disabled={savingEdit} style={{ ...btnStyle, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={savingEdit} style={{ ...btnStyle, background: savingEdit ? '#999' : 'var(--c3d)', color: 'white' }}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: '0.95rem', fontFamily: 'inherit', background: 'white',
};
const hintStyle: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--muted)', marginTop: 6 };
const btnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 6, fontWeight: 700, fontSize: '0.92rem',
  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
};
const errorBox: React.CSSProperties = {
  background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b',
  padding: 10, borderRadius: 8, marginTop: 14, fontSize: '0.88rem', fontWeight: 600,
};
const successBox: React.CSSProperties = {
  background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
  padding: 10, borderRadius: 8, marginTop: 14, fontSize: '0.88rem', fontWeight: 600,
};
const th: React.CSSProperties = {
  padding: '10px 14px', fontWeight: 700, fontSize: '0.78rem',
  textTransform: 'uppercase', letterSpacing: '0.4px',
};
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };

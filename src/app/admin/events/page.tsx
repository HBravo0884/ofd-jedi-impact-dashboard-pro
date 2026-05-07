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

  // Form state
  const [seriesId, setSeriesId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState(todayISO());
  const [baseDuration, setBaseDuration] = useState('60');
  const [submitting, setSubmitting] = useState(false);

  // Template-driven autopopulation
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // Feedback
  const [success, setSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Initial load ───────────────────────────────────────────────────────
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

  // ── Autopopulate form when a series is picked ─────────────────────────
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
          // Only autofill blank fields. Don't clobber what the user typed.
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
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSuccess(`Created "${j.event.title}" — it's now selectable on the kiosk.`);
      // Reset form for fast next entry; keep series + duration sticky.
      setTitle('');
      setTopic('');
      setDate(todayISO());
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
            {templateLoading && (
              <div style={hintStyle}>Looking up past events in this series…</div>
            )}
            {template && autoFilled && (
              <div style={{ ...hintStyle, color: '#047857', fontWeight: 600 }}>
                ✨ Autofilled from {template.pastCount} past event{template.pastCount === 1 ? '' : 's'} in this series.
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ maxWidth: 160 }}>
            <label style={labelStyle}>Duration (min)</label>
            <input
              type="number"
              min={5}
              max={600}
              value={baseDuration}
              onChange={(e) => setBaseDuration(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>
            Title <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(what the kiosk shows)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Faculty Workshop: Promotion & Tenure"
            style={inputStyle}
            required
            list="title-suggestions"
          />
          {template && template.sampleTitles.length > 0 && (
            <datalist id="title-suggestions">
              {template.sampleTitles.map((t) => <option key={t} value={t} />)}
            </datalist>
          )}
          {template && template.sampleTitles.length > 1 && (
            <div style={hintStyle}>
              Recent in this series:{' '}
              {template.sampleTitles.slice(0, 3).map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTitle(t)}
                  style={chipStyle}
                  title="Click to use this title"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Topic <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Putting your case together"
            style={inputStyle}
          />
        </div>

        {errorMessage && (
          <div style={errorBox}>{errorMessage}</div>
        )}
        {success && (
          <div style={successBox}>{success}</div>
        )}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            onClick={() => { setTitle(''); setTopic(''); setSeriesId(''); setDate(todayISO()); setBaseDuration('60'); setTemplate(null); setAutoFilled(false); }}
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
                <th style={{ ...th, width: 80 }}></th>
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
                  <td style={{ ...td, textAlign: 'right' }}>
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
const hintStyle: React.CSSProperties = {
  fontSize: '0.78rem', color: 'var(--muted)', marginTop: 6,
};
const chipStyle: React.CSSProperties = {
  margin: '0 4px 0 0', padding: '3px 10px', background: '#e0f2f1', color: '#065e68',
  border: '1px solid #cdebee', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
  cursor: 'pointer', font: 'inherit',
};
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

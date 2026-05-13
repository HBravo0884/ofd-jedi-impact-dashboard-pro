'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface EventRow {
  id: string;
  title: string;
  topic: string | null;
  date: string;
  eventTime: string | null;
  location: string | null;
  isGrandRounds: boolean;
  baseDuration: number;
  seriesId: string | null;
  seriesTitle: string | null;
  speaker: string | null;
  speaker2: string | null;
  speaker3: string | null;
  uniqueAttendees: number;
  totalMinutes: number;
  hiddenFromKiosk: boolean;
}

interface SeriesOption { id: string; title: string; }

type SortKey =
  | 'date' | 'series' | 'title' | 'time' | 'location'
  | 'speaker' | 'duration' | 'attendees' | 'minutes' | 'credits' | 'avgAttn';

export default function EventRecordClient() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [series, setSeries] = useState<SeriesOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [seriesFilter, setSeriesFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'past' | 'today' | 'future'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [evR, seriesR] = await Promise.all([
          fetch('/api/admin/event-record'),
          fetch('/api/admin/series'),
        ]);
        const evJ = await evR.json();
        const sJ  = await seriesR.json();
        if (!evR.ok) throw new Error(evJ?.error || `HTTP ${evR.status}`);
        if (cancelled) return;
        setEvents(evJ.events || []);
        setSeries(sJ.series || []);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to load event record.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Computed Tier 1 metrics ──────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  type EnrichedRow = EventRow & {
    cmeCredits: number;
    avgAttendancePct: number;
    timeStatus: 'past' | 'today' | 'future';
  };
  const enriched: EnrichedRow[] = useMemo(() => events.map((e) => {
    const cmeCredits = e.baseDuration > 0 ? +(e.baseDuration / 60).toFixed(2) : 0;
    const denom = e.uniqueAttendees * e.baseDuration;
    const avgAttendancePct = denom > 0 ? Math.round((e.totalMinutes / denom) * 100) : 0;
    let timeStatus: 'past' | 'today' | 'future';
    if (e.date < todayISO) timeStatus = 'past';
    else if (e.date === todayISO) timeStatus = 'today';
    else timeStatus = 'future';
    return { ...e, cmeCredits, avgAttendancePct, timeStatus };
  }), [events, todayISO]);

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = enriched.filter((e) => {
      if (seriesFilter === '__standalone__' && e.seriesId) return false;
      if (seriesFilter !== 'all' && seriesFilter !== '__standalone__' && e.seriesId !== seriesFilter) return false;
      if (timeFilter !== 'all' && e.timeStatus !== timeFilter) return false;
      return true;
    });
    if (needle) {
      rows = rows.filter((e) =>
        e.title.toLowerCase().includes(needle) ||
        (e.topic || '').toLowerCase().includes(needle) ||
        (e.seriesTitle || '').toLowerCase().includes(needle) ||
        (e.location || '').toLowerCase().includes(needle) ||
        e.date.includes(needle) ||
        [e.speaker, e.speaker2, e.speaker3].filter(Boolean).join(' ').toLowerCase().includes(needle)
      );
    }
    rows = rows.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date':      cmp = a.date.localeCompare(b.date); break;
        case 'series':    cmp = (a.seriesTitle || 'ZZZZ').localeCompare(b.seriesTitle || 'ZZZZ'); break;
        case 'title':     cmp = a.title.localeCompare(b.title); break;
        case 'time':      cmp = (a.eventTime || '').localeCompare(b.eventTime || ''); break;
        case 'location':  cmp = (a.location || 'ZZZZ').localeCompare(b.location || 'ZZZZ'); break;
        case 'speaker':   cmp = (a.speaker || '').localeCompare(b.speaker || ''); break;
        case 'duration':  cmp = a.baseDuration - b.baseDuration; break;
        case 'attendees': cmp = a.uniqueAttendees - b.uniqueAttendees; break;
        case 'minutes':   cmp = a.totalMinutes - b.totalMinutes; break;
        case 'credits':   cmp = a.cmeCredits - b.cmeCredits; break;
        case 'avgAttn':   cmp = a.avgAttendancePct - b.avgAttendancePct; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [enriched, q, seriesFilter, timeFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      const numericDesc = ['date','attendees','minutes','credits','avgAttn','duration'].includes(k);
      setSortDir(numericDesc ? 'desc' : 'asc');
    }
  };
  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <span style={{ opacity: 0.3 }}> ⇅</span>;
    return sortDir === 'asc' ? <span> ↑</span> : <span> ↓</span>;
  };

  const exportCSV = () => {
    const header = [
      'Date','Status','Time','Location','Series','Title','Topic','Grand Rounds',
      'Speaker 1','Speaker 2','Speaker 3',
      'Base Duration (min)','CME Credits',
      'Unique Attendees','Total Minutes Watched','Avg Attendance %',
      'Hidden from Kiosk','Event ID',
    ];
    const lines = [header.map(esc).join(',')];
    for (const e of filteredSorted) {
      lines.push([
        e.date, e.timeStatus, e.eventTime || '', e.location || '',
        e.seriesTitle || 'Standalone', e.title, e.topic || '',
        e.isGrandRounds ? 'YES' : 'NO',
        e.speaker || '', e.speaker2 || '', e.speaker3 || '',
        e.baseDuration, e.cmeCredits,
        e.uniqueAttendees, e.totalMinutes, e.avgAttendancePct,
        e.hiddenFromKiosk ? 'YES' : 'NO',
        e.id,
      ].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `event_record_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Format helpers
  const fmtMin = (n: number) => {
    if (!n) return '—';
    if (n < 60) return `${n} min`;
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };
  const statusDot = (s: 'past' | 'today' | 'future') => {
    const color = s === 'today' ? '#16a34a' : s === 'future' ? '#0ea5e9' : '#94a3b8';
    const title = s === 'today' ? 'Today' : s === 'future' ? 'Future' : 'Past';
    return <span title={title} style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, verticalAlign: 'middle',
    }} />;
  };
  const pctBg = (pct: number) => {
    if (pct >= 80) return { bg: '#dcfce7', fg: '#166534' };
    if (pct >= 50) return { bg: '#fef9c3', fg: '#854d0e' };
    if (pct > 0)   return { bg: '#fee2e2', fg: '#991b1b' };
    return { bg: 'transparent', fg: '#94a3b8' };
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <Link href="/" style={{
        display: 'inline-block', marginBottom: 16, padding: '8px 14px',
        background: 'var(--c1)', color: 'white', borderRadius: 6,
        textDecoration: 'none', fontWeight: 'bold',
      }}>← Back to Master Overview</Link>

      <h1 style={{ fontSize: '1.6rem', fontFamily: '"Garamond", "EB Garamond", serif', marginBottom: 6 }}>
        Event Record
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 18, fontSize: '0.92rem' }}>
        Every event that has or will take place. Sort any column. Click a row to view
        the attendee roster for that event. For editing, head to{' '}
        <Link href="/admin/events" style={{ color: 'var(--c1d)', fontWeight: 700 }}>
          Manage Events
        </Link>.
      </p>

      {errorMsg && (
        <div style={{
          background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.88rem', fontWeight: 600,
        }}>
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} style={{
            float: 'right', background: 'transparent', border: 'none', color: '#991b1b',
            cursor: 'pointer', fontWeight: 700,
          }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search title, topic, series, location, speakers, date…"
               style={{ flex: '1 1 260px', minWidth: 0, padding: '10px 14px', fontSize: '0.95rem',
                        border: '1px solid var(--border)', borderRadius: 8, background: 'white',
                        fontFamily: 'inherit', outline: 'none' }} />
        <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)} style={selectStyle}>
          <option value="all">All series</option>
          <option value="__standalone__">Standalone only</option>
          {series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as any)} style={selectStyle}>
          <option value="all">All time</option>
          <option value="past">Past only</option>
          <option value="today">Today only</option>
          <option value="future">Future only</option>
        </select>
        <button onClick={exportCSV} style={{
          padding: '10px 14px', background: '#e0fbfe', color: '#097c87',
          border: '1px solid #bcebec', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem',
          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}>⬇ CSV ({filteredSorted.length})</button>
      </div>

      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>
        Showing <strong>{filteredSorted.length}</strong> of <strong>{events.length}</strong> events.
        {' · '}<strong style={{ color: 'var(--c1)' }}>
          {filteredSorted.reduce((s, e) => s + e.uniqueAttendees, 0).toLocaleString()}
        </strong> total attendances · <strong style={{ color: 'var(--c1)' }}>
          {fmtMin(filteredSorted.reduce((s, e) => s + e.totalMinutes, 0))}
        </strong> total watched · <strong style={{ color: 'var(--c1)' }}>
          {filteredSorted.reduce((s, e) => s + e.cmeCredits, 0).toFixed(1)}
        </strong> CME credits issued.
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>
      ) : (
        <div className="table-scroll" style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead style={{ background: 'var(--c1d)', color: 'white' }}>
              <tr>
                <th style={th} onClick={() => toggleSort('date')}>Date{sortIcon('date')}</th>
                <th style={th} onClick={() => toggleSort('time')}>Time{sortIcon('time')}</th>
                <th style={th} onClick={() => toggleSort('location')}>Location{sortIcon('location')}</th>
                <th style={th} onClick={() => toggleSort('series')}>Series{sortIcon('series')}</th>
                <th style={th} onClick={() => toggleSort('title')}>Title{sortIcon('title')}</th>
                <th style={th} onClick={() => toggleSort('speaker')}>Speaker(s){sortIcon('speaker')}</th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('duration')}>
                  Duration{sortIcon('duration')}
                </th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('credits')}>
                  CME{sortIcon('credits')}
                </th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('attendees')}>
                  Unique{sortIcon('attendees')}
                </th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('minutes')}>
                  Total min{sortIcon('minutes')}
                </th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('avgAttn')}>
                  Avg %{sortIcon('avgAttn')}
                </th>
                <th style={{ ...th, width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                  No events match.
                </td></tr>
              ) : filteredSorted.map((e, i) => {
                const speakers = [e.speaker, e.speaker2, e.speaker3].filter(Boolean) as string[];
                const pctP = pctBg(e.avgAttendancePct);
                return (
                  <tr key={e.id} style={{
                    borderTop: '1px solid var(--border)',
                    background: i % 2 ? '#fafcfc' : 'white',
                    opacity: e.hiddenFromKiosk ? 0.7 : 1,
                    cursor: 'pointer',
                  }}
                    onClick={() => { window.location.href = `/roster#event-${e.id}`; }}
                  >
                    <td style={td}>
                      {statusDot(e.timeStatus)}
                      {e.date}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)', fontSize: '0.78rem' }}>
                      {e.eventTime || <em style={{ color: '#cbd5e1' }}>—</em>}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)', fontSize: '0.78rem' }}>
                      {e.location || <em style={{ color: '#cbd5e1' }}>—</em>}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)' }}>
                      {e.seriesTitle || <em>Standalone</em>}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {e.isGrandRounds && (
                        <span title="Grand Rounds" style={{ marginRight: 4 }}>🎓</span>
                      )}
                      {e.title}
                      {e.hiddenFromKiosk && (
                        <span style={{
                          marginLeft: 6, padding: '1px 6px', background: '#fef3c7',
                          color: '#854d0e', borderRadius: 999, fontSize: '0.65rem',
                          fontWeight: 700, verticalAlign: 'middle',
                        }}>hidden</span>
                      )}
                      {e.topic && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, fontWeight: 400 }}>
                          {e.topic}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: '0.78rem' }}>
                      {speakers.length === 0
                        ? <em style={{ color: '#cbd5e1' }}>—</em>
                        : speakers.map((s, idx) => (
                            <div key={idx} style={{ lineHeight: 1.3 }}>
                              <span style={{ color: '#94a3b8', fontSize: '0.62rem', marginRight: 4 }}>
                                {idx + 1}.
                              </span>
                              {s}
                            </div>
                          ))}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#475569', fontSize: '0.82rem' }}>
                      {e.baseDuration} min
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#0d2e32', fontSize: '0.82rem' }}>
                      {e.cmeCredits.toFixed(1)}
                    </td>
                    <td style={{
                      ...td, textAlign: 'right', fontWeight: 700,
                      color: e.uniqueAttendees > 0 ? 'var(--c1)' : 'var(--muted)',
                    }}>{e.uniqueAttendees}</td>
                    <td style={{
                      ...td, textAlign: 'right', fontWeight: 700,
                      color: e.totalMinutes > 0 ? 'var(--c1)' : 'var(--muted)',
                    }}>{fmtMin(e.totalMinutes)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {e.uniqueAttendees > 0 ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          background: pctP.bg, color: pctP.fg,
                          borderRadius: 999, fontSize: '0.74rem', fontWeight: 700,
                        }}>{e.avgAttendancePct}%</span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(ev) => ev.stopPropagation()}>
                      <Link href={`/admin/signin-sheet/${e.id}`}
                            style={{
                              padding: '3px 10px', background: 'transparent',
                              border: '1px solid var(--c1d)', color: 'var(--c1d)',
                              borderRadius: 4, fontWeight: 600, fontSize: '0.72rem',
                              textDecoration: 'none', cursor: 'pointer',
                            }}
                            title="Open printable sign-in sheet for this event">
                        🖨 Sheet
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function esc(s: any): string {
  const v = String(s ?? '');
  return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const th: React.CSSProperties = {
  padding: '10px 12px', fontSize: '0.74rem', textTransform: 'uppercase',
  letterSpacing: '0.4px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '10px 12px', fontSize: '0.88rem', verticalAlign: 'top' };
const selectStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)',
  fontFamily: 'inherit', fontSize: '0.85rem', background: 'white',
};

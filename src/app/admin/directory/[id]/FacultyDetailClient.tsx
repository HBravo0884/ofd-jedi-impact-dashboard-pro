'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { SignatureSVG, pickLatestTrace } from '@/components/SignatureSVG';

interface FacultyProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  division: string | null;
  rank: string;
  status: string;
  degrees: string[];
  aliases: string[];
  adminTitle: string | null;
  positionType: string | null;
  memberSince: string;
}

interface AttendanceRow {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;        // YYYY-MM-DD
  seriesTitle: string | null;
  topic: string | null;
  speaker: string | null;
  baseDuration: number;
  durationJoined: number;
}

interface SignatureInfo {
  baselineCount: number;
  latestTrace: string | null;
}

const esc = (s: any) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const fmtMin = (n: number) => {
  if (!n) return '—';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export default function FacultyDetailClient({
  faculty,
  attendances,
  signature,
}: {
  faculty: FacultyProfile;
  attendances: AttendanceRow[];
  signature: SignatureInfo;
}) {
  const [q, setQ] = useState('');
  const [seriesFilter, setSeriesFilter] = useState<'all' | string>('all');

  // Decode the most recent signature_pad trace once.
  const trace = useMemo(() => {
    if (!signature.latestTrace) return null;
    return pickLatestTrace([signature.latestTrace]);
  }, [signature.latestTrace]);

  // Distinct series (for the filter dropdown).
  const seriesOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of attendances) if (a.seriesTitle) set.add(a.seriesTitle);
    return Array.from(set).sort();
  }, [attendances]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return attendances.filter((a) => {
      if (seriesFilter !== 'all' && a.seriesTitle !== seriesFilter) return false;
      if (needle) {
        const hay =
          a.eventTitle + ' ' +
          (a.seriesTitle || '') + ' ' +
          (a.topic || '') + ' ' +
          (a.speaker || '') + ' ' +
          a.eventDate;
        if (!hay.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [attendances, q, seriesFilter]);

  const totals = useMemo(() => ({
    events: filtered.length,
    minutes: filtered.reduce((s, a) => s + (a.durationJoined || 0), 0),
    distinctSeries: new Set(filtered.map((a) => a.seriesTitle).filter(Boolean)).size,
  }), [filtered]);

  const exportCSV = () => {
    const header = [
      'Date', 'Series', 'Event', 'Topic', 'Speaker',
      'Scheduled (min)', 'Watched (min)', 'Event ID',
    ];
    const lines = [header.map(esc).join(',')];
    for (const a of filtered) {
      lines.push([
        a.eventDate, a.seriesTitle || 'Standalone', a.eventTitle,
        a.topic || '', a.speaker || '',
        a.baseDuration, a.durationJoined, a.eventId,
      ].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${faculty.lastName}_${faculty.firstName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Link href="/directory" style={{
        display: 'inline-block', marginBottom: 14, padding: '8px 14px',
        background: 'var(--c1)', color: 'white', borderRadius: 6,
        textDecoration: 'none', fontWeight: 'bold',
      }}>← Back to Directory</Link>

      {/* ── HEADER CARD ────────────────────────────────────────────────── */}
      <div style={{
        background: 'white', border: '1px solid var(--border)', borderRadius: 10,
        padding: 20, marginBottom: 18, display: 'flex', gap: 24, alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <h1 style={{
            fontSize: '1.7rem', fontFamily: '"Garamond", "EB Garamond", serif',
            marginBottom: 4, color: 'var(--c1d)',
          }}>
            {faculty.lastName}, {faculty.firstName}
            {faculty.degrees.length > 0 && (
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '1.1rem', marginLeft: 8 }}>
                {faculty.degrees.join(', ')}
              </span>
            )}
          </h1>
          <div style={{ fontSize: '0.92rem', color: '#475569', marginBottom: 12 }}>
            {faculty.adminTitle || <em style={{ color: '#cbd5e1' }}>No title set</em>}
            {faculty.positionType && (
              <span style={{ marginLeft: 8, padding: '1px 8px', background: '#f1f5f9',
                             borderRadius: 999, fontSize: '0.74rem' }}>
                {faculty.positionType}
              </span>
            )}
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px',
                       fontSize: '0.88rem' }}>
            <dt style={{ color: '#64748b' }}>Department</dt>
            <dd style={{ margin: 0 }}>{faculty.department}</dd>
            {faculty.division && (<>
              <dt style={{ color: '#64748b' }}>Division</dt>
              <dd style={{ margin: 0 }}>{faculty.division}</dd>
            </>)}
            <dt style={{ color: '#64748b' }}>Rank</dt>
            <dd style={{ margin: 0 }}>{faculty.rank}</dd>
            <dt style={{ color: '#64748b' }}>Email</dt>
            <dd style={{ margin: 0 }}><a href={`mailto:${faculty.email}`} style={{ color: 'var(--c1)' }}>{faculty.email}</a></dd>
            <dt style={{ color: '#64748b' }}>Status</dt>
            <dd style={{ margin: 0 }}>
              <span style={{
                padding: '1px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                background: faculty.status === 'VERIFIED' ? '#dcfce7' : '#fef3c7',
                color:      faculty.status === 'VERIFIED' ? '#166534' : '#854d0e',
              }}>{faculty.status === 'VERIFIED' ? 'verified' : 'pending'}</span>
            </dd>
            <dt style={{ color: '#64748b' }}>Profile created</dt>
            <dd style={{ margin: 0, color: 'var(--muted)' }}>{faculty.memberSince}</dd>
            {faculty.aliases.length > 0 && (<>
              <dt style={{ color: '#64748b' }}>Aliases</dt>
              <dd style={{ margin: 0, fontSize: '0.78rem', color: '#475569' }}>
                {faculty.aliases.map((a, i) => (
                  <span key={i} style={{
                    display: 'inline-block', padding: '1px 6px', marginRight: 4, marginBottom: 3,
                    background: '#f1f5f9', borderRadius: 999, fontSize: '0.72rem',
                  }}>{a}</span>
                ))}
              </dd>
            </>)}
          </dl>
        </div>

        {/* Signature panel */}
        <div style={{
          flex: '0 0 240px', padding: 14, background: '#fafcfc',
          border: '1px solid var(--border)', borderRadius: 8,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b',
                        textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
            Most recent signature
          </div>
          {trace ? (
            <SignatureSVG trace={trace} width={200} height={64} showLine={false} />
          ) : (
            <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderBottom: '1px solid #cbd5e1', color: '#cbd5e1', fontStyle: 'italic',
                          fontSize: '0.78rem' }}>
              no signature on file
            </div>
          )}
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 8 }}>
            {signature.baselineCount === 0
              ? 'No baselines trained.'
              : `${signature.baselineCount} baseline${signature.baselineCount === 1 ? '' : 's'} on file`}
          </div>
        </div>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <Kpi label="Events attended" value={totals.events} />
        <Kpi label="Total time watched" value={fmtMin(totals.minutes)} />
        <Kpi label="Distinct series" value={totals.distinctSeries} />
      </div>

      {/* ── CONTROLS ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search title, series, topic, speaker, date…"
               style={{ flex: '1 1 280px', padding: '9px 12px', fontSize: '0.92rem',
                        border: '1px solid var(--border)', borderRadius: 7, background: 'white',
                        outline: 'none', fontFamily: 'inherit' }} />
        <select value={seriesFilter} onChange={(e) => setSeriesFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)',
                         background: 'white', fontSize: '0.88rem' }}>
          <option value="all">All series</option>
          {seriesOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={exportCSV} style={{
          padding: '9px 14px', background: 'var(--c1)', color: 'white', border: 'none',
          borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
        }}>Export CSV</button>
      </div>

      {/* ── ATTENDANCE TABLE ───────────────────────────────────────────── */}
      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
          <thead style={{ background: 'var(--c1d)', color: 'white' }}>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Series</th>
              <th style={th}>Event</th>
              <th style={{ ...th, textAlign: 'right' }} title="Scheduled meeting length (min).">Sched</th>
              <th style={{ ...th, textAlign: 'right' }} title="Minutes this faculty actually watched.">Watched</th>
              <th style={{ ...th, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                {attendances.length === 0
                  ? 'No attendance records for this faculty yet.'
                  : 'No matches.'}
              </td></tr>
            ) : filtered.map((a, i) => (
              <tr key={a.id} style={{
                borderTop: '1px solid var(--border)',
                background: i % 2 ? '#fafcfc' : 'white',
              }}>
                <td style={td}>{a.eventDate}</td>
                <td style={{ ...td, color: 'var(--muted)' }}>{a.seriesTitle || <em>Standalone</em>}</td>
                <td style={{ ...td, fontWeight: 600 }}>
                  {a.eventTitle}
                  {(a.topic || a.speaker) && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, fontWeight: 400 }}>
                      {[a.speaker, a.topic].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#475569' }}>{a.baseDuration} min</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--c1)' }}>
                  {fmtMin(a.durationJoined)}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link href={`/admin/signin-sheet/${a.eventId}`} style={{
                    padding: '3px 10px', background: 'transparent',
                    border: '1px solid var(--c1d)', color: 'var(--c1d)',
                    borderRadius: 4, fontWeight: 600, fontSize: '0.72rem',
                    textDecoration: 'none',
                  }}>Sheet</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px', fontSize: '0.8rem', fontWeight: 700,
  letterSpacing: '0.02em', cursor: 'default',
};
const td: React.CSSProperties = {
  padding: '8px 12px', verticalAlign: 'top',
};

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      flex: '0 0 auto', padding: '10px 16px',
      background: 'white', border: '1px solid var(--border)', borderRadius: 8,
      minWidth: 140,
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--c1d)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

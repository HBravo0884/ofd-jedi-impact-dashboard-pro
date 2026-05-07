'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

interface FacultyRow {
  id: string;
  lastName: string;
  firstName: string;
  department: string;
  rank: string;
  degrees: string;
  sessions: number;
}

type SortKey = 'name' | 'department' | 'rank' | 'sessions';

export default function DirectoryClient({ initialFaculty }: { initialFaculty: FacultyRow[] }) {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = !needle
      ? initialFaculty
      : initialFaculty.filter((f) => {
          return (
            f.lastName.toLowerCase().includes(needle) ||
            f.firstName.toLowerCase().includes(needle) ||
            f.department.toLowerCase().includes(needle) ||
            f.rank.toLowerCase().includes(needle) ||
            f.degrees.toLowerCase().includes(needle)
          );
        });

    rows = rows.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          break;
        case 'department':
          cmp = a.department.localeCompare(b.department);
          break;
        case 'rank':
          cmp = a.rank.localeCompare(b.rank);
          break;
        case 'sessions':
          cmp = a.sessions - b.sessions;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [initialFaculty, q, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'sessions' ? 'desc' : 'asc'); }
  };

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <span style={{ opacity: 0.3 }}> ⇅</span>;
    return sortDir === 'asc' ? <span> ↑</span> : <span> ↓</span>;
  };

  const exportCSV = () => {
    const lines = ['"Last Name","First Name","Degrees","Department","Rank","Sessions Attended"'];
    for (const f of filteredSorted) {
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      lines.push([esc(f.lastName), esc(f.firstName), esc(f.degrees), esc(f.department), esc(f.rank), f.sessions].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `directory_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <>
      <div style={{ paddingBottom: 20 }}>
        <Link href="/" style={{ color: 'var(--c5)', textDecoration: 'none', fontWeight: 'bold' }}>
          ← Back to Master Overview
        </Link>
      </div>

      <div className="sec">Canonical Faculty Directory</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 14 }}>
        Directory securely mirrors the verified Cloud Database. Showing{' '}
        <strong>{filteredSorted.length}</strong> of <strong>{initialFaculty.length}</strong> verified
        faculty with attendance.
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, department, rank, or degree…"
          style={{
            flex: '1 1 280px', minWidth: 0,
            padding: '10px 14px', fontSize: '0.95rem',
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'white', fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={exportCSV}
          style={{
            padding: '10px 16px', background: '#e0fbfe', color: '#097c87',
            border: '1px solid #bcebec', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
          }}
        >
          ⬇ Export CSV ({filteredSorted.length})
        </button>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c1d)', color: 'white' }}>
                <th style={th} onClick={() => toggleSort('name')}>Name{sortIcon('name')}</th>
                <th style={th}>Degrees</th>
                <th style={th} onClick={() => toggleSort('department')}>Department{sortIcon('department')}</th>
                <th style={th} onClick={() => toggleSort('rank')}>Rank{sortIcon('rank')}</th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('sessions')}>Sessions{sortIcon('sessions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No matches.</td></tr>
              ) : filteredSorted.map((f, i) => (
                <tr key={f.id} style={{ background: i % 2 ? '#fafcfc' : 'white', borderTop: '1px solid var(--border)' }}>
                  <td style={td}><strong>{f.lastName}</strong>, {f.firstName}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{f.degrees || <em style={{ color: '#cbd5e1' }}>—</em>}</td>
                  <td style={td}>{f.department}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{f.rank}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: f.sessions > 0 ? 'var(--c1)' : 'var(--muted)' }}>{f.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  padding: '10px 14px', fontSize: '0.78rem', textTransform: 'uppercase',
  letterSpacing: '0.4px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };

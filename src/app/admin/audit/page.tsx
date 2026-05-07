'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Session {
  id: string; name: string; facultyId: string; facultyName: string;
  attemptCount: number; genuineCount: number; imposterCount: number;
  notes: string | null;
  createdAt: string; closedAt: string | null;
}
interface Faculty { id: string; name: string; baselineCount: number; }

export default function AuditListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [name, setName] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    const [s, f] = await Promise.all([
      fetch('/api/admin/audit/sessions').then(r => r.json()).catch(() => ({ sessions: [] })),
      fetch('/api/admin/signature-trainer').then(r => r.json()).catch(() => ({ faculty: [] })),
    ]);
    setSessions(s.sessions || []);
    setFaculty((f.faculty || []).filter((x: any) => x.baselineCount > 0));
  };
  useEffect(() => { reload(); }, []);

  const create = async () => {
    setErr(null);
    if (!name.trim() || !facultyId) {
      setErr('Pick a faculty and give the session a name.');
      return;
    }
    setCreating(true);
    try {
      const r = await fetch('/api/admin/audit/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), facultyId, notes: notes.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed');
      router.push(`/admin/audit/${j.id}`);
    } catch (e: any) {
      setErr(e?.message || 'Failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <Link href="/" style={{ display: 'inline-block', marginBottom: 16, padding: '8px 14px', background: 'var(--c1)', color: 'white', borderRadius: 6, textDecoration: 'none', fontWeight: 'bold' }}>
        ← Back to Dashboard
      </Link>

      <h1 style={{ fontSize: '1.6rem', fontFamily: '"Garamond", "EB Garamond", serif', marginBottom: 6 }}>
        Verification Audit
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 22, fontSize: '0.92rem' }}>
        Run a controlled accuracy test of the biometric signature system.
        Record genuine attempts (the real person signs) and imposter attempts
        (someone else signs as them) and the system computes False Accept
        Rate, False Reject Rate, and accuracy. Export as PDF for your
        CME committee.
      </p>

      {/* New session form */}
      <section style={card}>
        <h2 style={h2}>Start a new audit session</h2>
        {err && <div style={errBox}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>Session name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. CME Committee Demo — May 2026"
                   style={inp} />
          </div>
          <div>
            <label style={lbl}>Audit subject (must have baseline)</label>
            <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} style={inp}>
              <option value="">— Pick faculty —</option>
              {faculty.map(f => (
                <option key={f.id} value={f.id}>{f.name} · {f.baselineCount} sample{f.baselineCount === 1 ? '' : 's'}</option>
              ))}
            </select>
            {faculty.length === 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
                No faculty have a baseline yet. Visit ✍️ Train Signatures first.
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    placeholder="e.g. Demo for CME approval, 5 genuine + 5 imposter attempts."
                    style={{ ...inp, fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={create} disabled={creating}
                  style={{ ...btn, background: creating ? '#999' : 'var(--c1)', color: 'white' }}>
            {creating ? 'Creating…' : 'Start session →'}
          </button>
        </div>
      </section>

      {/* Recent sessions */}
      <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '20px 0 10px' }}>
        Recent sessions
      </h2>
      {sessions.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
          No audit sessions yet.
        </div>
      ) : (
        <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead style={{ background: 'var(--c1d)', color: 'white' }}>
              <tr>
                <th style={th}>Session</th>
                <th style={th}>Audited subject</th>
                <th style={{ ...th, textAlign: 'right' }}>Genuine</th>
                <th style={{ ...th, textAlign: 'right' }}>Imposter</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Status</th>
                <th style={{ ...th, width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? '#fafcfc' : 'white' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{new Date(s.createdAt).toLocaleString()}</div>
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{s.facultyName}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{s.genuineCount}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{s.imposterCount}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{s.attemptCount}</td>
                  <td style={td}>
                    {s.closedAt
                      ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>Closed</span>
                      : <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>Open</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/admin/audit/${s.id}`}
                          style={{ display: 'inline-block', padding: '6px 12px', background: 'var(--c1)', color: 'white', textDecoration: 'none', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600 }}>
                      Open
                    </Link>
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

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, boxShadow: 'var(--shadow)', marginBottom: 14 };
const h2:   React.CSSProperties = { fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 };
const lbl:  React.CSSProperties = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' };
const inp:  React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.95rem', background: 'white', boxSizing: 'border-box' };
const errBox: React.CSSProperties = { background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b', padding: 10, borderRadius: 8, marginBottom: 12, fontWeight: 600 };
const btn:  React.CSSProperties = { padding: '10px 18px', borderRadius: 6, fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit' };
const th:   React.CSSProperties = { padding: '10px 14px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.4px' };
const td:   React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };

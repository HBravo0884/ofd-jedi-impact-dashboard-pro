'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Candidate {
  facultyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  department: string;
  attendances: number;
  score: number;
  reasons: string[];
}

interface PendingItem {
  pending: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    aliases: string[];
    degrees: string[];
    department: string;
    division: string | null;
    attendances: number;
    createdAt: string;
  };
  candidates: Candidate[];
}

export default function QuarantineClient() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'with-suggestions' | 'no-suggestions'>('all');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/quarantine');
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setItems(j.items || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load quarantine.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const mergeInto = async (sourceId: string, targetId: string, sourceDisplay: string, targetDisplay: string) => {
    if (!confirm(`Merge "${sourceDisplay}" → "${targetDisplay}"? Source profile will be deleted; attendances move to target.`)) return;
    setBusyId(sourceId);
    setErrorMsg(null);
    try {
      const r = await fetch('/api/admin/faculty/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setFlash(`Merged "${j.sourceName || sourceDisplay}" into "${targetDisplay}" — ${j.movedAttendances ?? 0} moved, ${j.mergedConflicts ?? 0} summed.`);
      setTimeout(() => setFlash(null), 5000);
      // Remove the resolved pending from local state immediately
      setItems((prev) => prev.filter((x) => x.pending.id !== sourceId));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Merge failed.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmAsNew = async (pendingId: string, display: string) => {
    if (!confirm(`Mark "${display}" as a verified new faculty? (Status changes to VERIFIED — no merge happens.)`)) return;
    setBusyId(pendingId);
    setErrorMsg(null);
    try {
      const r = await fetch(`/api/admin/faculty/${encodeURIComponent(pendingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'VERIFIED' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setFlash(`"${display}" confirmed as verified.`);
      setTimeout(() => setFlash(null), 4000);
      setItems((prev) => prev.filter((x) => x.pending.id !== pendingId));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Status update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = items.filter((it) => {
    if (filter === 'with-suggestions') return it.candidates.length > 0;
    if (filter === 'no-suggestions')   return it.candidates.length === 0;
    return true;
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <Link href="/" style={{
        display: 'inline-block', marginBottom: 16, padding: '8px 14px',
        background: 'var(--c1)', color: 'white', borderRadius: 6,
        textDecoration: 'none', fontWeight: 'bold',
      }}>← Back to Dashboard</Link>

      <h1 style={{ fontSize: '1.6rem', fontFamily: '"Garamond", "EB Garamond", serif', marginBottom: 6 }}>
        Quarantine — Pending Profile Adjudication
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 18, fontSize: '0.92rem' }}>
        Pending profiles were auto-created during ingest when a Zoom row didn't match
        any verified faculty. Review each one: <strong>merge</strong> into the suggested
        existing profile, or <strong>confirm as a new verified faculty</strong>.
      </p>

      {flash && (
        <div style={{
          background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.88rem', fontWeight: 600,
        }}>✅ {flash}</div>
      )}
      {errorMsg && (
        <div style={{
          background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b',
          padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.88rem', fontWeight: 600,
        }}>
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} style={{
            float: 'right', background: 'transparent', border: 'none',
            color: '#991b1b', cursor: 'pointer', fontWeight: 700,
          }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
          <strong>{items.length}</strong> pending {items.length === 1 ? 'profile' : 'profiles'}
          {filter !== 'all' && (
            <span> · showing <strong>{filtered.length}</strong></span>
          )}
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}
                style={{
                  padding: '8px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', fontFamily: 'inherit',
                  fontSize: '0.85rem', background: 'white',
                }}>
          <option value="all">All pending</option>
          <option value="with-suggestions">With suggestions only</option>
          <option value="no-suggestions">No suggestions only (likely unique)</option>
        </select>
        <button onClick={reload} disabled={loading} style={{
          padding: '8px 14px', background: 'transparent', color: 'var(--c1d)',
          border: '1px solid var(--c1d)', borderRadius: 6, fontWeight: 600,
          fontSize: '0.85rem', cursor: 'pointer',
        }}>{loading ? 'Loading…' : '↻ Refresh'}</button>
        <Link href="/directory" style={{
          marginLeft: 'auto',
          padding: '8px 14px', background: 'transparent', color: 'var(--c1d)',
          border: '1px solid var(--c1d)', borderRadius: 6, fontWeight: 600,
          fontSize: '0.85rem', textDecoration: 'none',
        }}>Open Directory →</Link>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center', background: '#f0fdf4',
          border: '1px solid #86efac', borderRadius: 10, color: '#166534',
        }}>
          🎉 {items.length === 0 ? 'No pending profiles to adjudicate. Quarantine is empty.' : 'No items match this filter.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {filtered.map((it) => {
            const display = `${it.pending.firstName} ${it.pending.lastName}`.trim();
            const isBusy = busyId === it.pending.id;
            return (
              <div key={it.pending.id} style={{
                background: 'white', border: '1px solid var(--border)',
                borderRadius: 10, padding: 14,
                opacity: isBusy ? 0.6 : 1, transition: 'opacity 0.2s',
              }}>
                {/* Pending header */}
                <div style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed var(--border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--c1d)' }}>
                      {display}
                      <span style={{
                        marginLeft: 8, padding: '2px 8px', background: '#fef3c7',
                        color: '#854d0e', borderRadius: 999, fontSize: '0.7rem',
                        fontWeight: 700, verticalAlign: 'middle',
                      }}>pending</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                      {it.pending.email.startsWith('phantom_')
                        ? <em>(phantom email — no real address on file)</em>
                        : it.pending.email}
                      {' · '}{it.pending.attendances} attendance{it.pending.attendances === 1 ? '' : 's'}
                      {' · created '}{it.pending.createdAt.slice(0, 10)}
                    </div>
                    {it.pending.aliases.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--muted)' }}>Learned aliases:</span>{' '}
                        {it.pending.aliases.slice(0, 6).map((a, i) => (
                          <span key={i} style={{
                            display: 'inline-block', padding: '1px 6px', margin: '1px 4px 1px 0',
                            background: '#f1f5f9', borderRadius: 999, fontSize: '0.72rem',
                          }}>{a}</span>
                        ))}
                        {it.pending.aliases.length > 6 && (
                          <span style={{ color: 'var(--muted)' }}>+{it.pending.aliases.length - 6} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => confirmAsNew(it.pending.id, display)} disabled={isBusy}
                          style={{
                            padding: '6px 12px', borderRadius: 6, fontWeight: 700,
                            fontSize: '0.78rem', cursor: 'pointer',
                            background: 'white', color: '#065e68',
                            border: '1px solid #bcebec', whiteSpace: 'nowrap',
                          }}
                          title="This really is a unique new person — promote status to VERIFIED. No merge.">
                    ✓ Confirm as new
                  </button>
                </div>

                {/* Suggested matches */}
                {it.candidates.length === 0 ? (
                  <div style={{
                    padding: 12, background: '#f8fafc', color: '#64748b',
                    fontSize: '0.85rem', borderRadius: 6, fontStyle: 'italic',
                  }}>
                    No similar verified faculty found. Likely a genuinely new person — use "Confirm as new" above.
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase',
                                  letterSpacing: '0.4px', fontWeight: 700, marginBottom: 8 }}>
                      Likely matches
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {it.candidates.map((c) => {
                        const tDisplay = `${c.firstName} ${c.lastName}`.trim();
                        const pct = Math.round(c.score * 100);
                        const tone = pct >= 80 ? 'high' : pct >= 60 ? 'med' : 'low';
                        const palette =
                          tone === 'high' ? { bg: '#dcfce7', fg: '#166534', bar: '#16a34a' } :
                          tone === 'med'  ? { bg: '#fef3c7', fg: '#854d0e', bar: '#d97706' } :
                                            { bg: '#f1f5f9', fg: '#475569', bar: '#94a3b8' };
                        return (
                          <div key={c.facultyId} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12, padding: 10,
                            background: palette.bg, border: `1px solid ${palette.bar}55`, borderRadius: 8,
                          }}>
                            <div style={{
                              minWidth: 50, fontWeight: 900, fontSize: '1.1rem',
                              color: palette.fg, textAlign: 'right', paddingTop: 2,
                            }}>{pct}%</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#0d2e32', fontSize: '0.95rem' }}>
                                {tDisplay}
                                {c.department && c.department !== 'Other' && (
                                  <span style={{ color: '#475569', fontWeight: 500, marginLeft: 6 }}>
                                    · {c.department.replace(/([A-Z])/g, ' $1').trim()}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                                {c.email || <em>(no email)</em>}
                                {' · '}{c.attendances} attendance{c.attendances === 1 ? '' : 's'}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: palette.fg, marginTop: 4 }}>
                                {c.reasons.join(' · ')}
                              </div>
                            </div>
                            <button onClick={() => mergeInto(it.pending.id, c.facultyId, display, tDisplay)}
                                    disabled={isBusy}
                                    style={{
                                      padding: '7px 14px', borderRadius: 6, fontWeight: 700,
                                      fontSize: '0.8rem', cursor: 'pointer',
                                      background: palette.bar, color: 'white',
                                      border: 'none', whiteSpace: 'nowrap',
                                    }}>
                              → Merge into this
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

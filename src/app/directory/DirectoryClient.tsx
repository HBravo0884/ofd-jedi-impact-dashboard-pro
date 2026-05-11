'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

interface FacultyRow {
  id: string;
  lastName: string;
  firstName: string;
  email: string;
  department: string;       // humanized
  departmentRaw: string;    // enum value (for submit)
  division: string;
  rank: string;             // humanized
  rankRaw: string;          // enum value (for submit)
  degrees: string[];
  aliases: string[];
  adminTitle: string;       // NEW: 'Director of Procurement', 'Clinical Assistant Professor', etc.
  positionType: string;     // NEW: 'Basic Science Faculty', 'Clinical Faculty', etc.
  status: string;
  sessions: number;
}

type SortKey = 'name' | 'department' | 'rank' | 'sessions';

// Match Prisma enums (must be kept in sync if schema changes)
const DEPARTMENT_OPTIONS = [
  'Anatomy', 'Biochemistry', 'Microbiology', 'Pathology', 'Pharmacology',
  'Physiology', 'Anesthesiology', 'CommunityFamilyMedicine', 'Dermatology',
  'Medicine', 'Neurology', 'ObstetricsGynecology', 'Ophthalmology',
  'OrthopaedicSurgery', 'Pediatrics', 'Psychiatry', 'RadiationOncology',
  'Radiology', 'Surgery', 'MedicalEducation', 'Administration',
  'Student', 'Other',
];
const RANK_OPTIONS = [
  'Instructor', 'AssistantProfessor', 'AssociateProfessor', 'Professor',
  'Staff', 'Faculty', 'Student', 'Unknown',
];
const STATUS_OPTIONS = ['VERIFIED', 'PENDING_RESOLUTION'];

export default function DirectoryClient({
  initialFaculty,
  isAdmin,
}: {
  initialFaculty: FacultyRow[];
  isAdmin: boolean;
}) {
  const [faculty, setFaculty] = useState<FacultyRow[]>(initialFaculty);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');

  // Edit modal
  const [editing, setEditing] = useState<FacultyRow | null>(null);
  const [editDraft, setEditDraft] = useState<FacultyRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Merge modal
  const [merging, setMerging] = useState<FacultyRow | null>(null);
  const [mergeTargetQ, setMergeTargetQ] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [mergingNow, setMergingNow] = useState(false);

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredSorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = faculty.filter((f) => {
      if (statusFilter === 'verified' && f.status !== 'VERIFIED') return false;
      if (statusFilter === 'pending' && f.status !== 'PENDING_RESOLUTION') return false;
      return true;
    });
    if (needle) {
      rows = rows.filter((f) =>
        f.lastName.toLowerCase().includes(needle) ||
        f.firstName.toLowerCase().includes(needle) ||
        f.department.toLowerCase().includes(needle) ||
        f.rank.toLowerCase().includes(needle) ||
        (f.degrees.join(',')).toLowerCase().includes(needle) ||
        (f.aliases.join(',')).toLowerCase().includes(needle) ||
        f.email.toLowerCase().includes(needle) ||
        f.adminTitle.toLowerCase().includes(needle) ||
        f.positionType.toLowerCase().includes(needle)
      );
    }
    rows = rows.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':       cmp = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName); break;
        case 'department': cmp = a.department.localeCompare(b.department); break;
        case 'rank':       cmp = a.rank.localeCompare(b.rank); break;
        case 'sessions':   cmp = a.sessions - b.sessions; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [faculty, q, sortKey, sortDir, statusFilter]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'sessions' ? 'desc' : 'asc'); }
  };
  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <span style={{ opacity: 0.3 }}> ⇅</span>;
    return sortDir === 'asc' ? <span> ↑</span> : <span> ↓</span>;
  };

  const exportCSV = () => {
    const header = ['Last Name','First Name','Email','Title','Position Type','Degrees','Aliases','Department','Division','Rank','Status','Sessions Attended'];
    const lines = [header.map(escapeCsv).join(',')];
    for (const f of filteredSorted) {
      lines.push([
        f.lastName, f.firstName, f.email,
        f.adminTitle, f.positionType,
        f.degrees.join('; '), f.aliases.join('; '),
        f.department, f.division, f.rank, f.status, f.sessions,
      ].map(escapeCsv).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `directory_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── Edit handlers ───────────────────────────────────────────────────────
  const openEdit = (f: FacultyRow) => {
    setEditing(f);
    setEditDraft({ ...f, degrees: [...f.degrees], aliases: [...f.aliases] });
    setErrorMessage(null);
  };
  const closeEdit = () => { setEditing(null); setEditDraft(null); };
  const saveEdit = async () => {
    if (!editing || !editDraft) return;
    setSavingEdit(true);
    setErrorMessage(null);
    try {
      const r = await fetch(`/api/admin/faculty/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editDraft.firstName,
          lastName:  editDraft.lastName,
          email:     editDraft.email,
          department: editDraft.departmentRaw,
          division:  editDraft.division || null,
          rank:      editDraft.rankRaw,
          status:    editDraft.status,
          aliases:   editDraft.aliases,
          degrees:   editDraft.degrees,
          adminTitle: editDraft.adminTitle || null,
          positionType: editDraft.positionType || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setFaculty((rows) => rows.map((row) =>
        row.id === editing.id
          ? {
              ...row,
              firstName: editDraft.firstName,
              lastName:  editDraft.lastName,
              email:     editDraft.email,
              department: String(editDraft.departmentRaw).replace(/([A-Z])/g, ' $1').trim(),
              departmentRaw: editDraft.departmentRaw,
              division:  editDraft.division,
              rank:      String(editDraft.rankRaw).replace(/([A-Z])/g, ' $1').trim(),
              rankRaw:   editDraft.rankRaw,
              aliases:   editDraft.aliases,
              degrees:   editDraft.degrees,
              adminTitle: editDraft.adminTitle,
              positionType: editDraft.positionType,
              status:    editDraft.status,
            }
          : row
      ));
      setFlashMessage(`Saved ${editDraft.lastName}, ${editDraft.firstName}.`);
      setTimeout(() => setFlashMessage(null), 3500);
      closeEdit();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Save failed.');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Merge handlers ──────────────────────────────────────────────────────
  const openMerge = (f: FacultyRow) => {
    setMerging(f);
    setMergeTargetQ('');
    setMergeTargetId('');
    setErrorMessage(null);
  };
  const closeMerge = () => { setMerging(null); setMergeTargetId(''); setMergeTargetQ(''); };
  const mergeTargetCandidates = useMemo(() => {
    if (!merging) return [];
    const needle = mergeTargetQ.trim().toLowerCase();
    return faculty
      .filter((f) => f.id !== merging.id)
      .filter((f) => !needle ||
        f.lastName.toLowerCase().includes(needle) ||
        f.firstName.toLowerCase().includes(needle) ||
        f.email.toLowerCase().includes(needle) ||
        (f.aliases.join(' ').toLowerCase().includes(needle))
      )
      .slice(0, 30);
  }, [faculty, mergeTargetQ, merging]);

  const confirmMerge = async () => {
    if (!merging || !mergeTargetId) return;
    if (!confirm(`Merge "${merging.lastName}, ${merging.firstName}" INTO the selected profile? Source profile will be DELETED. This cannot be undone from the UI.`)) return;
    setMergingNow(true);
    setErrorMessage(null);
    try {
      const r = await fetch('/api/admin/faculty/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: merging.id, targetId: mergeTargetId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      // Remove source, update target's row in local state.
      setFaculty((rows) => {
        const filtered = rows.filter((x) => x.id !== merging.id);
        return filtered.map((row) =>
          row.id === mergeTargetId
            ? {
                ...row,
                aliases:  j.target?.aliases  || row.aliases,
                degrees:  j.target?.degrees  || row.degrees,
                status:   j.target?.status   || row.status,
                sessions: j.target?._count?.attendances ?? row.sessions,
              }
            : row
        );
      });
      const target = faculty.find((x) => x.id === mergeTargetId);
      setFlashMessage(
        `Merged "${merging.lastName}, ${merging.firstName}" into ` +
        `${target ? `${target.lastName}, ${target.firstName}` : 'target'}: ` +
        `${j.movedAttendances ?? 0} attendances moved, ` +
        `${j.mergedConflicts ?? 0} duration sums.`
      );
      setTimeout(() => setFlashMessage(null), 8000);
      closeMerge();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Merge failed.');
    } finally {
      setMergingNow(false);
    }
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
        <strong>{filteredSorted.length}</strong> of <strong>{faculty.length}</strong>{' '}
        {isAdmin ? 'faculty (admin view — includes pending profiles)' : 'verified faculty with attendance'}.
      </div>

      {flashMessage && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: '0.88rem', fontWeight: 600 }}>
          ✅ {flashMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, department, rank, degree, alias, or email…"
          style={{ flex: '1 1 280px', minWidth: 0, padding: '10px 14px', fontSize: '0.95rem',
                   border: '1px solid var(--border)', borderRadius: 8, background: 'white', fontFamily: 'inherit', outline: 'none' }}
        />
        {isAdmin && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
                  style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '0.88rem' }}>
            <option value="all">All statuses</option>
            <option value="verified">Verified only</option>
            <option value="pending">Pending only</option>
          </select>
        )}
        <button onClick={exportCSV}
          style={{ padding: '10px 16px', background: '#e0fbfe', color: '#097c87', border: '1px solid #bcebec',
                   borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
          ⬇ Export CSV ({filteredSorted.length})
        </button>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c1d)', color: 'white' }}>
                <th style={th} onClick={() => toggleSort('name')}>Name{sortIcon('name')}</th>
                <th style={th}>Title</th>
                <th style={th}>Degrees</th>
                {isAdmin && <th style={th}>Aliases (learned)</th>}
                <th style={th} onClick={() => toggleSort('department')}>Department{sortIcon('department')}</th>
                <th style={th} onClick={() => toggleSort('rank')}>Rank{sortIcon('rank')}</th>
                {isAdmin && <th style={th}>Status</th>}
                <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('sessions')}>Sessions{sortIcon('sessions')}</th>
                {isAdmin && <th style={{ ...th, width: 140 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filteredSorted.length === 0 ? (
                <tr><td colSpan={isAdmin ? 9 : 6} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No matches.</td></tr>
              ) : filteredSorted.map((f, i) => (
                <tr key={f.id} style={{ background: i % 2 ? '#fafcfc' : 'white', borderTop: '1px solid var(--border)' }}>
                  <td style={td}><strong>{f.lastName}</strong>, {f.firstName}</td>
                  <td style={{ ...td, color: '#475569', fontSize: '0.85rem' }}>
                    {f.adminTitle || <em style={{ color: '#cbd5e1' }}>—</em>}
                    {f.positionType && (
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                        {f.positionType}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{f.degrees.join(', ') || <em style={{ color: '#cbd5e1' }}>—</em>}</td>
                  {isAdmin && (
                    <td style={{ ...td, color: '#64748b', fontSize: '0.78rem', maxWidth: 240 }}>
                      {f.aliases.length === 0 ? <em style={{ color: '#cbd5e1' }}>—</em> :
                        f.aliases.slice(0, 4).map((a, idx) => (
                          <span key={idx} style={{ display: 'inline-block', padding: '1px 6px', margin: '1px 3px 1px 0',
                                                   background: '#f1f5f9', borderRadius: 999, fontSize: '0.72rem' }}>{a}</span>
                        ))}
                      {f.aliases.length > 4 && <span style={{ marginLeft: 4 }}>+ {f.aliases.length - 4}</span>}
                    </td>
                  )}
                  <td style={td}>{f.department}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{f.rank}</td>
                  {isAdmin && (
                    <td style={td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                        background: f.status === 'VERIFIED' ? '#dcfce7' : '#fef3c7',
                        color: f.status === 'VERIFIED' ? '#166534' : '#854d0e',
                      }}>{f.status === 'VERIFIED' ? 'verified' : 'pending'}</span>
                    </td>
                  )}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: f.sessions > 0 ? 'var(--c1)' : 'var(--muted)' }}>{f.sessions}</td>
                  {isAdmin && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(f)} style={miniBtn} title="Edit name, aliases, department, status">
                        Edit
                      </button>
                      <button onClick={() => openMerge(f)} style={{ ...miniBtn, marginLeft: 4, borderColor: '#fcd34d', color: '#854d0e' }}
                              title="Merge this profile into another (e.g. consolidate duplicates)">
                        Merge
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EDIT MODAL ───────────────────────────────────────────────────── */}
      {editing && editDraft && (
        <Modal title={`Edit ${editing.lastName}, ${editing.firstName}`} onClose={savingEdit ? undefined : closeEdit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First name"><input type="text" value={editDraft.firstName}
              onChange={(e) => setEditDraft({ ...editDraft, firstName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Last name"><input type="text" value={editDraft.lastName}
              onChange={(e) => setEditDraft({ ...editDraft, lastName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Email"><input type="email" value={editDraft.email}
              onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={editDraft.status}
                      onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value })} style={inputStyle}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select value={editDraft.departmentRaw}
                      onChange={(e) => setEditDraft({ ...editDraft, departmentRaw: e.target.value })} style={inputStyle}>
                {DEPARTMENT_OPTIONS.map((d) =>
                  <option key={d} value={d}>{d.replace(/([A-Z])/g, ' $1').trim()}</option>)}
              </select>
            </Field>
            <Field label="Rank">
              <select value={editDraft.rankRaw}
                      onChange={(e) => setEditDraft({ ...editDraft, rankRaw: e.target.value })} style={inputStyle}>
                {RANK_OPTIONS.map((r) =>
                  <option key={r} value={r}>{r.replace(/([A-Z])/g, ' $1').trim()}</option>)}
              </select>
            </Field>
            <Field label="Division">
              <input type="text" value={editDraft.division}
                     onChange={(e) => setEditDraft({ ...editDraft, division: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Title (e.g. 'Clinical Assistant Professor', 'Director of Finance')">
              <input type="text" value={editDraft.adminTitle}
                     onChange={(e) => setEditDraft({ ...editDraft, adminTitle: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Position type (e.g. 'Basic Science Faculty', 'Clinical Faculty')">
              <input type="text" value={editDraft.positionType}
                     onChange={(e) => setEditDraft({ ...editDraft, positionType: e.target.value })} style={inputStyle} />
            </Field>
          </div>

          <TokenEditor label="Degrees"
            tokens={editDraft.degrees}
            onChange={(next) => setEditDraft({ ...editDraft, degrees: next })}
            placeholder="e.g. MD, PhD" />

          <TokenEditor label="Aliases (learned name variants — used by T3 fuzzy matcher)"
            tokens={editDraft.aliases}
            onChange={(next) => setEditDraft({ ...editDraft, aliases: next })}
            placeholder="e.g. Dr. S. Nandi, S Nandi (Host)" />

          {errorMessage && <div style={errorBox}>{errorMessage}</div>}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={closeEdit} disabled={savingEdit} style={btnGhost}>Cancel</button>
            <button onClick={saveEdit}  disabled={savingEdit} style={btnPrimary}>
              {savingEdit ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MERGE MODAL ──────────────────────────────────────────────────── */}
      {merging && (
        <Modal title={`Merge ${merging.lastName}, ${merging.firstName} into…`} onClose={mergingNow ? undefined : closeMerge}>
          <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 12px' }}>
            All attendances + aliases + degrees + signatures from{' '}
            <strong>{merging.lastName}, {merging.firstName}</strong> ({merging.sessions} sessions)
            will be moved into the profile you pick. Duration conflicts on the same event are SUMMED.
            The source profile is then deleted.
          </p>
          <input type="search" value={mergeTargetQ}
                 onChange={(e) => { setMergeTargetQ(e.target.value); setMergeTargetId(''); }}
                 placeholder="Search target by name, email, or alias…"
                 style={{ ...inputStyle, marginBottom: 12 }} autoFocus />
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {mergeTargetCandidates.length === 0 ? (
              <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>No matching faculty.</div>
            ) : mergeTargetCandidates.map((c) => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background: mergeTargetId === c.id ? '#fef3c7' : 'white',
              }}>
                <input type="radio" name="merge-target" checked={mergeTargetId === c.id}
                       onChange={() => setMergeTargetId(c.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.lastName}, {c.firstName}</div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {c.department} · {c.rank} · {c.sessions} session{c.sessions === 1 ? '' : 's'}
                    {c.status !== 'VERIFIED' && <span style={{ color: '#854d0e', marginLeft: 6 }}>[pending]</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {errorMessage && <div style={errorBox}>{errorMessage}</div>}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={closeMerge} disabled={mergingNow} style={btnGhost}>Cancel</button>
            <button onClick={confirmMerge} disabled={mergingNow || !mergeTargetId}
                    style={{ ...btnPrimary, background: mergingNow || !mergeTargetId ? '#999' : '#dc2626' }}
                    title="Move all attendances and aliases from source to target, then delete source.">
              {mergingNow ? 'Merging…' : 'Confirm merge'}
            </button>
          </div>
        </Modal>
      )}
    </>
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
        fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)',
        marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>{label}</div>
      {children}
    </div>
  );
}

function TokenEditor({
  label, tokens, onChange, placeholder,
}: {
  label: string; tokens: string[];
  onChange: (next: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const addToken = () => {
    const t = input.trim();
    if (!t || tokens.includes(t)) { setInput(''); return; }
    onChange([...tokens, t]);
    setInput('');
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)',
        marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px',
      }}>{label}</div>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6, padding: '4px 6px',
        background: 'white', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
      }}>
        {tokens.map((t, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', background: '#e0f7f9', color: '#065e68',
            borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
          }}>
            {t}
            <button onClick={() => onChange(tokens.filter((_, idx) => idx !== i))}
                    style={{ background: 'transparent', border: 'none', color: '#065e68', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                    title="Remove">×</button>
          </span>
        ))}
        <input type="text" value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addToken(); } }}
               placeholder={placeholder}
               style={{ flex: '1 1 120px', minWidth: 80, border: 'none', outline: 'none',
                        fontSize: '0.85rem', padding: '4px', fontFamily: 'inherit', background: 'transparent' }} />
      </div>
    </div>
  );
}

function escapeCsv(s: any): string {
  const v = String(s ?? '');
  return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ─── Styles ────────────────────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: '10px 14px', fontSize: '0.78rem', textTransform: 'uppercase',
  letterSpacing: '0.4px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit', background: 'white',
};
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
const errorBox: React.CSSProperties = {
  marginTop: 12, padding: 10, background: '#fff0f0', border: '1px solid #fecaca',
  color: '#991b1b', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
};

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SignaturePad from 'signature_pad';

interface FacultyRow {
  id: string;
  name: string;
  dept: string;
  degrees: string[];
  isClinician: boolean;
  baselineCount: number;
}

const TARGET_SAMPLES = 3; // capture 3 signatures per training session

export default function SignatureTrainerPage() {
  const [searchQ, setSearchQ] = useState('');
  const [faculty, setFaculty] = useState<FacultyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<FacultyRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [samplesCaptured, setSamplesCaptured] = useState(0);
  const [hasInk, setHasInk] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigPad = useRef<SignaturePad | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search faculty ──────────────────────────────────────────────────────
  const reload = async (q = '') => {
    setLoading(true);
    try {
      const url = '/api/admin/signature-trainer' + (q ? '?q=' + encodeURIComponent(q) : '');
      const r = await fetch(url);
      const j = await r.json();
      setFaculty(j.faculty || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => reload(searchQ), 220);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ]);

  // ── Mount signature pad whenever a faculty is being trained ────────────
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const pad = new SignaturePad(canvas, {
      minWidth: 1.5,
      maxWidth: 4.5,
      penColor: 'rgb(15, 30, 45)',
    });
    sigPad.current = pad;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(ratio, ratio);
      pad.clear();
      setHasInk(false);
    };
    window.addEventListener('resize', resize);
    resize();
    pad.addEventListener('endStroke', () => setHasInk(!pad.isEmpty()));
    return () => { window.removeEventListener('resize', resize); pad.off(); };
  }, [active]);

  // ── Capture one sample ─────────────────────────────────────────────────
  const submitSample = async () => {
    if (!active || !sigPad.current || sigPad.current.isEmpty()) {
      setErrorMessage('Sign the canvas first.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const trace = sigPad.current.toData();
      const r = await fetch('/api/admin/signature-trainer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facultyId: active.id, signatureTrace: trace }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      sigPad.current.clear();
      setHasInk(false);
      setSamplesCaptured((n) => n + 1);
      // Update local row baseline count
      setFaculty((rows) => rows.map((row) => row.id === active.id ? { ...row, baselineCount: j.baselineCount } : row));
      if (samplesCaptured + 1 >= TARGET_SAMPLES) {
        setSuccessMessage(`✅ Trained! ${active.name} now has ${j.baselineCount} baseline samples.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save signature.');
    } finally {
      setSubmitting(false);
    }
  };

  const clearBaseline = async () => {
    if (!active) return;
    if (!confirm(`Clear ALL baseline signatures for ${active.name}? They'll need to retrain from scratch.`)) return;
    const r = await fetch('/api/admin/signature-trainer?id=' + encodeURIComponent(active.id), { method: 'DELETE' });
    if (!r.ok) {
      setErrorMessage('Could not clear baseline.');
      return;
    }
    setFaculty((rows) => rows.map((row) => row.id === active.id ? { ...row, baselineCount: 0 } : row));
    setActive((a) => a ? { ...a, baselineCount: 0 } : a);
    setSamplesCaptured(0);
    setSuccessMessage('Baseline cleared.');
  };

  const startTraining = (f: FacultyRow) => {
    setActive(f);
    setSamplesCaptured(0);
    setErrorMessage(null);
    setSuccessMessage(null);
    setHasInk(false);
  };
  const finishTraining = () => {
    setActive(null);
    setSamplesCaptured(0);
    setHasInk(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    reload(searchQ);
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
        Signature Trainer
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 22, fontSize: '0.92rem' }}>
        Capture baseline signatures so the kiosk can biometrically verify check-ins via DTW.
        Three samples per person is enough; the system uses best-of-N to score future submissions.
      </p>

      {!active && (
        <>
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search faculty by first or last name…"
            style={{
              width: '100%', padding: 12, border: '1px solid var(--border)',
              borderRadius: 8, fontSize: '1rem', marginBottom: 14, fontFamily: 'inherit',
            }}
          />

          {loading ? (
            <div style={{ color: 'var(--muted)' }}>Loading…</div>
          ) : faculty.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: 16 }}>No faculty match.</div>
          ) : (
            <div className="table-scroll" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead style={{ background: 'var(--c1d)', color: 'white' }}>
                  <tr>
                    <th style={th}>Name</th>
                    <th style={th}>Department</th>
                    <th style={th}>Degrees</th>
                    <th style={{ ...th, textAlign: 'center' }}>Clinician?</th>
                    <th style={{ ...th, textAlign: 'right' }}>Baseline</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.map((f, i) => (
                    <tr key={f.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? '#fafcfc' : 'white' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{f.name}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{f.dept}</td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{(f.degrees || []).join(', ') || <em>—</em>}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {f.isClinician
                          ? <span style={chip('#fee2e2', '#991b1b')}>Required</span>
                          : <span style={chip('#e0f2f1', '#065e68')}>Optional</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: f.baselineCount > 0 ? '#047857' : 'var(--muted)' }}>
                        {f.baselineCount > 0 ? `${f.baselineCount} sample${f.baselineCount === 1 ? '' : 's'}` : 'None'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          onClick={() => startTraining(f)}
                          style={{ background: 'var(--c1)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          {f.baselineCount > 0 ? 'Add samples' : 'Train'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {active && (
        <div style={{ background: 'var(--card)', padding: 'clamp(16px, 3vw, 28px)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', borderTop: '5px solid var(--c1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', color: 'var(--c1d)', margin: 0 }}>{active.name}</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
                {active.dept}{active.degrees.length ? ' · ' + active.degrees.join(', ') : ''}
                {active.isClinician
                  ? <span style={{ ...chip('#fee2e2', '#991b1b'), marginLeft: 8 }}>Clinician — required to sign at check-in</span>
                  : <span style={{ ...chip('#e0f2f1', '#065e68'), marginLeft: 8 }}>Non-clinician — signature optional at check-in</span>}
              </p>
            </div>
            <button
              onClick={finishTraining}
              style={{ background: 'transparent', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
            >
              ← Back to list
            </button>
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center' }}>
            {Array.from({ length: TARGET_SAMPLES }).map((_, i) => (
              <span
                key={i}
                title={`Sample ${i + 1}`}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: i < samplesCaptured ? '#047857' : '#e2e8f0',
                  border: i < samplesCaptured ? 'none' : '1px solid #cbd5e1',
                  transition: '0.15s',
                }}
              />
            ))}
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: 4 }}>
              {samplesCaptured} / {TARGET_SAMPLES} captured this session · {active.baselineCount} total in baseline
            </span>
          </div>

          {/* Signature pad */}
          <div style={{ width: '100%', border: '3px dashed #cbd5e1', borderRadius: 12, background: '#fff', position: 'relative', overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 'clamp(220px, 36vw, 320px)', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
            />
            {!hasInk && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'rgba(13, 46, 50, 0.18)', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', transform: 'rotate(-8deg)' }}>
                SIGN HERE ✎
              </div>
            )}
          </div>

          {errorMessage && (
            <div style={{ background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b', padding: 10, borderRadius: 8, margin: '12px 0', fontWeight: 600 }}>
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: 10, borderRadius: 8, margin: '12px 0', fontWeight: 600 }}>
              {successMessage}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { sigPad.current?.clear(); setHasInk(false); }}
                disabled={submitting}
                style={btn('var(--bg)', 'var(--muted)')}
              >
                Clear pad
              </button>
              {active.baselineCount > 0 && (
                <button
                  onClick={clearBaseline}
                  disabled={submitting}
                  style={btn('transparent', '#b91c1c')}
                >
                  ⚠️ Reset baseline ({active.baselineCount})
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={finishTraining}
                disabled={submitting}
                style={btn('transparent', 'var(--muted)')}
              >
                Done
              </button>
              <button
                onClick={submitSample}
                disabled={submitting || !hasInk}
                style={btn('var(--c1)', 'white', 'var(--c1)')}
              >
                {submitting ? 'Saving…' : `Save sample ${samplesCaptured + 1} of ${TARGET_SAMPLES}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function chip(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 };
}
function btn(bg: string, fg: string, border = 'transparent'): React.CSSProperties {
  return {
    background: bg, color: fg, border: `1px solid ${border}`, padding: '10px 18px',
    borderRadius: 6, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
}
const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.4px' };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };

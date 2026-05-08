'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SignaturePad from 'signature_pad';

interface TestResult {
  ok: boolean;
  hasBaseline: boolean;
  facultyName: string;
  baselineCount: number;
  mlScore: number | null;
  mlAction: 'VERIFIED' | 'LIKELY_MATCH' | 'WEAK_MATCH' | 'POOR_MATCH' | 'NO_BASELINE';
  bestSampleIndex: number;
  bestDtw: number;
  perSample: Array<{
    index: number; dtw: number; confidence: number;
    dtwOnly?: number; arMul?: number; strokeMul?: number; pathMul?: number;
  }>;
  addedToBaseline?: boolean;
  newBaselineCount?: number;
}
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

  // Mode toggle: TRAIN appends to baseline, TEST scores against existing baseline (read-only).
  const [mode, setMode] = useState<'TRAIN' | 'TEST'>('TRAIN');
  // Test-mode result state.
  const [testResult, setTestResult] = useState<TestResult | null>(null);

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

  const startTraining = (f: FacultyRow, initialMode: 'TRAIN' | 'TEST' = 'TRAIN') => {
    setActive(f);
    setMode(initialMode);
    setSamplesCaptured(0);
    setErrorMessage(null);
    setSuccessMessage(null);
    setHasInk(false);
    setTestResult(null);
  };
  const finishTraining = () => {
    setActive(null);
    setSamplesCaptured(0);
    setHasInk(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTestResult(null);
    setMode('TRAIN');
    reload(searchQ);
  };

  // ── TEST MODE: score the current canvas against the baseline (read-only) ──
  const scoreSignature = async () => {
    if (!active || !sigPad.current || sigPad.current.isEmpty()) {
      setErrorMessage('Sign the canvas first.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    setTestResult(null);
    try {
      const trace = sigPad.current.toData();
      const r = await fetch('/api/admin/signature-trainer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facultyId: active.id, signatureTrace: trace }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setTestResult(j as TestResult);
      // If the server auto-enrolled this trace, reflect the new count locally
      // so the "X samples on file" hint stays accurate without a page reload.
      if (j?.addedToBaseline && active && typeof j.newBaselineCount === 'number') {
        setActive({ ...active, baselineCount: j.newBaselineCount });
        setFaculty((rows) =>
          rows.map((r) =>
            r.id === active.id ? { ...r, baselineCount: j.newBaselineCount } : r
          )
        );
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Scoring failed.');
    } finally {
      setSubmitting(false);
    }
  };
  const tryAgain = () => {
    sigPad.current?.clear();
    setHasInk(false);
    setTestResult(null);
    setErrorMessage(null);
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
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => startTraining(f, 'TRAIN')}
                            style={{ background: 'var(--c1)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            {f.baselineCount > 0 ? 'Add samples' : 'Train'}
                          </button>
                          {f.baselineCount > 0 && (
                            <button
                              onClick={() => startTraining(f, 'TEST')}
                              style={{ background: '#8b5cf6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                              title="Test a signature against this baseline (read-only, for demo)"
                            >
                              Test
                            </button>
                          )}
                        </div>
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

          {/* Mode toggle (TRAIN / TEST) */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, padding: 4, background: '#f1f5f9', borderRadius: 8, width: 'fit-content' }}>
            <button
              onClick={() => { setMode('TRAIN'); setTestResult(null); sigPad.current?.clear(); setHasInk(false); }}
              style={modeBtn(mode === 'TRAIN', 'var(--c1)')}
            >
              Train baseline
            </button>
            <button
              onClick={() => { if (active!.baselineCount === 0) { setErrorMessage('Train at least one signature before testing.'); return; } setMode('TEST'); setTestResult(null); sigPad.current?.clear(); setHasInk(false); setSamplesCaptured(0); }}
              style={modeBtn(mode === 'TEST', '#8b5cf6')}
              disabled={active!.baselineCount === 0}
              title={active!.baselineCount === 0 ? 'Need at least 1 baseline sample to test against' : undefined}
            >
              Test against baseline
            </button>
          </div>

          {/* Progress dots — only relevant in TRAIN mode */}
          {mode === 'TRAIN' && (
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
          )}

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

          {/* Test-mode result panel (only shows after scoreSignature returns) */}
          {mode === 'TEST' && testResult && (
            <TestResultPanel result={testResult} />
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { sigPad.current?.clear(); setHasInk(false); setTestResult(null); }}
                disabled={submitting}
                style={btn('var(--bg)', 'var(--muted)')}
              >
                Clear pad
              </button>
              {mode === 'TRAIN' && active.baselineCount > 0 && (
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
              {mode === 'TRAIN' ? (
                <button
                  onClick={submitSample}
                  disabled={submitting || !hasInk}
                  style={btn('var(--c1)', 'white', 'var(--c1)')}
                >
                  {submitting ? 'Saving…' : `Save sample ${samplesCaptured + 1} of ${TARGET_SAMPLES}`}
                </button>
              ) : testResult ? (
                <button
                  onClick={tryAgain}
                  disabled={submitting}
                  style={btn('#8b5cf6', 'white', '#8b5cf6')}
                >
                  Try again
                </button>
              ) : (
                <button
                  onClick={scoreSignature}
                  disabled={submitting || !hasInk}
                  style={btn('#8b5cf6', 'white', '#8b5cf6')}
                >
                  {submitting ? 'Scoring…' : 'Score signature'}
                </button>
              )}
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


// ── Test-result panel (reusable inside the active session) ────────────────
function TestResultPanel({ result }: { result: TestResult }) {
  if (!result.hasBaseline) {
    return (
      <div style={{
        marginTop: 16, padding: 16, background: '#fff7ed', border: '1px solid #fed7aa',
        color: '#9a3412', borderRadius: 10, fontSize: '0.92rem',
      }}>
        No baseline samples on file. Switch to <strong>Train baseline</strong> first.
      </div>
    );
  }
  const score = Math.round(result.mlScore || 0);
  const action = result.mlAction;
  const palette =
    action === 'VERIFIED'      ? { bg: '#dcfce7', fg: '#166534', bar: '#16a34a', icon: '🔐', label: 'VERIFIED MATCH' } :
    action === 'LIKELY_MATCH'  ? { bg: '#ecfccb', fg: '#3f6212', bar: '#65a30d', icon: '✓',  label: 'LIKELY MATCH' } :
    action === 'WEAK_MATCH'    ? { bg: '#fef9c3', fg: '#854d0e', bar: '#ca8a04', icon: '⚠️', label: 'WEAK MATCH — PLEASE VERIFY' } :
    action === 'POOR_MATCH'    ? { bg: '#fee2e2', fg: '#991b1b', bar: '#dc2626', icon: '✕',  label: 'POOR MATCH — FLAGGED' } :
                                 { bg: '#f1f5f9', fg: '#334155', bar: '#64748b', icon: '·',  label: action };

  return (
    <div style={{
      marginTop: 18, padding: 18, background: palette.bg, border: `1px solid ${palette.bar}55`,
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '2.4rem', fontWeight: 900, color: palette.fg, letterSpacing: '-0.02em' }}>
          {score}%
        </div>
        <div style={{ fontSize: '0.95rem', color: palette.fg, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {palette.icon} {palette.label}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: palette.fg, opacity: 0.75 }}>
          best of {result.baselineCount} baseline sample{result.baselineCount === 1 ? '' : 's'}
        </div>
      </div>

      {result.addedToBaseline && (
        <div
          title="This signature scored VERIFIED, so the system also added it to this faculty member's baseline. Disable in Settings."
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.6)',
            border: `1px solid ${palette.bar}`,
            borderRadius: 999,
            fontSize: '0.78rem',
            fontWeight: 700,
            color: palette.fg,
          }}
        >
          ✨ Added to baseline ({result.newBaselineCount} on file)
        </div>
      )}

      {/* Confidence gauge */}
      <div style={{ position: 'relative', height: 10, background: '#e2e8f0', borderRadius: 999, marginTop: 12, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${score}%`, background: palette.bar, transition: 'width 0.4s ease' }} />
        {/* Threshold marks at 50% and 75% */}
        <div style={{ position: 'absolute', left: '35%', top: -2, height: 14, width: 1, background: 'rgba(0,0,0,0.3)' }} />
        <div style={{ position: 'absolute', left: '55%', top: -2, height: 14, width: 1, background: 'rgba(0,0,0,0.3)' }} />
        <div style={{ position: 'absolute', left: '75%', top: -2, height: 14, width: 1, background: 'rgba(0,0,0,0.3)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: palette.fg, opacity: 0.6, marginTop: 4 }}>
        <span>0</span><span>35% weak</span><span>55% likely</span><span>75% verified</span><span>100</span>
      </div>

      {/* Per-sample breakdown — useful for live demo */}
      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: palette.fg, fontWeight: 600 }}>
          Per-sample breakdown ({result.perSample.length})
        </summary>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: '0.82rem', background: 'rgba(255,255,255,0.5)', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.06)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Sample</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }} title="Dynamic Time Warping cost. Lower = more similar path.">DTW</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }} title="Confidence from DTW alone, before structural penalties.">DTW %</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }} title="Aspect-ratio penalty multiplier.">×AR</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }} title="Stroke-count penalty multiplier.">×Strokes</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }} title="Path-length penalty multiplier.">×Length</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>Final %</th>
            </tr>
          </thead>
          <tbody>
            {result.perSample.map((row) => (
              <tr key={row.index} style={{ borderTop: '1px solid rgba(0,0,0,0.05)', fontWeight: row.index === result.bestSampleIndex ? 700 : 400 }}>
                <td style={{ padding: '6px 8px' }}>
                  #{row.index + 1}
                  {row.index === result.bestSampleIndex && <span style={{ marginLeft: 6, padding: '1px 8px', background: palette.bar, color: 'white', borderRadius: 999, fontSize: '0.7rem' }}>best</span>}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number.isFinite(row.dtw) ? row.dtw.toFixed(2) : '∞'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(row.dtwOnly ?? 0)}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{((row.arMul ?? 1) * 100).toFixed(0)}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{((row.strokeMul ?? 1) * 100).toFixed(0)}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{((row.pathMul ?? 1) * 100).toFixed(0)}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Math.round(row.confidence)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function modeBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: 'none',
    background: active ? accent : 'transparent',
    color: active ? 'white' : '#475569',
    transition: '0.15s',
  };
}
const td: React.CSSProperties = { padding: '10px 14px', fontSize: '0.9rem' };

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import SignaturePad from 'signature_pad';
import './print.css';
import { SignatureSVG } from '@/components/SignatureSVG';

type Bucket = 'VERIFIED' | 'LIKELY_MATCH' | 'WEAK_MATCH' | 'POOR_MATCH';
interface Attempt {
  id: string; label: 'GENUINE' | 'IMPOSTER';
  score: number | null; bucket: string | null;
  perSample: any; notes: string | null; createdAt: string;
}
interface SessionData {
  id: string; name: string;
  facultyId: string; facultyName: string;
  facultyDegrees: string[]; facultyDepartment: string;
  baselineCount: number;
  notes: string | null;
  createdAt: string; closedAt: string | null;
  attempts: Attempt[];
}

export default function AuditSessionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params?.id as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState<'GENUINE' | 'IMPOSTER'>('GENUINE');
  const [submitting, setSubmitting] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [lastResult, setLastResult] = useState<Attempt | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigPad = useRef<SignaturePad | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/audit/sessions/${sessionId}`);
      const j = await r.json();
      if (r.ok) setSession(j.session);
      else setErr(j?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (sessionId) reload(); /* eslint-disable-next-line */ }, [sessionId]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const pad = new SignaturePad(canvas, { minWidth: 1.5, maxWidth: 4.5, penColor: 'rgb(15, 30, 45)' });
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
  }, [session]);

  const submit = async () => {
    if (!sigPad.current || sigPad.current.isEmpty()) {
      setErr('Sign on the canvas first.');
      return;
    }
    setSubmitting(true); setErr(null);
    try {
      const trace = sigPad.current.toData();
      const r = await fetch(`/api/admin/audit/sessions/${sessionId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, signatureTrace: trace }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed');
      setLastResult(j.attempt);
      sigPad.current.clear(); setHasInk(false);
      reload();
    } catch (e: any) {
      setErr(e?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closeSession = async () => {
    if (!confirm('Close this session? You can still view it but no new attempts can be added.')) return;
    await fetch(`/api/admin/audit/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ close: true }),
    });
    reload();
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!session) return <div style={{ padding: 24, color: '#b91c1c' }}>Session not found.</div>;

  // ── Compute confusion matrix + stats ─────────────────────────────────────
  const verifiedish = (b: string | null) => b === 'VERIFIED' || b === 'LIKELY_MATCH';
  const tp = session.attempts.filter(a => a.label === 'GENUINE'  && verifiedish(a.bucket)).length;  // accepted real
  const fn = session.attempts.filter(a => a.label === 'GENUINE'  && !verifiedish(a.bucket)).length; // rejected real (bad)
  const fp = session.attempts.filter(a => a.label === 'IMPOSTER' && verifiedish(a.bucket)).length;  // accepted fake (bad)
  const tn = session.attempts.filter(a => a.label === 'IMPOSTER' && !verifiedish(a.bucket)).length; // rejected fake
  const total = tp + fn + fp + tn;
  const accuracy = total > 0 ? ((tp + tn) / total) * 100 : 0;
  const far = (fp + tn) > 0 ? (fp / (fp + tn)) * 100 : 0;
  const frr = (tp + fn) > 0 ? (fn / (tp + fn)) * 100 : 0;
  const closed = !!session.closedAt;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      {/* Toolbar */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href="/admin/audit" style={{ padding: '8px 14px', background: 'var(--c1)', color: 'white', borderRadius: 6, textDecoration: 'none', fontWeight: 700 }}>
          ← Audit sessions
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!closed && (
            <button onClick={closeSession} style={btn('transparent', 'var(--muted)', 'var(--border)')}>
              Close session
            </button>
          )}
          <button onClick={() => window.print()} style={btn('var(--c1d)', 'white')}>
            🖨️ Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Printable surface starts here */}
      <article className="audit-doc">
        <header className="doc-head">
          <img src="/hucm_logo.png" alt="HUCM" className="doc-logo" />
          <div>
            <div className="doc-title">Howard University College of Medicine</div>
            <div className="doc-sub">Office of Faculty Development &amp; JEDI · CME Biometric Verification Audit</div>
          </div>
          <div className="doc-meta">
            <div><strong>Session:</strong> {session.name}</div>
            <div>{new Date(session.createdAt).toLocaleString()}</div>
            {closed && <div><em>Closed: {new Date(session.closedAt!).toLocaleString()}</em></div>}
          </div>
        </header>

        <section className="facts">
          <div className="fact"><div className="fact-label">Subject</div><div className="fact-value">{session.facultyName}</div></div>
          <div className="fact"><div className="fact-label">Degrees</div><div className="fact-value">{session.facultyDegrees.join(', ') || '—'}</div></div>
          <div className="fact"><div className="fact-label">Department</div><div className="fact-value">{session.facultyDepartment || '—'}</div></div>
          <div className="fact"><div className="fact-label">Baseline samples</div><div className="fact-value">{session.baselineCount}</div></div>
        </section>

        {/* STATS BAR */}
        <section className="stats">
          <div className="stat">
            <div className="stat-num">{total}</div>
            <div className="stat-lbl">Attempts</div>
          </div>
          <div className="stat" style={{ background: '#dcfce7' }}>
            <div className="stat-num" style={{ color: '#166534' }}>{tp}</div>
            <div className="stat-lbl">True accept (genuine ✓)</div>
          </div>
          <div className="stat" style={{ background: '#fee2e2' }}>
            <div className="stat-num" style={{ color: '#991b1b' }}>{fp}</div>
            <div className="stat-lbl">False accept (imposter passed)</div>
          </div>
          <div className="stat" style={{ background: '#fee2e2' }}>
            <div className="stat-num" style={{ color: '#991b1b' }}>{fn}</div>
            <div className="stat-lbl">False reject (genuine failed)</div>
          </div>
          <div className="stat" style={{ background: '#dcfce7' }}>
            <div className="stat-num" style={{ color: '#166534' }}>{tn}</div>
            <div className="stat-lbl">True reject (imposter blocked ✓)</div>
          </div>
        </section>

        {/* HEADLINE METRICS */}
        <section className="metrics">
          <Metric label="Accuracy" value={accuracy} fmt="%" hint="(TP+TN)/total — overall correctness." good />
          <Metric label="False Accept Rate (FAR)" value={far} fmt="%" hint="Imposter attempts that got accepted. Lower is better." inverted />
          <Metric label="False Reject Rate (FRR)" value={frr} fmt="%" hint="Genuine attempts that got rejected. Lower is better (but tolerable)." inverted />
        </section>

        {/* RECORD A NEW ATTEMPT — hidden on print */}
        {!closed && (
          <section className="no-print" style={{ ...card, marginTop: 18 }}>
            <h2 style={h2}>Record an attempt</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setLabel('GENUINE')}
                      style={{ ...modeBtn, background: label === 'GENUINE' ? '#16a34a' : 'transparent', color: label === 'GENUINE' ? 'white' : '#16a34a', border: '1px solid #16a34a' }}>
                ✓ Genuine ({session.facultyName} signing)
              </button>
              <button onClick={() => setLabel('IMPOSTER')}
                      style={{ ...modeBtn, background: label === 'IMPOSTER' ? '#dc2626' : 'transparent', color: label === 'IMPOSTER' ? 'white' : '#dc2626', border: '1px solid #dc2626' }}>
                ✕ Imposter (someone else signing)
              </button>
            </div>
            <div style={{ position: 'relative', border: '3px dashed #cbd5e1', borderRadius: 12, background: 'white', overflow: 'hidden' }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: 'clamp(220px, 36vw, 320px)', display: 'block', cursor: 'crosshair', touchAction: 'none' }} />
              {!hasInk && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'rgba(13, 46, 50, 0.18)', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', transform: 'rotate(-8deg)' }}>SIGN HERE ✎</div>}
            </div>
            {err && <div style={errBox}>{err}</div>}
            {lastResult && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: bucketBg(lastResult.bucket), color: bucketFg(lastResult.bucket), fontWeight: 700 }}>
                Last attempt ({lastResult.label}) → {Math.round(lastResult.score || 0)}% · {labelForBucket(lastResult.bucket)}
                {' · '}
                <strong>{verdictAgrees(lastResult) ? '✓ system agreed with ground truth' : '✗ system disagreed with ground truth'}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <button onClick={() => { sigPad.current?.clear(); setHasInk(false); }} style={btn('var(--bg)', 'var(--muted)', 'var(--border)')}>Clear pad</button>
              <button onClick={submit} disabled={submitting || !hasInk}
                      style={btn(submitting ? '#999' : 'var(--c1)', 'white')}>
                {submitting ? 'Scoring…' : `Submit ${label.toLowerCase()} attempt`}
              </button>
            </div>
          </section>
        )}

        {/* ATTEMPTS TABLE */}
        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#097C87', fontWeight: 800, marginBottom: 10 }}>
            Per-attempt detail
          </h2>
          {session.attempts.length === 0 ? (
            <div style={{ padding: 18, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8 }}>No attempts yet.</div>
          ) : (
            <table className="attempts-table">
              <thead>
                <tr>
                  <th>#</th><th>Time</th><th>Label</th><th>Signature</th><th className="num">Score</th><th>System verdict</th><th>Match?</th>
                </tr>
              </thead>
              <tbody>
                {session.attempts.map((a, i) => (
                  <tr key={a.id}>
                    <td>{i + 1}</td>
                    <td>{new Date(a.createdAt).toLocaleTimeString()}</td>
                    <td>
                      <span style={chipBg(a.label === 'GENUINE' ? '#dcfce7' : '#fee2e2', a.label === 'GENUINE' ? '#166534' : '#991b1b')}>
                        {a.label === 'GENUINE' ? '✓ Genuine' : '✕ Imposter'}
                      </span>
                    </td>
                    <td>
                      <SignatureSVG trace={a.perSample?.trace ?? null} width={150} height={42} />
                    </td>
                    <td className="num">{a.score === null ? '—' : Math.round(a.score) + '%'}</td>
                    <td>
                      <span style={chipBg(bucketBg(a.bucket), bucketFg(a.bucket))}>
                        {labelForBucket(a.bucket)}
                      </span>
                    </td>
                    <td>{verdictAgrees(a) ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span> : <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="doc-foot">
          <p>
            <strong>Methodology.</strong> Scoring uses Dynamic Time Warping (DTW) on
            normalized resampled signature paths combined with three structural
            penalties (aspect ratio, stroke count, total ink length). Verdict
            buckets and thresholds are configurable in the Settings page;
            "verified" in this report includes both VERIFIED (≥75%) and
            LIKELY_MATCH (55–74%) buckets — the system's "accept" decision.
            Imposter attempts in the WEAK or POOR buckets count as correctly
            rejected.
          </p>
          <div className="signoff">
            <div className="sig"><div className="sig-line" /><div className="sig-lbl">Auditor</div></div>
            <div className="sig"><div className="sig-line" /><div className="sig-lbl">Date</div></div>
          </div>
        </footer>
      </article>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function verdictAgrees(a: Attempt): boolean {
  const accepted = a.bucket === 'VERIFIED' || a.bucket === 'LIKELY_MATCH';
  if (a.label === 'GENUINE')  return accepted;
  if (a.label === 'IMPOSTER') return !accepted;
  return false;
}
function labelForBucket(b: string | null): string {
  switch (b) {
    case 'VERIFIED':     return '🔐 Verified';
    case 'LIKELY_MATCH': return '✓ Likely';
    case 'WEAK_MATCH':   return '⚠️ Weak';
    case 'POOR_MATCH':   return '✕ Poor';
    default:             return b || '—';
  }
}
function bucketBg(b: string | null): string {
  switch (b) {
    case 'VERIFIED':     return '#dcfce7';
    case 'LIKELY_MATCH': return '#ecfccb';
    case 'WEAK_MATCH':   return '#fef9c3';
    case 'POOR_MATCH':   return '#fee2e2';
    default:             return '#f1f5f9';
  }
}
function bucketFg(b: string | null): string {
  switch (b) {
    case 'VERIFIED':     return '#166534';
    case 'LIKELY_MATCH': return '#3f6212';
    case 'WEAK_MATCH':   return '#854d0e';
    case 'POOR_MATCH':   return '#991b1b';
    default:             return '#334155';
  }
}
function chipBg(bg: string, fg: string): React.CSSProperties {
  return { display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: '0.78rem', fontWeight: 700 };
}

function Metric({ label, value, fmt, hint, good, inverted }: { label: string; value: number; fmt: string; hint: string; good?: boolean; inverted?: boolean }) {
  // Color: good metrics green when high, inverted when low. Default neutral.
  const v = Number.isFinite(value) ? value : 0;
  const palette = inverted
    ? (v < 5 ? { bg: '#dcfce7', fg: '#166534' } : v < 20 ? { bg: '#fef9c3', fg: '#854d0e' } : { bg: '#fee2e2', fg: '#991b1b' })
    : good
    ? (v >= 90 ? { bg: '#dcfce7', fg: '#166534' } : v >= 70 ? { bg: '#fef9c3', fg: '#854d0e' } : { bg: '#fee2e2', fg: '#991b1b' })
    : { bg: '#f1f5f9', fg: '#334155' };
  return (
    <div className="metric" style={{ background: palette.bg, color: palette.fg }}>
      <div className="metric-num">{v.toFixed(1)}{fmt}</div>
      <div className="metric-lbl">{label}</div>
      <div className="metric-hint">{hint}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, boxShadow: 'var(--shadow)' };
const h2:   React.CSSProperties = { fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 };
const errBox: React.CSSProperties = { background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b', padding: 10, borderRadius: 8, marginTop: 12, fontWeight: 600 };
const modeBtn: React.CSSProperties = { padding: '10px 14px', borderRadius: 6, fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit', flex: 1 };
function btn(bg: string, fg: string, border = 'transparent'): React.CSSProperties {
  return { padding: '10px 18px', borderRadius: 6, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${border}`, background: bg, color: fg };
}

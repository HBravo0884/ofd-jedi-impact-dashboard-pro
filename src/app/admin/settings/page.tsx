'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Config {
  SIGNATURE_VERIFIED_MIN?: number;
  SIGNATURE_POSSIBLE_MIN?: number;
  SIGNATURE_RETRY_MIN?: number;
  SIGNATURE_DTW_MAX_PER_NODE?: number;
  SIGNATURE_AR_PENALTY_K?: number;
  SIGNATURE_STROKE_PENALTY_K?: number;
  SIGNATURE_PATHLEN_PENALTY_K?: number;
}

const DEFAULTS: Required<Config> = {
  SIGNATURE_VERIFIED_MIN: 65,
  SIGNATURE_POSSIBLE_MIN: 40,
  SIGNATURE_RETRY_MIN: 40,
  SIGNATURE_DTW_MAX_PER_NODE: 1.0,
  SIGNATURE_AR_PENALTY_K: 0.30,
  SIGNATURE_STROKE_PENALTY_K: 0.18,
  SIGNATURE_PATHLEN_PENALTY_K: 0.25,
};

// Strictness presets — each maps to a sensible bundle of values.
const PRESETS = {
  Lenient: {
    SIGNATURE_VERIFIED_MIN: 55,
    SIGNATURE_POSSIBLE_MIN: 30,
    SIGNATURE_RETRY_MIN: 30,
    SIGNATURE_DTW_MAX_PER_NODE: 1.4,
    SIGNATURE_AR_PENALTY_K: 0.20,
    SIGNATURE_STROKE_PENALTY_K: 0.12,
    SIGNATURE_PATHLEN_PENALTY_K: 0.18,
  },
  Normal: { ...DEFAULTS },
  Strict: {
    SIGNATURE_VERIFIED_MIN: 75,
    SIGNATURE_POSSIBLE_MIN: 50,
    SIGNATURE_RETRY_MIN: 50,
    SIGNATURE_DTW_MAX_PER_NODE: 0.7,
    SIGNATURE_AR_PENALTY_K: 0.40,
    SIGNATURE_STROKE_PENALTY_K: 0.25,
    SIGNATURE_PATHLEN_PENALTY_K: 0.35,
  },
  ClinicalAudit: {
    SIGNATURE_VERIFIED_MIN: 80,
    SIGNATURE_POSSIBLE_MIN: 60,
    SIGNATURE_RETRY_MIN: 60,
    SIGNATURE_DTW_MAX_PER_NODE: 0.55,
    SIGNATURE_AR_PENALTY_K: 0.50,
    SIGNATURE_STROKE_PENALTY_K: 0.30,
    SIGNATURE_PATHLEN_PENALTY_K: 0.40,
  },
} as const;

export default function SettingsPage() {
  const [cfg, setCfg] = useState<Required<Config>>(DEFAULTS);
  const [original, setOriginal] = useState<Required<Config>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/settings');
      const j = await r.json();
      const live: Required<Config> = { ...DEFAULTS, ...(j.config || {}) };
      setCfg(live);
      setOriginal(live);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const dirty =
    JSON.stringify(cfg) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Save failed');
      setOriginal(cfg);
      setMessage('Settings saved. Kiosk picks up changes within ~30 seconds.');
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm('Reset all signature thresholds to defaults?')) return;
    setSaving(true);
    setError(null);
    try {
      await fetch('/api/admin/settings', { method: 'DELETE' });
      await reload();
      setMessage('Reset to defaults.');
    } catch (e: any) {
      setError(e?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (key: keyof typeof PRESETS) => {
    setCfg({ ...DEFAULTS, ...PRESETS[key] });
    setMessage(`Applied "${key}" preset (not saved yet — click Save to commit).`);
  };

  const setVal = (k: keyof Config, v: number) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
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
        Kiosk Signature Settings
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 22, fontSize: '0.92rem' }}>
        Tune what counts as a "good enough" signature. Changes save to the database
        and the kiosk picks them up within ~30 seconds — no redeploy.
      </p>

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <>
          {/* PRESETS */}
          <section style={card}>
            <h2 style={h2}>Quick Presets</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 14 }}>
              Pick a preset and click Save. Or use the advanced sliders below for fine control.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <PresetCard name="Lenient"        desc="Sloppy genuine repeats still pass. Good for very informal events." onClick={() => applyPreset('Lenient')} />
              <PresetCard name="Normal"         desc="Default. Real signatures usually score 60–80%." onClick={() => applyPreset('Normal')} highlight />
              <PresetCard name="Strict"         desc="Demand careful, deliberate signing. Forgeries collapse fast." onClick={() => applyPreset('Strict')} />
              <PresetCard name="ClinicalAudit"  desc="Highest bar. Use when you need strong CME audit trail." onClick={() => applyPreset('ClinicalAudit')} />
            </div>
          </section>

          {/* CURRENT FEEL — plain English */}
          <section style={card}>
            <h2 style={h2}>What this means in plain English</h2>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.92rem', lineHeight: 1.6 }}>
              <li>
                <strong>{cfg.SIGNATURE_VERIFIED_MIN}% or higher</strong> →{' '}
                <span style={chip('#dcfce7','#166534')}>VERIFIED ✓</span> · counted as a confident match.
              </li>
              <li>
                <strong>{cfg.SIGNATURE_POSSIBLE_MIN}% – {cfg.SIGNATURE_VERIFIED_MIN - 1}%</strong> →{' '}
                <span style={chip('#fef9c3','#854d0e')}>POSSIBLE</span> · accepted but flagged.
              </li>
              <li>
                <strong>Below {cfg.SIGNATURE_POSSIBLE_MIN}%</strong> →{' '}
                <span style={chip('#fee2e2','#991b1b')}>SUSPICIOUS</span> · still recorded for audit.
              </li>
              <li>
                <strong>Below {cfg.SIGNATURE_RETRY_MIN}%</strong> on the kiosk → ask the user to{' '}
                <strong>try again</strong> (up to 3 attempts).
              </li>
            </ul>
          </section>

          {/* ADVANCED SLIDERS */}
          <section style={card}>
            <button
              onClick={() => setAdvanced((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, color: 'var(--c1d)', padding: 0 }}
            >
              {advanced ? '▾' : '▸'} Advanced — fine-tune individual thresholds
            </button>
            {advanced && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                <Slider label="VERIFIED threshold (%)"
                        helper="Score at or above this is a confident match."
                        min={30} max={95} step={1}
                        value={cfg.SIGNATURE_VERIFIED_MIN}
                        onChange={(v) => setVal('SIGNATURE_VERIFIED_MIN', v)} />
                <Slider label="POSSIBLE threshold (%)"
                        helper="Score at or above this is accepted but flagged."
                        min={20} max={cfg.SIGNATURE_VERIFIED_MIN - 1} step={1}
                        value={cfg.SIGNATURE_POSSIBLE_MIN}
                        onChange={(v) => setVal('SIGNATURE_POSSIBLE_MIN', v)} />
                <Slider label="RETRY threshold (%)"
                        helper="Below this, the kiosk asks the user to try again."
                        min={10} max={cfg.SIGNATURE_VERIFIED_MIN} step={1}
                        value={cfg.SIGNATURE_RETRY_MIN}
                        onChange={(v) => setVal('SIGNATURE_RETRY_MIN', v)} />
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
                <Slider label="DTW tolerance (per node)"
                        helper="Higher = path-similarity is easier. Default 1.0."
                        min={0.3} max={2.0} step={0.05}
                        value={cfg.SIGNATURE_DTW_MAX_PER_NODE}
                        onChange={(v) => setVal('SIGNATURE_DTW_MAX_PER_NODE', v)} />
                <Slider label="Aspect-ratio penalty"
                        helper="Higher = different W:H punishes more. Default 0.30."
                        min={0} max={0.8} step={0.01}
                        value={cfg.SIGNATURE_AR_PENALTY_K}
                        onChange={(v) => setVal('SIGNATURE_AR_PENALTY_K', v)} />
                <Slider label="Stroke-count penalty"
                        helper="Higher = different number of pen-downs punishes more. Default 0.18."
                        min={0} max={0.5} step={0.01}
                        value={cfg.SIGNATURE_STROKE_PENALTY_K}
                        onChange={(v) => setVal('SIGNATURE_STROKE_PENALTY_K', v)} />
                <Slider label="Path-length penalty"
                        helper="Higher = different ink lengths punish more. Default 0.25."
                        min={0} max={0.7} step={0.01}
                        value={cfg.SIGNATURE_PATHLEN_PENALTY_K}
                        onChange={(v) => setVal('SIGNATURE_PATHLEN_PENALTY_K', v)} />
              </div>
            )}
          </section>

          {error && <div style={errBox}>{error}</div>}
          {message && <div style={okBox}>{message}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={reset} disabled={saving} style={btn('transparent', '#b91c1c', 'var(--border)')}>
              Reset to defaults
            </button>
            <button onClick={() => setCfg(original)} disabled={saving || !dirty} style={btn('transparent', 'var(--muted)', 'var(--border)')}>
              Discard changes
            </button>
            <button onClick={save} disabled={saving || !dirty} style={btn('var(--c1)', 'white', 'var(--c1)')}>
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Small bits ──────────────────────────────────────────────────────────────
function Slider({ label, helper, min, max, step, value, onChange }: {
  label: string; helper: string;
  min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)' }}>{label}</label>
        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700 }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))}
             style={{ width: '100%', accentColor: 'var(--c1)' }} />
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{helper}</div>
    </div>
  );
}

function PresetCard({ name, desc, onClick, highlight }: { name: string; desc: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button onClick={onClick}
      style={{
        textAlign: 'left', padding: 14, borderRadius: 10,
        background: highlight ? '#f0fafb' : 'white',
        border: `1px solid ${highlight ? 'var(--c1)' : 'var(--border)'}`,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
      <div style={{ fontWeight: 800, color: 'var(--c1d)' }}>{name}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

function chip(bg: string, fg: string): React.CSSProperties {
  return { display: 'inline-block', padding: '1px 8px', background: bg, color: fg, borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 };
}

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  padding: 18, boxShadow: 'var(--shadow)', marginBottom: 16,
};
const h2: React.CSSProperties = {
  fontSize: '0.85rem', fontWeight: 700, color: 'var(--c1d)',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8,
};
const errBox: React.CSSProperties = { background: '#fff0f0', border: '1px solid #fecaca', color: '#991b1b', padding: 10, borderRadius: 8, marginTop: 12, fontWeight: 600 };
const okBox:  React.CSSProperties = { background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: 10, borderRadius: 8, marginTop: 12, fontWeight: 600 };
function btn(bg: string, fg: string, border: string = 'transparent'): React.CSSProperties {
  return { padding: '10px 18px', borderRadius: 6, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${border}`, background: bg, color: fg };
}

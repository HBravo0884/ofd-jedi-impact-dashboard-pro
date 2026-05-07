'use client';

import React, { useState, useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';
import styles from './Kiosk.module.css';

type Screen = 'EVENT_PICK' | 'NAME' | 'SIGNATURE' | 'THANKS';
interface KioskEvent { id: string; title: string; date: string; series: string | null; }
interface AutoResult { id: string; name: string; dept: string; isClinician: boolean; signatureBaselineCount: number; }

const SESSION_KEY = 'hucm_kiosk_active_event_v1';

export default function KioskApp() {
  const [screen, setScreen] = useState<Screen>('EVENT_PICK');
  const [events, setEvents] = useState<KioskEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<KioskEvent | null>(null);

  const [searchName, setSearchName] = useState('');
  const [autocomplete, setAutocomplete] = useState<AutoResult[]>([]);
  const [activeFacultyId, setActiveFacultyId] = useState<string | null>(null);
  const [activeFacultyDisplay, setActiveFacultyDisplay] = useState<string>('');
  const [activeIsClinician, setActiveIsClinician] = useState<boolean>(false);
  const [activeBaselineCount, setActiveBaselineCount] = useState<number>(0);
  const [lastMlScore, setLastMlScore] = useState<number | null>(null);
  const [lastMlAction, setLastMlAction] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(1);
  const [retryHint, setRetryHint] = useState<string | null>(null);
  const [retryScore, setRetryScore] = useState<number | null>(null);
  const MAX_ATTEMPTS = 3;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigPad = useRef<SignaturePad | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load active event from sessionStorage; fetch events list on mount ────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as KioskEvent;
        if (parsed?.id && parsed?.title) {
          setActiveEvent(parsed);
          setScreen('NAME');
        }
      }
    } catch {}
    (async () => {
      try {
        const r = await fetch('/api/kiosk/events');
        const j = await r.json();
        setEvents(j.events || []);
      } catch (e) {
        console.warn('Could not load events list:', e);
      }
    })();
  }, []);

  // ── Mount the signature pad whenever the SIGNATURE screen shows ──────────
  useEffect(() => {
    if (screen !== 'SIGNATURE' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const pad = new SignaturePad(canvas, {
      minWidth: 1.5,
      maxWidth: 4.5,
      penColor: 'rgb(15, 30, 45)',
    });
    sigPad.current = pad;
    setHasSignature(false);

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(ratio, ratio);
      pad.clear();
      setHasSignature(false);
    };
    window.addEventListener('resize', resize);
    resize();

    pad.addEventListener('endStroke', () => setHasSignature(!pad.isEmpty()));

    return () => {
      window.removeEventListener('resize', resize);
      pad.off();
    };
  }, [screen]);

  // ── Autocomplete: debounce + fetch on each keystroke past 2 chars ────────
  const onSearchChange = (val: string) => {
    setSearchName(val);
    setActiveFacultyId(null);
    setErrorMessage(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.trim().length < 2) {
      setAutocomplete([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/kiosk/faculty-search?q=' + encodeURIComponent(val.trim()));
        const j = await r.json();
        setAutocomplete(j.results || []);
      } catch {
        setAutocomplete([]);
      }
    }, 220);
  };

  // ── Pick an event → save & advance to NAME screen ────────────────────────
  const pickEvent = (ev: KioskEvent) => {
    setActiveEvent(ev);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(ev)); } catch {}
    setScreen('NAME');
  };
  const exitKioskMode = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    setActiveEvent(null);
    setSearchName('');
    setAutocomplete([]);
    setActiveFacultyId(null);
    setScreen('EVENT_PICK');
  };

  // ── Pick a faculty from autocomplete ─────────────────────────────────────
  const pickFaculty = (r: AutoResult) => {
    setActiveFacultyId(r.id);
    setActiveFacultyDisplay(r.name);
    setActiveIsClinician(r.isClinician);
    setActiveBaselineCount(r.signatureBaselineCount);
    setSearchName(r.name);
    setAutocomplete([]);
    setAttempt(1);
    setRetryHint(null);
    setRetryScore(null);
    setScreen('SIGNATURE');
  };

  // ── Continue with a typed-but-unmatched name ─────────────────────────────
  const useTypedName = () => {
    const v = searchName.trim();
    if (v.length < 3) {
      setErrorMessage('Please type your full name.');
      return;
    }
    setActiveFacultyId(null);
    setActiveFacultyDisplay(v);
    setActiveIsClinician(false);
    setActiveBaselineCount(0);
    setAttempt(1);
    setRetryHint(null);
    setRetryScore(null);
    setAutocomplete([]);
    setScreen('SIGNATURE');
  };

  // ── Submit registration ──────────────────────────────────────────────────
  const submit = async () => {
    if (!activeEvent) return;
    setErrorMessage(null);
    setRetryHint(null);
    setRetryScore(null);
    setSubmitting(true);

    const trace = sigPad.current && !sigPad.current.isEmpty() ? sigPad.current.toData() : [];

    try {
      const res = await fetch('/api/kiosk/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeEvent.id,
          facultyId: activeFacultyId || undefined,
          name: activeFacultyId ? undefined : activeFacultyDisplay,
          signatureTrace: trace,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
        }),
      });
      const data = await res.json();

      // Server says: signature too low, please retry. Don't commit; give
      // the user a chance to re-sign more deliberately.
      if (data && data.retry === true) {
        setRetryScore(typeof data.mlScore === 'number' ? data.mlScore : null);
        setRetryHint(
          typeof data.message === 'string'
            ? data.message
            : 'Your signature didn\'t closely match. Please try again.'
        );
        setAttempt((n) => n + 1);
        sigPad.current?.clear();
        setHasSignature(false);
        setSubmitting(false);
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Server rejected the check-in.');
      }
      setLastMlScore(typeof data.mlScore === 'number' ? data.mlScore : null);
      setLastMlAction(typeof data.mlAction === 'string' ? data.mlAction : null);
      setScreen('THANKS');
      // Auto-reset back to NAME screen for the next attendee.
      setTimeout(() => {
        setSearchName('');
        setActiveFacultyDisplay('');
        setActiveFacultyId(null);
        setActiveIsClinician(false);
        setActiveBaselineCount(0);
        setLastMlScore(null);
        setLastMlAction(null);
        setAttempt(1);
        setRetryHint(null);
        setRetryScore(null);
        setAutocomplete([]);
        setScreen('NAME');
      }, 2400);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Could not submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <img src="/hucm_logo.png" alt="HUCM Seal" className={styles.logo} />
            <div>
              <div className={styles.headerTitle}>Howard University College of Medicine</div>
              <div className={styles.headerSub}>Office of Faculty Development &amp; JEDI · Programming Kiosk</div>
            </div>
          </div>
          {activeEvent && (
            <div className={styles.headerEvent}>
              <div className={styles.headerEventName}>{activeEvent.title}</div>
              <div className={styles.headerEventDate}>{activeEvent.date}</div>
            </div>
          )}
        </header>

        {/* ─────────────── EVENT PICKER ─────────────── */}
        {screen === 'EVENT_PICK' && (
          <div className={styles.panel}>
            <h1 className={styles.h1}>Select today&rsquo;s session</h1>
            <p className={styles.lead}>
              Pick the event this kiosk is for. The selection is saved on this device until you change it.
            </p>
            {events.length === 0 ? (
              <div className={styles.errorBox}>
                No recent events found. An admin needs to create an event in Manage Data first.
              </div>
            ) : (
              <div className={styles.eventGrid}>
                {events.map((e) => (
                  <button key={e.id} className={styles.eventBtn} onClick={() => pickEvent(e)}>
                    <div className={styles.eventBtnTitle}>{e.title}</div>
                    <div className={styles.eventBtnMeta}>
                      {e.date}{e.series ? ` · ${e.series}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─────────────── NAME / AUTOCOMPLETE ─────────────── */}
        {screen === 'NAME' && activeEvent && (
          <div className={styles.panel}>
            <h1 className={styles.h1}>Welcome</h1>
            <p className={styles.lead}>Type your name to check in.</p>
            <div className={styles.searchWrap}>
              <input
                className={styles.search}
                placeholder="First or last name…"
                value={searchName}
                onChange={(e) => onSearchChange(e.target.value)}
                autoComplete="off"
                autoFocus
              />
              {autocomplete.length > 0 && (
                <div className={styles.autocomplete}>
                  {autocomplete.map((r) => (
                    <div key={r.id} className={styles.autoItem} onClick={() => pickFaculty(r)}>
                      <span>{r.name}</span>
                      {r.dept && <span className={styles.deptTag}>{r.dept}</span>}
                    </div>
                  ))}
                  {searchName.trim().length >= 3 && (
                    <div className={styles.notInList}>
                      Not in list?{' '}
                      <button onClick={useTypedName}>Continue with &ldquo;{searchName.trim()}&rdquo;</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {errorMessage && <div className={styles.errorBox}>{errorMessage}</div>}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={exitKioskMode}>
                Change event
              </button>
            </div>
          </div>
        )}

        {/* ─────────────── SIGNATURE ─────────────── */}
        {screen === 'SIGNATURE' && activeEvent && (
          <div className={styles.panel}>
            <h1 className={styles.h1}>Confirm attendance</h1>
            <p className={styles.lead}>
              Signing in: <strong style={{ color: '#097C87' }}>{activeFacultyDisplay}</strong>
            </p>
            {retryHint && (
              <div
                role="alert"
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fdba74',
                  color: '#9a3412',
                  padding: '12px 14px',
                  borderRadius: 10,
                  margin: '10px auto 14px',
                  maxWidth: 560,
                  textAlign: 'center',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>
                  Try again — attempt {attempt} of {MAX_ATTEMPTS}
                  {retryScore !== null && (
                    <span style={{ color: '#c2410c', marginLeft: 8 }}>
                      ({Math.round(retryScore)}% match)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{retryHint}</div>
              </div>
            )}
            <div style={{ textAlign: 'center', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>
              {activeIsClinician ? (
                <span style={{ color: '#b91c1c' }}>
                  ✦ Signature required for CME audit (clinician credentials on file)
                </span>
              ) : (
                <span style={{ color: '#5a8a8f' }}>Signature optional — feel free to skip if you'd like</span>
              )}
              {activeBaselineCount > 0 && (
                <div style={{ color: '#5a8a8f', fontWeight: 500, marginTop: 4 }}>
                  Biometric baseline: {activeBaselineCount} sample{activeBaselineCount === 1 ? '' : 's'} on file
                </div>
              )}
            </div>
            <div className={styles.sigBox}>
              <canvas ref={canvasRef} className={styles.sigCanvas} />
              <div className={`${styles.sigHint} ${hasSignature ? styles.hidden : ''}`}>
                Sign here ✎
              </div>
            </div>
            {errorMessage && <div className={styles.errorBox}>{errorMessage}</div>}
            <div className={styles.sigControls}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => { sigPad.current?.clear(); setHasSignature(false); }}
                disabled={submitting}
              >
                Clear signature
              </button>
              <div className={styles.sigControlsRight}>
                <button
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => { setScreen('NAME'); setErrorMessage(null); }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={submit}
                  disabled={submitting || (activeIsClinician && !hasSignature)}
                  title={activeIsClinician && !hasSignature ? 'Clinicians are required to sign for CME audit.' : undefined}
                >
                  {submitting ? 'Submitting…' : 'Submit registration'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────── THANKS ─────────────── */}
        {screen === 'THANKS' && (
          <div className={`${styles.panel} ${styles.thanks}`}>
            <div className={styles.thanksIcon}>✅</div>
            <div className={styles.thanksTitle}>Registered!</div>
            <div className={styles.thanksSub}>Thank you. Please pass the device to the next person.</div>
            {lastMlAction && lastMlScore !== null && lastMlAction !== 'NO_SIGNATURE' && (
              <div style={{ marginTop: 18, fontSize: '0.85rem', color: '#5a8a8f' }}>
                {lastMlAction === 'BASELINE_ACQUIRED' && '📍 First signature on file — baseline acquired.'}
                {lastMlAction === 'VERIFIED'      && `🔐 Verified match · ${Math.round(lastMlScore)}% confidence`}
                {lastMlAction === 'LIKELY_MATCH'  && `✓ Likely match · ${Math.round(lastMlScore)}% confidence`}
                {lastMlAction === 'WEAK_MATCH'    && `⚠️ Weak match · ${Math.round(lastMlScore)}% — flagged for review`}
                {lastMlAction === 'POOR_MATCH'    && `✕ Poor match · ${Math.round(lastMlScore)}% — flagged for review`}
              </div>
            )}
          </div>
        )}

        <div className={styles.footer}>
          {activeEvent && (
            <a href="#" onClick={(e) => { e.preventDefault(); exitKioskMode(); }}>
              Switch event
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

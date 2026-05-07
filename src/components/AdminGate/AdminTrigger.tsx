'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AdminGate.module.css';

const TAPS_REQUIRED = 5;
const TAP_WINDOW_MS = 3000;

/**
 * Discreet tap-zone for the bottom of the Overview page.
 * Five taps within 3 seconds opens an admin password prompt. On success the
 * server sets an httpOnly admin_session cookie and we refresh the page so the
 * server components re-render with admin tabs visible.
 */
export default function AdminTrigger() {
  const router = useRouter();
  const tapTimes = useRef<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showModal) {
      // Slight delay so the focus ring lands after paint.
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [showModal]);

  const handleTap = () => {
    const now = Date.now();
    tapTimes.current = [...tapTimes.current, now].filter((t) => now - t <= TAP_WINDOW_MS);
    if (tapTimes.current.length >= TAPS_REQUIRED) {
      tapTimes.current = [];
      setError(null);
      setSuccess(false);
      setPassword('');
      setShowModal(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Incorrect password');
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      // Refresh server components so TopNav re-renders with admin links.
      setTimeout(() => {
        setShowModal(false);
        setSubmitting(false);
        router.refresh();
      }, 400);
    } catch (err) {
      setError('Network error');
      setSubmitting(false);
    }
  };

  const close = () => {
    if (submitting) return;
    setShowModal(false);
    setError(null);
    setPassword('');
  };

  return (
    <>
      <button
        type="button"
        aria-label="Admin access"
        title=""
        className={styles.tapZone}
        onClick={handleTap}
      />

      {showModal && (
        <div
          className={styles.modalBackdrop}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Admin login"
        >
          <form
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h2>Admin Access</h2>
            <p>Enter the admin password to unlock restricted views.</p>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              inputMode="numeric"
              placeholder="••••"
              disabled={submitting || success}
            />
            {error && <div className={styles.error}>{error}</div>}
            {success && <div className={styles.success}>Granted. Refreshing…</div>}
            <div className={styles.row}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={close}
                disabled={submitting || success}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={submitting || success || !password}
              >
                {submitting ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

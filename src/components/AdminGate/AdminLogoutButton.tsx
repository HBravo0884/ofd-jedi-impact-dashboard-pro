'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './AdminGate.module.css';

export default function AdminLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {}
    setBusy(false);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={styles.logoutPill}
      title="End admin session"
    >
      🔒 {busy ? 'Locking…' : 'Lock'}
    </button>
  );
}

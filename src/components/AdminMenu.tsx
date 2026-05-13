'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────
// AdminMenu — consolidates every admin action into a single hamburger
// dropdown so the header doesn't overflow with pills. Replaces the nine+
// individual hdr-pill elements that used to live in layout.tsx.
//
// Groups (visible only when isAdmin):
//   Data & People — Manage Data, Manage Events, Directory, Quarantine
//   CME Tools     — Launch Kiosk, Train Signatures, Verification Audit
//   Exports       — Download Graphs PDF, Clean Directory CSV
//   Settings      — Settings
//   Account       — Lock (logout)
//
// Behaviors:
//   - Click the hamburger to toggle the dropdown
//   - Click any item to navigate (dropdown closes automatically via blur)
//   - Click outside the menu or press Escape to close
//   - Logout fires the API call and refreshes
//   - PDF download triggers window.print() (same as old data-action="print")
// ─────────────────────────────────────────────────────────────────────────

interface AdminMenuProps {
  pendingCount?: number;
}

export default function AdminMenu({ pendingCount }: AdminMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch {}
    setLoggingOut(false);
    setOpen(false);
    router.refresh();
  };

  const handlePrint = () => {
    setOpen(false);
    // Defer so the menu can finish closing before the print dialog opens
    setTimeout(() => window.print(), 60);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Admin menu"
        className="hdr-pill hdr-pill-primary"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
          position: 'relative',
        }}
      >
        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>☰</span>
        Admin Menu
        {pendingCount && pendingCount > 0 ? (
          <span style={{
            display: 'inline-block', padding: '0 7px', borderRadius: 999,
            background: '#fef3c7', color: '#854d0e',
            fontSize: '0.7rem', fontWeight: 800, lineHeight: '18px',
            marginLeft: 2,
          }} title={`${pendingCount} pending profiles waiting in quarantine`}>
            {pendingCount}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 280,
            maxWidth: 320,
            background: 'white',
            borderRadius: 10,
            boxShadow: '0 16px 48px rgba(13, 46, 50, 0.22)',
            border: '1px solid #d4eaec',
            zIndex: 200,
            padding: 6,
            color: '#0d2e32',
          }}
        >
          <MenuSection label="Data & People">
            <MenuLink href="/admin/ingestion"  icon="📥" onClick={() => setOpen(false)}>Manage Data</MenuLink>
            <MenuLink href="/admin/events"     icon="📅" onClick={() => setOpen(false)}>Manage Events</MenuLink>
            <MenuLink href="/directory"        icon="👥" onClick={() => setOpen(false)}>Directory</MenuLink>
            <MenuLink href="/admin/quarantine" icon="🚨" onClick={() => setOpen(false)} badge={pendingCount}>
              Quarantine
            </MenuLink>
          </MenuSection>

          <MenuDivider />

          <MenuSection label="CME Tools">
            <MenuLink href="/kiosk" icon="📱" target="_blank" onClick={() => setOpen(false)}>
              Launch iPad Kiosk
            </MenuLink>
            <MenuLink href="/admin/signature-trainer" icon="✍️" onClick={() => setOpen(false)}>
              Train Signatures
            </MenuLink>
            <MenuLink href="/admin/audit" icon="🧪" onClick={() => setOpen(false)}>
              Verification Audit
            </MenuLink>
            <MenuLink href="/admin/signin-sheet" icon="🖨️" onClick={() => setOpen(false)}>
              Sign-in Sheets
            </MenuLink>
          </MenuSection>

          <MenuDivider />

          <MenuSection label="Exports">
            <MenuButton icon="🖨️" onClick={handlePrint}>
              Download Graphs (PDF)
            </MenuButton>
            <MenuLink
              href="/api/admin/exports/directory.csv"
              icon="⬇️"
              download="HUCM_Faculty_Directory.csv"
              onClick={() => setOpen(false)}
            >
              Clean Directory CSV
            </MenuLink>
          </MenuSection>

          <MenuDivider />

          <MenuSection label="Settings">
            <MenuLink href="/admin/settings" icon="⚙️" onClick={() => setOpen(false)}>
              Settings
            </MenuLink>
          </MenuSection>

          <MenuDivider />

          <MenuSection label="Account">
            <MenuButton icon="🔒" onClick={handleLogout} variant="danger">
              {loggingOut ? 'Locking…' : 'Lock admin session'}
            </MenuButton>
          </MenuSection>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{ padding: '6px 6px 4px' }}>
      <div style={{
        padding: '4px 8px 2px',
        fontSize: '0.65rem', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.6px',
      }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />;
}

function MenuLink({
  href, icon, children, onClick, target, download, badge,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
  onClick?: () => void;
  target?: string;
  download?: string;
  badge?: number;
}) {
  const isExternal = target === '_blank';
  const isApi = href.startsWith('/api/');
  // Use Next Link for in-app navigation, plain <a> for external/download
  const Anchor: any = isExternal || isApi ? 'a' : Link;
  return (
    <Anchor
      href={href}
      onClick={onClick}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      download={download}
      role="menuitem"
      style={menuItemStyle}
    >
      <span style={{ fontSize: '1rem', width: 22, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {badge && badge > 0 ? (
        <span style={{
          padding: '1px 7px', borderRadius: 999,
          background: '#fef3c7', color: '#854d0e',
          fontSize: '0.7rem', fontWeight: 700,
        }}>{badge}</span>
      ) : null}
    </Anchor>
  );
}

function MenuButton({
  icon, children, onClick, variant,
}: {
  icon: string;
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      style={{
        ...menuItemStyle,
        background: 'transparent', border: 'none', cursor: 'pointer',
        font: 'inherit', textAlign: 'left',
        color: variant === 'danger' ? '#b91c1c' : '#0d2e32',
      }}
    >
      <span style={{ fontSize: '1rem', width: 22, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 10px', borderRadius: 6,
  fontSize: '0.88rem', fontWeight: 600,
  textDecoration: 'none', color: '#0d2e32',
  width: '100%',
  transition: 'background 0.1s',
};

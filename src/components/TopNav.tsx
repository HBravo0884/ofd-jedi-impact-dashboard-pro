'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/series', label: 'By Series' },
  { href: '/engagement', label: 'Engagement' },
  { href: '/drilldown', label: 'Impact Drilldown' },
  { href: '/roster', label: 'Event Roster' },
  { href: '/directory', label: 'Directory' },
  { href: '/kiosk', label: 'Kiosk' },
  { href: '/methods', label: 'Data & Methods' },
];

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const activeLabel = NAV_ITEMS.find(i => i.href === pathname)?.label ?? 'Menu';

  return (
    <nav className="topnav" aria-label="Primary">
      <button
        type="button"
        className="nav-burger"
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="primary-nav-list"
        onClick={() => setOpen(v => !v)}
      >
        <span className={`nav-burger-icon${open ? ' open' : ''}`} aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
        <span className="nav-burger-label">{activeLabel}</span>
        <span className="nav-burger-caret" aria-hidden="true">▾</span>
      </button>

      <ul
        id="primary-nav-list"
        className={`nav-tabs${open ? ' nav-tabs-open' : ''}`}
        role="menu"
      >
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href;
          return (
            <li key={item.href} role="none">
              <Link
                href={item.href}
                className={active ? 'tab-btn active' : 'tab-btn'}
                role="menuitem"
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {open && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
    </nav>
  );
}

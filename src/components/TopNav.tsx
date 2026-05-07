'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TopNavProps {
  isAdmin?: boolean;
}

interface Tab {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Overview' },
  { href: '/series', label: 'By Series' },
  { href: '/engagement', label: 'Engagement' },
  { href: '/drilldown', label: 'Impact Drilldown', adminOnly: true },
  { href: '/roster', label: 'Event Roster', adminOnly: true },
  { href: '/directory', label: 'Directory', adminOnly: true },
  { href: '/methods', label: 'Data & Methods' },
];

export function TopNav({ isAdmin = false }: TopNavProps) {
  const pathname = usePathname();
  const cls = (path: string) => (pathname === path ? 'tab-btn active' : 'tab-btn');
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <nav className="tab-bar" aria-label="Primary">
      {visibleTabs.map((t) => (
        <Link key={t.href} href={t.href} className={cls(t.href)}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

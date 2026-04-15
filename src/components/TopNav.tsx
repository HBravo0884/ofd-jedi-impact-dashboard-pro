'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TopNav() {
  const pathname = usePathname();

  // Helper function to check if a route is active
  const isActive = (path: string) => pathname === path ? "tab-btn active" : "tab-btn";

  return (
    <div className="tab-bar">
      <Link href="/" className={isActive("/")}>Overview</Link>
      <Link href="/series" className={isActive("/series")}>By Series</Link>
      <Link href="/engagement" className={isActive("/engagement")}>Engagement</Link>
      <Link href="/drilldown" className={isActive("/drilldown")}>Impact Drilldown</Link>
      <Link href="/roster" className={isActive("/roster")}>Event Roster</Link>
      <Link href="/directory" className={isActive("/directory")}>Directory</Link>
      <Link href="/methods" className={isActive("/methods")}>Data & Methods</Link>
    </div>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { TopNav } from '@/components/TopNav';
import AdminLogoutButton from '@/components/AdminGate/AdminLogoutButton';
import { ADMIN_COOKIE_NAME, verifyToken } from '@/lib/adminAuth';

export const metadata: Metadata = {
  title: 'HUCM Office of Faculty Development — Impact Dashboard',
  description: 'Enterprise Faculty Development Metrics',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#097C87',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const isAdmin = await verifyToken(jar.get(ADMIN_COOKIE_NAME)?.value);

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <img
            src="/hucm_logo.png"
            className="site-logo"
            alt="HUCM Seal"
          />
          <div className="site-title-block">
            <h1 className="site-title">
              Howard University College of Medicine — Impact Dashboard
            </h1>
            <p className="site-subtitle">Office of Faculty Development and JEDI · Programming Tracker</p>
          </div>
          <div className="hdr-badge">
            <span className="hdr-badge-line">Cloud Synchronized Environment</span>
            <div className="hdr-badge-actions">
              <a
                href="/legacy_dashboard.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hdr-pill hdr-pill-primary"
              >
                📈 Launch Legacy View
              </a>
              {isAdmin && (
                <Link href="/admin/ingestion" className="hdr-pill hdr-pill-orange">
                  ⚙️ Manage Data
                </Link>
              )}
              {isAdmin && <AdminLogoutButton />}
            </div>
          </div>
        </header>

        <TopNav isAdmin={isAdmin} />

        <div className="tab-pane active" id="tab-overview">
          {children}
        </div>
      </body>
    </html>
  );
}

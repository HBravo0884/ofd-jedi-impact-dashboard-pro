import type { Metadata, Viewport } from 'next';
import './globals.css';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { TopNav } from '@/components/TopNav';
import AdminLogoutButton from '@/components/AdminGate/AdminLogoutButton';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { getHeaderStats } from '@/lib/headerStats';

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
  const isAdmin = await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value);
  const stats = await getHeaderStats();

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
            <span className="hdr-badge-line">
              {stats.attendance.toLocaleString()} attendance records
            </span>
            <span className="hdr-badge-line">
              {stats.participants.toLocaleString()} unique participants ·{' '}
              {stats.sessions.toLocaleString()} sessions
            </span>
            <div className="hdr-badge-actions">
              {isAdmin && (
                <a
                  href="/kiosk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hdr-pill hdr-pill-purple"
                >
                  📱 Launch iPad Kiosk
                </a>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="hdr-pill hdr-pill-darkteal"
                  onClick={undefined /* served by client island below */}
                  data-action="print"
                  // The actual onClick handler lives in the small client snippet
                  // injected via <PrintButton/> so we can keep the layout server-side.
                >
                  🖨️ Download Graphs (PDF)
                </button>
              )}
              {isAdmin && (
                <a
                  href="/api/admin/exports/directory.csv"
                  className="hdr-pill hdr-pill-primary"
                  download="HUCM_Faculty_Directory.csv"
                >
                  ⬇ Clean Directory CSV
                </a>
              )}
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

        {/* Tiny client island that wires up the data-action="print" buttons. */}
        {isAdmin && (
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: `document.addEventListener('click',function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute('data-action')==='print'){window.print();}});`,
            }}
          />
        )}
      </body>
    </html>
  );
}

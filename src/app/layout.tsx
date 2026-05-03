import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { TopNav } from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'HUCM Office of Faculty Development — Impact Dashboard',
  description: 'Enterprise Faculty Development Metrics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header>
          <img src="/hucm_logo.png" className="hdr-logo" alt="HUCM Seal" />
          <div>
            <h1 style={{ fontFamily: '"Garamond", "EB Garamond", serif', fontSize: '1.4rem' }}>
              Howard University College of Medicine — Impact Dashboard
            </h1>
            <p>Office of Faculty Development and JEDI · Programming Tracker</p>
          </div>
          <div className="hdr-badge">
            Cloud Synchronized Environment
            <br />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
              <a href="/legacy_dashboard.html" target="_blank" rel="noopener noreferrer" style={{ padding: '4px 10px', background: 'var(--c1)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}>
                📈 Launch Legacy View
              </a>
              <Link href="/admin/ingestion" style={{ padding: '4px 10px', background: '#FCA47C', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none' }}>
                ⚙️ Manage Data
              </Link>
            </div>
          </div>
        </header>

        <TopNav />

        <div className="tab-pane active" id="tab-overview">
          {children}
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import Image from 'next/image';

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
          <img src="/hucm_logo.png" style={{ width: '90px', height: '90px', objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }} alt="HUCM Seal" />
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

        <div className="tab-bar">
          <Link href="/" className="tab-btn active">Overview</Link>
          <Link href="/series" className="tab-btn">By Series</Link>
          <Link href="/engagement" className="tab-btn">Engagement</Link>
          <Link href="/drilldown" className="tab-btn">Impact Drilldown</Link>
          <Link href="/roster" className="tab-btn">Event Roster</Link>
          <Link href="/directory" className="tab-btn">Directory</Link>
          <Link href="/methods" className="tab-btn">Data & Methods</Link>
        </div>

        <div className="tab-pane active" id="tab-overview">
          {children}
        </div>
      </body>
    </html>
  );
}

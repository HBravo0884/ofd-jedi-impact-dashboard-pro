import Link from 'next/link';
import styles from './Navigation.module.css';

export default function Navigation() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.logoMark}>HU</div>
        <div>
          <h1 className="serif-title" style={{ fontSize: '1.4rem', fontWeight: 700 }}>Howard University College of Medicine — Impact Dashboard</h1>
          <p style={{ fontSize: '0.76rem', opacity: 0.82, marginTop: '3px' }}>Office of Faculty Development and JEDI · Programming Tracker</p>
        </div>
        
        <div className={styles.hdrBadge}>
           Cloud Synchronized
           <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
              <Link href="/admin/ingestion" className={styles.btnManage}>⚙️ Manage Data</Link>
           </div>
        </div>
      </header>

      <div className={styles.tabBar}>
        <Link href="/" className={`${styles.tabBtn} ${styles.active}`}>Overview</Link>
        <Link href="/series" className={styles.tabBtn}>By Series</Link>
        <Link href="/engagement" className={styles.tabBtn}>Engagement</Link>
        <Link href="/drilldown" className={styles.tabBtn}>Impact Drilldown</Link>
        <Link href="/directory" className={styles.tabBtn}>Directory</Link>
      </div>
    </>
  );
}

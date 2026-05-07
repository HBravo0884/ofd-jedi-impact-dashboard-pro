import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';

export const revalidate = 0;

export default async function MethodsPage() {
  const jar = await cookies();
  const isAdmin = await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value);

  return (
    <>
      <div className="sec">Data &amp; Methods Blueprint</div>
      <div
        className="methods-card"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          padding: 'clamp(16px, 3vw, 28px)',
          lineHeight: 1.55,
        }}
      >
        <h2 style={methodsH2}>Data Pipeline &amp; Methodology</h2>
        <p style={methodsP}>
          This dashboard is driven by an automated, self-healing Python data ingestion
          pipeline designed for high-integrity institutional reporting. The system merges
          unstructured Zoom attendance reports with master institutional hierarchies to
          build a perfectly deduplicated dataset.
        </p>

        <h2 style={methodsH2}>Data Processing &amp; Exclusions</h2>
        <p style={methodsP}>
          Raw event data enters a strict series of exclusion funnels to strip artifacts
          and outliers:
        </p>
        <ul style={methodsUl}>
          <li>
            <strong>Category Exclusions:</strong> Recurring internal syncs (e.g.,{' '}
            <em>Faculty Meetings</em>, <em>OFD check-ins</em>, and{' '}
            <em>general Seminars</em>) are categorically omitted from tracking, isolating
            the dataset to programmatic OFD impact.
          </li>
          <li>
            <strong>Micro-Session Trim (10-Minute Limit):</strong> Attendance logs
            shorter than 10 cumulative minutes per session are automatically classified
            as dropped connections or misclicks and are permanently scrubbed.
          </li>
          <li>
            <strong>Ghost Session Filter (&lt; 5 pax):</strong> Any session logging fewer
            than 5 unique participants is flagged as a test run or administrative setup
            and entirely erased from the aggregated metrics.
          </li>
          <li>
            <strong>Orphaned Device Burner:</strong> Unauthenticated connections
            generically named (e.g., "iPhone", "iPad", "Room 4") lacking verified emails
            are systematically deleted.
          </li>
        </ul>

        <h2 style={methodsH2}>Identity Consolidation (Fuzzy Matching Engine)</h2>
        <p style={methodsP}>
          Zoom data frequently fragments an individual's identity across aliases (e.g.,
          "Dr. Smith", "Smith, John, MD"). The pipeline invokes a cascading deduplication
          protocol:
        </p>
        <ul style={methodsUl}>
          <li>
            <strong>Pass 1: Name Canonicalization.</strong> Pre-processing instantly
            obliterates suffixes, prefixes ("Dr.", "MD", "PhD"), and structural
            characters to establish a core canonical base string.
          </li>
          <li>
            <strong>Pass 2: Email Trust Authentication.</strong> If multiple aliases
            share an identical email address, they are forcefully consolidated under a
            single master profile.
          </li>
          <li>
            <strong>Pass 3: Levenshtein Interlock.</strong> The engine calculates the
            Levenshtein distance across all unmatched aliases. Entries exhibiting &gt;90%
            textual similarity are merged <em>only if</em> their historical department
            and email metadata do not logically intersect, preventing two similar
            distinct individuals from incorrectly merging.
          </li>
        </ul>

        <h2 style={methodsH2}>Hierarchy &amp; Credential Synchronization</h2>
        <p style={methodsP}>
          Once identities are consolidated, the pipeline references multiple
          administrative layers:
        </p>
        <ul style={methodsUl}>
          <li>
            <strong>Master Roster Sync:</strong> Ingests external datasets (
            <code>*MASTER.ROSTER*.xlsx</code> and <code>*Administrative Units*.xlsx</code>)
            to backfill missing departmental sub-divisions.
          </li>
          <li>
            <strong>Additive Org Chart Sync:</strong> Recursively follows "Reports To"
            inheritance chains. If Dr. A's department is unknown but they report to Dr.
            B (a known Surgery director), the system categorizes Dr. A under Surgery.
          </li>
          <li>
            <strong>Credential Inference:</strong> Based on academic rank and department
            classification (Clinical vs Research), the system dynamically infers the
            appropriate degree mapping (e.g., Clinical Faculty default to MD).
          </li>
        </ul>

        <h2 style={methodsH2}>Data Governance ("God Mode")</h2>
        <p style={methodsP}>
          To assure absolute data fidelity, the pipeline architecture supports
          administrative override schemas:
        </p>
        <ul style={methodsUl}>
          <li>
            <strong>Quarantine Protocol:</strong> Any surviving profile lacking a valid
            Department assignment triggers a quarantine. These profiles are barred from
            entering the UI and exported for human vetting.
            {isAdmin && (
              <>
                <br />
                <a
                  href="/api/admin/exports/missing-metadata.csv"
                  style={methodsDlBtn(
                    'var(--c4)' /* yellow */
                  )}
                >
                  ⬇ Download Quarantined Profiles
                </a>
              </>
            )}
          </li>
          <li>
            <strong>Absolute Overrides:</strong> A locally hosted file acts as the
            ultimate truth. Administrators can use this schema to forcefully assert
            credentials, redirect merge failures, or execute permanent deletions (
            <code>action_delete='X'</code>) that supersede all algorithmic logic.
            {isAdmin && (
              <>
                <br />
                <a
                  href="/api/admin/exports/directory-overrides.csv"
                  style={methodsDlBtn('var(--c1)')}
                >
                  ⬇ Download Override Schema
                </a>
              </>
            )}
          </li>
        </ul>

        <h2 style={methodsH2}>Non-Human Accounts Removed</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {[
            "Heath's AI Notetaker",
            "Stanley's Notetaker (Otter.ai)",
            "Jabari's Notetaker (Otter.ai)",
            'Read.ai Meeting Notes',
            'iPhone',
            'Lisa Gales iPhone',
            'Vercetti 14 Pro Max',
            'Zoom User',
            'Family Fatih Health Clinic',
          ].map((b) => (
            <span key={b} style={badgeStyle}>
              {b}
            </span>
          ))}
        </div>

        <h2 style={methodsH2}>Department Taxonomy</h2>
        <p style={methodsP}>
          Labels normalized to HUCM academic structure. Key consolidations:
          Gastroenterology → <strong>Internal Medicine</strong>; Physiology variants →{' '}
          <strong>Physiology &amp; Biophysics</strong>; Biochem →{' '}
          <strong>Biochemistry &amp; Molecular Biology</strong>; CFM →{' '}
          <strong>Community &amp; Family Medicine</strong>; Transplant →{' '}
          <strong>Surgery</strong>; HUCM/College of Medicine →{' '}
          <strong>Dean's Office / COM Admin</strong>.
        </p>
        <p style={{ ...methodsP, fontSize: '0.78rem', color: 'var(--muted)' }}>
          Department coverage: <strong>99%</strong> of unique participants have a
          confirmed department. Session counts reflect unique date × topic combinations.
        </p>
      </div>
    </>
  );
}

const methodsH2: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  color: 'var(--c1d)',
  marginTop: 22,
  marginBottom: 8,
  paddingBottom: 4,
  borderBottom: '1px solid var(--border)',
};
const methodsP: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text)',
  marginTop: 6,
  marginBottom: 6,
};
const methodsUl: React.CSSProperties = {
  margin: '6px 0 6px 22px',
  fontSize: '0.9rem',
  color: 'var(--text)',
  lineHeight: 1.6,
};
const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  fontSize: '0.78rem',
  color: 'var(--c1d)',
  fontWeight: 600,
};
function methodsDlBtn(bg: string): React.CSSProperties {
  return {
    display: 'inline-block',
    marginTop: 6,
    marginBottom: 6,
    background: bg,
    color: '#fff',
    padding: '4px 10px',
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: 600,
  };
}

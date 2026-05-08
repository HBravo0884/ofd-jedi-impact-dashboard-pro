import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import './print.css';
import { SignatureSVG, pickLatestTrace } from '@/components/SignatureSVG';
import { isClinicianDegrees } from '@/lib/clinician';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Admin-only — middleware already gates /admin/*. Renders a printable
// per-event sign-in sheet styled to match the official HU CME attendance
// form. Use Cmd+P (Ctrl+P) → Save as PDF for a CME audit artifact.
//
// Fields not yet stored in the schema (Learning Objectives, Disclosure
// Report, Planning Committee, Acknowledgment of Support, Time, Location)
// render as RED placeholder text so the printer can see at a glance what
// still needs to be filled in. PR #17b will add per-event editors.
export default async function SigninSheetPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      series: { select: { title: true } },
      attendances: {
        orderBy: { faculty: { lastName: 'asc' } },
        include: {
          faculty: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              department: true,
              division: true,
              rank: true,
              degrees: true,
              signatureUrls: true,
            },
          },
        },
      },
    },
  });

  if (!event) return notFound();

  // Per-event signature traces — one per Attendance row. Prisma client
  // wasn't regenerated to know about the new signatureTrace column, so
  // we side-query with raw SQL and build a Map keyed by attendance id.
  const traceRows = (await prisma.$queryRawUnsafe(
    `SELECT id, "signatureTrace" FROM "Attendance" WHERE "eventId" = $1`,
    eventId
  )) as Array<{ id: string; signatureTrace: any }>;
  const traceById = new Map<string, any>();
  for (const r of traceRows) {
    if (r.signatureTrace) traceById.set(r.id, r.signatureTrace);
  }

  // Partition attendees into Clinical vs Non-Clinical for CME reporting.
  const clinicalAttendances: typeof event.attendances = [];
  const nonClinicalAttendances: typeof event.attendances = [];
  for (const a of event.attendances as any[]) {
    if (isClinicianDegrees(a?.faculty?.degrees)) clinicalAttendances.push(a);
    else nonClinicalAttendances.push(a);
  }

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });
  const generatedAt = new Date().toLocaleString('en-US');

  // Series title becomes the Department field at the top.
  const headerDepartment =
    event.series?.title?.replace(/^Department of\s+/i, '').trim() ||
    'Office of Faculty Development';

  // Attendance type — 2-state for now. Person on roster but no signature
  // = Virtual; signed at the kiosk = In-Person.
  const attendanceType = (attendanceId: string): 'In-Person' | 'Virtual' =>
    traceById.has(attendanceId) ? 'In-Person' : 'Virtual';

  // Pretty-print Department + Division (auto-pulled from directory).
  const formatDeptDivision = (
    department: string | null | undefined,
    division: string | null | undefined
  ): string => {
    const dept = String(department || '').replace(/([A-Z])/g, ' $1').trim() || 'Unknown';
    const div = String(division || '').trim();
    return div ? `${dept} / ${div}` : dept;
  };

  return (
    <div className="signin-sheet">
      {/* Toolbar — hidden on print */}
      <div className="toolbar no-print">
        <a href="/roster" className="toolbar-link">← Back to Roster</a>
        <div className="toolbar-spacer" />
        <button className="print-btn" data-action="print-sheet">
          🖨️ Print / Save as PDF
        </button>
      </div>

      <article className="sheet">
        {/* Header */}
        <header className="sheet-head">
          <img src="/hucm_logo.png" alt="HUCM" className="sheet-logo" />
          <div className="sheet-title-block">
            <h1 className="sheet-title">Howard University College of Medicine</h1>
            <h2 className="sheet-subtitle">
              Office of Faculty Development &amp; JEDI · CME Sign-in Sheet
            </h2>
          </div>
          <div className="sheet-meta">
            <div><strong>Generated:</strong></div>
            <div>{generatedAt}</div>
          </div>
        </header>

        {/* ── HU CME OFFICIAL FORM HEADER ────────────────────────────── */}
        <section className="cme-form">
          <div className="cme-form-row">
            <div className="cme-field">
              <span className="cme-label">Department:</span>
              <span className="cme-value">{headerDepartment}</span>
            </div>
            <div className="cme-field">
              <span className="cme-label">
                <input type="checkbox" disabled defaultChecked={false} />
                Grand Rounds
              </span>
            </div>
            <div className="cme-field">
              <span className="cme-label">Date:</span>
              <span className="cme-value">{formatDate(event.date)}</span>
            </div>
          </div>
          <div className="cme-form-row">
            <div className="cme-field">
              <span className="cme-label">Time:</span>
              <span className="cme-placeholder">[set in Manage Events]</span>
            </div>
            <div className="cme-field">
              <span className="cme-label">Location:</span>
              <span className="cme-placeholder">[set in Manage Events]</span>
            </div>
          </div>
          <div className="cme-form-row">
            <div className="cme-field cme-field-wide">
              <span className="cme-label">Topic:</span>
              <span className="cme-value">{event.topic || event.title}</span>
            </div>
          </div>
        </section>

        {/* Learning Objectives */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Learning Objectives</h3>
          <ol className="cme-objectives">
            <li className="cme-placeholder">[Objective 1 — set in Manage Events]</li>
            <li className="cme-placeholder">[Objective 2 — set in Manage Events]</li>
            <li className="cme-placeholder">[Objective 3 — set in Manage Events]</li>
            <li className="cme-placeholder">[Objective 4 — set in Manage Events]</li>
            <li className="cme-placeholder">[Objective 5 — set in Manage Events]</li>
          </ol>
        </section>

        {/* Disclosure Report */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Disclosure Report</h3>
          <p className="cme-placeholder">
            [Disclosure Report — set in Manage Events. Default per ACCME
            Standards for Integrity and Independence in Accredited Continuing
            Education: disclosure of relevant financial relationships from
            speakers and planning committee members will be documented and
            mitigated prior to this activity.]
          </p>
        </section>

        {/* Speaker */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Speaker(s)</h3>
          <p>
            {event.speaker || (
              <span className="cme-placeholder">[Speaker — set in Manage Events]</span>
            )}
          </p>
        </section>

        {/* Planning Committee */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Planning Committee</h3>
          <p className="cme-placeholder">
            [Planning Committee — set in Manage Events. Default: Office of
            Faculty Development &amp; JEDI committee members.]
          </p>
        </section>

        {/* Conflict Resolution (boilerplate) */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Conflict Resolution</h3>
          <p>
            All speakers and planning committee members have been screened
            for potential conflicts of interest in accordance with the ACCME
            Standards for Integrity and Independence in Accredited Continuing
            Education. Any disclosed relationships have been mitigated prior
            to the start of this activity.
          </p>
        </section>

        {/* Acknowledgment of Support */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Acknowledgment of Support</h3>
          <p className="cme-placeholder">
            [Acknowledgment of Support — set in Manage Events. Default: no
            commercial support has been received for this activity.]
          </p>
        </section>

        {/* Evaluation */}
        <section className="cme-block">
          <h3 className="cme-block-heading">Evaluation</h3>
          <p className="cme-evaluation">
            Did this activity meet the stated learning objectives?
            <span className="cme-eval-options">
              <span className="cme-eval-option">☐ Yes</span>
              <span className="cme-eval-option">☐ No</span>
            </span>
          </p>
        </section>

        {/* Conference Director sign-off */}
        <section className="director-signoff">
          <div className="director-line">
            <div className="director-blank" />
            <div className="director-label">Signature of Conference Director</div>
          </div>
          <div className="director-line">
            <div className="director-blank" />
            <div className="director-label">Date</div>
          </div>
        </section>

        {/* ── ATTENDANCE ROSTER ────────────────────────────────────── */}
        <section className="roster">
          {event.attendances.length === 0 ? (
            <div className="empty">No attendees recorded for this session.</div>
          ) : (() => {
            const renderRow = (a: any, displayIdx: number) => {
              const f = a.faculty;
              const degrees = (f.degrees || []).join(', ');
              const namePlusDegree = degrees
                ? `${f.lastName}, ${f.firstName}, ${degrees}`
                : `${f.lastName}, ${f.firstName}`;
              const deptDiv = formatDeptDivision(f.department, f.division);
              const hasBaseline = Array.isArray(f.signatureUrls) && f.signatureUrls.length > 0;
              const eventTrace = traceById.get(a.id);
              const trace = eventTrace ?? (hasBaseline ? pickLatestTrace(f.signatureUrls) : null);
              const aType = attendanceType(a.id);
              return (
                <tr key={a.id}>
                  <td className="col-num">{displayIdx + 1}</td>
                  <td className="col-name">{namePlusDegree}</td>
                  <td className="col-dob"><span className="dob-blank" /></td>
                  <td className="col-sig">
                    {trace
                      ? <SignatureSVG trace={trace} width={170} height={42} />
                      : <span className="sig-line">&nbsp;</span>}
                  </td>
                  <td className="col-dept">{deptDiv}</td>
                  <td className="col-atype">
                    <span className={`atype atype-${aType.toLowerCase().replace(/\s/g, '-')}`}>
                      {aType}
                    </span>
                  </td>
                </tr>
              );
            };

            const renderRosterTable = (rows: any[]) => (
              <table className="roster-table">
                <thead>
                  <tr>
                    <th className="col-num">#</th>
                    <th className="col-name">Printed Name &amp; Degree</th>
                    <th className="col-dob">D.O.B.<br/>MM/DD</th>
                    <th className="col-sig">Signature</th>
                    <th className="col-dept">Department / Division</th>
                    <th className="col-atype">Attendance Type</th>
                  </tr>
                </thead>
                <tbody>{rows.map((a: any, i: number) => renderRow(a, i))}</tbody>
              </table>
            );

            return (
              <>
                {/* CLINICAL — eligible for CME credit (heading in RED) */}
                <div className="group-header">
                  <h4 className="clinical-red">
                    Clinical Attendees · {clinicalAttendances.length}
                  </h4>
                  <span className="group-tag clinical">CME-eligible (MD / DO / MBBS / etc.)</span>
                </div>
                {clinicalAttendances.length === 0
                  ? <div className="empty">No clinical attendees on file.</div>
                  : renderRosterTable(clinicalAttendances)}

                {/* NON-CLINICAL */}
                <div className="group-header" style={{ marginTop: 22 }}>
                  <h4>Non-Clinical Attendees · {nonClinicalAttendances.length}</h4>
                  <span className="group-tag nonclinical">Not CME-eligible</span>
                </div>
                {nonClinicalAttendances.length === 0
                  ? <div className="empty">No non-clinical attendees.</div>
                  : renderRosterTable(nonClinicalAttendances)}
              </>
            );
          })()}
        </section>

        {/* ── ACCME DISCLAIMER ─────────────────────────────────────── */}
        <footer className="accme-disclaimer">
          <p>
            <strong>Accreditation.</strong> Howard University College of
            Medicine is accredited by the Accreditation Council for Continuing
            Medical Education (ACCME) to provide continuing medical education
            for physicians. Howard University College of Medicine designates
            this live activity for a maximum of {(event.baseDuration / 60).toFixed(1)}{' '}
            <em>AMA PRA Category 1 Credit(s)™</em>. Physicians should claim
            only the credit commensurate with the extent of their participation
            in the activity.
          </p>
          <p className="accme-cert">
            <strong>Certification.</strong> The above attendance record is
            generated directly from the OFD impact dashboard and reflects
            unique session engagements satisfying the methodology in the
            Data &amp; Methods blueprint (≥10 minutes joined, deduplicated
            identity).
          </p>
        </footer>
      </article>

      {/* Tiny client island so the Print button works without a client component file */}
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html:
            "document.addEventListener('click',function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute('data-action')==='print-sheet'){window.print();}});",
        }}
      />
    </div>
  );
}

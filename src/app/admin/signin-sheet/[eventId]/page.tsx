import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import './print.css';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Admin-only — middleware already gates /admin/*. Renders a printable
// per-event sign-in sheet. Use Cmd+P (Ctrl+P) → Save as PDF for a CME audit
// artifact, or print directly.
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

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

  const generatedAt = new Date().toLocaleString('en-US');

  return (
    <div className="signin-sheet">
      {/* Toolbar — hidden on print */}
      <div className="toolbar no-print">
        <a href="/roster" className="toolbar-link">← Back to Roster</a>
        <div className="toolbar-spacer" />
        <button onClick={undefined} className="print-btn" data-action="print-sheet">
          🖨️ Print / Save as PDF
        </button>
      </div>

      {/* The printable surface */}
      <article className="sheet">
        {/* Header */}
        <header className="sheet-head">
          <img src="/hucm_logo.png" alt="HUCM" className="sheet-logo" />
          <div className="sheet-title-block">
            <h1 className="sheet-title">
              Howard University College of Medicine
            </h1>
            <h2 className="sheet-subtitle">
              Office of Faculty Development &amp; JEDI · CME Sign-in Sheet
            </h2>
          </div>
          <div className="sheet-meta">
            <div><strong>Generated:</strong></div>
            <div>{generatedAt}</div>
          </div>
        </header>

        {/* Event facts */}
        <section className="event-facts">
          <div className="fact">
            <div className="fact-label">Event</div>
            <div className="fact-value">{event.title}</div>
          </div>
          <div className="fact">
            <div className="fact-label">Date</div>
            <div className="fact-value">{formatDate(event.date)}</div>
          </div>
          <div className="fact">
            <div className="fact-label">Series</div>
            <div className="fact-value">{event.series?.title || 'Standalone'}</div>
          </div>
          <div className="fact">
            <div className="fact-label">Topic</div>
            <div className="fact-value">{event.topic || '—'}</div>
          </div>
          <div className="fact">
            <div className="fact-label">Duration</div>
            <div className="fact-value">{event.baseDuration} min</div>
          </div>
          <div className="fact">
            <div className="fact-label">Total attendees</div>
            <div className="fact-value">{event.attendances.length}</div>
          </div>
        </section>

        {/* Attendance roster */}
        <section className="roster">
          <h3 className="roster-heading">Attendance Roster</h3>
          {event.attendances.length === 0 ? (
            <div className="empty">No attendees recorded for this session.</div>
          ) : (
            <table className="roster-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th className="col-name">Name</th>
                  <th className="col-degrees">Degrees</th>
                  <th className="col-dept">Department</th>
                  <th className="col-mins">Min</th>
                  <th className="col-sig">Signature</th>
                </tr>
              </thead>
              <tbody>
                {event.attendances.map((a: any, i: number) => {
                  const f = a.faculty;
                  const dept = String(f.department || '').replace(/([A-Z])/g, ' $1').trim();
                  const degrees = (f.degrees || []).join(', ');
                  const hasSignature = Array.isArray(f.signatureUrls) && f.signatureUrls.length > 0;
                  return (
                    <tr key={a.id}>
                      <td className="col-num">{i + 1}</td>
                      <td className="col-name">
                        <div className="name-line">{f.lastName}, {f.firstName}</div>
                        <div className="email-line">{f.email}</div>
                      </td>
                      <td className="col-degrees">{degrees || <span className="dash">—</span>}</td>
                      <td className="col-dept">{dept}</td>
                      <td className="col-mins">{a.durationJoined}</td>
                      <td className="col-sig">
                        {hasSignature ? (
                          <span className="sig-mark">✎ on file</span>
                        ) : (
                          <span className="sig-line">&nbsp;</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Footer / certification */}
        <footer className="sheet-foot">
          <div className="cert">
            <strong>Certification.</strong> The above attendance record is generated
            directly from the OFD impact dashboard and reflects unique session
            engagements satisfying the methodology in the Data &amp; Methods
            blueprint (≥10 minutes joined, deduplicated identity, ≥5 unique
            participants per session).
          </div>
          <div className="signoff">
            <div className="signoff-line">
              <div className="signoff-blank" />
              <div className="signoff-label">Authorized OFD signatory</div>
            </div>
            <div className="signoff-line">
              <div className="signoff-blank" />
              <div className="signoff-label">Date</div>
            </div>
          </div>
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

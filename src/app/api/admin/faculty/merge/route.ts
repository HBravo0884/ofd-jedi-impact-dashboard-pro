import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── POST /api/admin/faculty/merge ─────────────────────────────────────────
// Admin-only. Merge `sourceId` into `targetId`:
//
//   1. Move every Attendance from source → target. If target already has
//      an attendance for that event (same (facultyId, eventId)), SUM
//      durations into target's row.
//   2. Union source's aliases, degrees, and signatureUrls arrays into
//      target's. Also push source's full display name as an alias so the
//      next ingest's T3 fuzzy matcher catches it.
//   3. Promote target's status to VERIFIED if either side was VERIFIED.
//   4. Delete source.
//
// The whole thing runs in a Prisma transaction so a partial failure leaves
// both rows intact.
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const sourceId = String(body.sourceId || '').trim();
  const targetId = String(body.targetId || '').trim();
  if (!sourceId || !targetId) return NextResponse.json({ error: 'sourceId and targetId required' }, { status: 400 });
  if (sourceId === targetId)  return NextResponse.json({ error: 'Cannot merge a faculty into itself.' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const source = await tx.faculty.findUnique({
        where: { id: sourceId },
        include: { attendances: true },
      });
      const target = await tx.faculty.findUnique({ where: { id: targetId } });
      if (!source) throw new Error('Source faculty not found.');
      if (!target) throw new Error('Target faculty not found.');

      // Move attendances. Use upsert so collisions sum durations.
      let movedCount = 0;
      let mergedDurations = 0;
      for (const a of source.attendances) {
        const existing = await tx.attendance.findUnique({
          where: { facultyId_eventId: { facultyId: targetId, eventId: a.eventId } },
        });
        if (existing) {
          // Sum durations and drop the source row.
          await tx.attendance.update({
            where: { facultyId_eventId: { facultyId: targetId, eventId: a.eventId } },
            data: { durationJoined: existing.durationJoined + a.durationJoined },
          });
          await tx.attendance.delete({ where: { id: a.id } });
          mergedDurations += 1;
        } else {
          // Re-point this attendance row at the target.
          await tx.attendance.update({
            where: { id: a.id },
            data: { facultyId: targetId },
          });
          movedCount += 1;
        }
      }

      // Union arrays. Also push source's "Last, First" as an alias so
      // a future ingest with that exact display name resolves via T3.
      const sourceDisplay = `${source.firstName} ${source.lastName}`.trim();
      const mergedAliases = Array.from(new Set([
        ...(target.aliases || []),
        ...(source.aliases || []),
        sourceDisplay,
      ].map((s: string) => s.trim()).filter(Boolean)));
      const mergedDegrees = Array.from(new Set([
        ...(target.degrees || []),
        ...(source.degrees || []),
      ].filter(Boolean)));
      const mergedSignatureUrls = Array.from(new Set([
        ...(target.signatureUrls || []),
        ...(source.signatureUrls || []),
      ].filter(Boolean)));

      const newStatus =
        target.status === 'VERIFIED' || source.status === 'VERIFIED'
          ? 'VERIFIED' : target.status;

      const updatedTarget = await tx.faculty.update({
        where: { id: targetId },
        data: {
          aliases: mergedAliases,
          degrees: mergedDegrees,
          signatureUrls: mergedSignatureUrls,
          status: newStatus,
        },
        select: {
          id: true, firstName: true, lastName: true, email: true,
          department: true, division: true, rank: true, status: true,
          aliases: true, degrees: true,
          _count: { select: { attendances: true } },
        },
      });

      // Delete source. Cascading FKs already handled attendances above.
      await tx.faculty.delete({ where: { id: sourceId } });

      return {
        target: updatedTarget,
        movedAttendances: movedCount,
        mergedConflicts: mergedDurations,
        sourceName: sourceDisplay,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Faculty merge failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

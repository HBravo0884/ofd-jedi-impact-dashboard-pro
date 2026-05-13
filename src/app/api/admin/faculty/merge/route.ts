import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── POST /api/admin/faculty/merge ─────────────────────────────────────────
// Bulletproof faculty merge — same pattern as event merge:
//   - Bulk updateMany for non-collisions
//   - Per-row exact-duplicate vs additive handling for collisions
//   - Explicit zero-attendance verification before delete
//   - Unions aliases / degrees / signatures into target
//   - Promotes target to VERIFIED if either side was
export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const sourceId = String(body.sourceId || '').trim();
  const targetId = String(body.targetId || '').trim();
  if (!sourceId || !targetId) {
    return NextResponse.json({ error: 'sourceId and targetId required' }, { status: 400 });
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'Cannot merge a faculty into itself.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const source = await tx.faculty.findUnique({
        where: { id: sourceId },
        select: {
          id: true, firstName: true, lastName: true,
          aliases: true, degrees: true, signatureUrls: true, status: true,
        },
      });
      const target = await tx.faculty.findUnique({
        where: { id: targetId },
        select: {
          id: true, firstName: true, lastName: true,
          aliases: true, degrees: true, signatureUrls: true, status: true,
        },
      });
      if (!source) throw new Error('Source faculty not found.');
      if (!target) throw new Error('Target faculty not found.');

      const targetAtt = await tx.attendance.findMany({
        where: { facultyId: targetId },
        select: { eventId: true, durationJoined: true },
      });
      const targetByEvent = new Map<string, number>(
        (targetAtt as Array<{ eventId: string; durationJoined: number }>).map(
          (a) => [a.eventId, a.durationJoined],
        ),
      );

      const sourceAtt = await tx.attendance.findMany({
        where: { facultyId: sourceId },
        select: { id: true, eventId: true, durationJoined: true },
      });
      const startingTargetCount = targetByEvent.size;
      const startingSourceCount = sourceAtt.length;

      const collisionEventIds = sourceAtt
        .filter((a: any) => targetByEvent.has(a.eventId))
        .map((a: any) => a.eventId);

      let mergedAdditive = 0;
      let exactDuplicates = 0;
      for (const eventId of collisionEventIds) {
        const sourceRow = sourceAtt.find((a: any) => a.eventId === eventId);
        if (!sourceRow) continue;
        const existingDur = targetByEvent.get(eventId) || 0;
        if (existingDur === sourceRow.durationJoined) {
          await tx.attendance.delete({ where: { id: sourceRow.id } });
          exactDuplicates += 1;
        } else {
          await tx.attendance.update({
            where: { facultyId_eventId: { facultyId: targetId, eventId } },
            data: { durationJoined: existingDur + sourceRow.durationJoined },
          });
          await tx.attendance.delete({ where: { id: sourceRow.id } });
          mergedAdditive += 1;
        }
      }
      const mergedConflicts = mergedAdditive + exactDuplicates;

      const bulkResult = await tx.attendance.updateMany({
        where: { facultyId: sourceId },
        data: { facultyId: targetId },
      });
      const movedAttendances = bulkResult.count;

      const remaining = await tx.attendance.count({ where: { facultyId: sourceId } });
      if (remaining > 0) {
        throw new Error(
          `Refused to delete source faculty: ${remaining} attendance row(s) ` +
          `still reference it. Transaction rolled back.`,
        );
      }

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

      await tx.faculty.delete({ where: { id: sourceId } });

      const finalTargetCount = await tx.attendance.count({ where: { facultyId: targetId } });
      const expectedTargetCount = startingTargetCount + startingSourceCount - mergedConflicts;
      if (finalTargetCount !== expectedTargetCount) {
        throw new Error(
          `Merge math mismatch — target has ${finalTargetCount} attendances, ` +
          `expected ${expectedTargetCount}. Transaction rolled back.`,
        );
      }

      return {
        target: updatedTarget,
        sourceName: sourceDisplay,
        startingSourceCount,
        startingTargetCount,
        movedAttendances,
        mergedConflicts,
        mergedAdditive,
        exactDuplicates,
        finalTargetCount,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Faculty merge failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

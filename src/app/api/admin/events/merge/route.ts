import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── POST /api/admin/events/merge ─────────────────────────────────────────
// Admin-only. Bulletproof event merge:
//
//   1. updateMany() to bulk-move every non-conflicting source attendance
//      to target — single SQL, no per-row referential-action risk.
//   2. For collisions on the same faculty:
//      EXACT DUPLICATE (source.duration === target.duration) →
//        drop source row, keep target unchanged (true double-record)
//      ADDITIVE (different durations) →
//        sum into target (likely a log-out / re-join scenario)
//   3. Explicitly VERIFY zero source attendances remain before deleting
//      the source event. Abort the transaction otherwise.
//   4. Return final counts so the UI can confirm everything moved.
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
    return NextResponse.json({ error: 'Cannot merge an event into itself.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const source = await tx.event.findUnique({
        where: { id: sourceId },
        select: { id: true, title: true },
      });
      const target = await tx.event.findUnique({
        where: { id: targetId },
        select: { id: true, title: true },
      });
      if (!source) throw new Error('Source event not found.');
      if (!target) throw new Error('Target event not found.');

      const targetAtt = await tx.attendance.findMany({
        where: { eventId: targetId },
        select: { facultyId: true, durationJoined: true },
      });
      const targetByFaculty = new Map<string, number>(
        (targetAtt as Array<{ facultyId: string; durationJoined: number }>).map(
          (a) => [a.facultyId, a.durationJoined],
        ),
      );

      const sourceAtt = await tx.attendance.findMany({
        where: { eventId: sourceId },
        select: { id: true, facultyId: true, durationJoined: true },
      });

      const startingTargetCount = targetByFaculty.size;
      const startingSourceCount = sourceAtt.length;

      const collisionFacultyIds = sourceAtt
        .filter((a: any) => targetByFaculty.has(a.facultyId))
        .map((a: any) => a.facultyId);

      // Handle collisions — exact duplicate vs additive
      let mergedAdditive = 0;
      let exactDuplicates = 0;
      for (const facultyId of collisionFacultyIds) {
        const sourceRow = sourceAtt.find((a: any) => a.facultyId === facultyId);
        if (!sourceRow) continue;
        const existingDur = targetByFaculty.get(facultyId) || 0;
        if (existingDur === sourceRow.durationJoined) {
          await tx.attendance.delete({ where: { id: sourceRow.id } });
          exactDuplicates += 1;
        } else {
          await tx.attendance.update({
            where: { facultyId_eventId: { facultyId, eventId: targetId } },
            data: { durationJoined: existingDur + sourceRow.durationJoined },
          });
          await tx.attendance.delete({ where: { id: sourceRow.id } });
          mergedAdditive += 1;
        }
      }
      const mergedConflicts = mergedAdditive + exactDuplicates;

      // Bulk-move remaining source attendances (no collisions left)
      const bulkResult = await tx.attendance.updateMany({
        where: { eventId: sourceId },
        data: { eventId: targetId },
      });
      const movedAttendances = bulkResult.count;

      // PARANOID CHECK
      const remaining = await tx.attendance.count({ where: { eventId: sourceId } });
      if (remaining > 0) {
        throw new Error(
          `Refused to delete source event: ${remaining} attendance row(s) ` +
          `still reference it. Transaction rolled back.`,
        );
      }

      await tx.event.delete({ where: { id: sourceId } });

      const finalTargetCount = await tx.attendance.count({ where: { eventId: targetId } });
      const expectedTargetCount = startingTargetCount + startingSourceCount - mergedConflicts;
      if (finalTargetCount !== expectedTargetCount) {
        throw new Error(
          `Merge math mismatch — target has ${finalTargetCount} attendances, ` +
          `expected ${expectedTargetCount}. Transaction rolled back.`,
        );
      }

      return {
        sourceTitle: source.title,
        targetTitle: target.title,
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
    console.error('Event merge failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

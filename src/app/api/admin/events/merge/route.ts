import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── POST /api/admin/events/merge ─────────────────────────────────────────
// Admin-only. Merge `sourceId` into `targetId`:
//
//   1. Move every Attendance from source → target. If target already has
//      an attendance for the same faculty (same (facultyId, eventId)),
//      SUM durations into target's row.
//   2. Delete source event (cascade was handled above for surviving rows).
//
// Runs in a transaction so a partial failure leaves both events intact.
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
        include: { attendances: true },
      });
      const target = await tx.event.findUnique({ where: { id: targetId } });
      if (!source) throw new Error('Source event not found.');
      if (!target) throw new Error('Target event not found.');

      let movedAttendances = 0;
      let mergedConflicts = 0;
      for (const a of source.attendances) {
        const existing = await tx.attendance.findUnique({
          where: { facultyId_eventId: { facultyId: a.facultyId, eventId: targetId } },
        });
        if (existing) {
          // Both events recorded this faculty — sum durations into target.
          await tx.attendance.update({
            where: { facultyId_eventId: { facultyId: a.facultyId, eventId: targetId } },
            data: { durationJoined: existing.durationJoined + a.durationJoined },
          });
          await tx.attendance.delete({ where: { id: a.id } });
          mergedConflicts += 1;
        } else {
          // Re-point this attendance row at the target event.
          await tx.attendance.update({
            where: { id: a.id },
            data: { eventId: targetId },
          });
          movedAttendances += 1;
        }
      }

      await tx.event.delete({ where: { id: sourceId } });

      return {
        sourceTitle: source.title,
        targetTitle: target.title,
        movedAttendances,
        mergedConflicts,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Event merge failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

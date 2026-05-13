import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const revalidate = 0;

// ── PATCH /api/admin/faculty/[id] ─────────────────────────────────────────
// Admin-only. Edit any subset of fields on a Faculty row. Body keys that
// aren't present are not touched — so the UI can send {firstName: "X"} to
// rename without clobbering aliases, etc.
//
// Editable fields:
//   firstName, lastName, email, division, department, rank, status
//   aliases (full array — UI sends the curated list after add/remove)
//   degrees (full array — UI sends the curated list after add/remove)
//
// Returns the updated row.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  const data: any = {};
  if (typeof body.firstName === 'string')   data.firstName = body.firstName.trim();
  if (typeof body.lastName === 'string')    data.lastName  = body.lastName.trim();
  if (typeof body.email === 'string')       data.email     = body.email.trim();
  if (typeof body.division === 'string' || body.division === null) {
    data.division = body.division ? String(body.division).trim() : null;
  }
  if (typeof body.department === 'string')  data.department = body.department;
  if (typeof body.rank === 'string')        data.rank       = body.rank;
  if (typeof body.status === 'string')      data.status     = body.status;
  if (typeof body.adminTitle === 'string' || body.adminTitle === null) {
    data.adminTitle = body.adminTitle ? String(body.adminTitle).trim() : null;
  }
  if (typeof body.positionType === 'string' || body.positionType === null) {
    data.positionType = body.positionType ? String(body.positionType).trim() : null;
  }
  if (Array.isArray(body.aliases)) {
    // Dedup + drop empties — aliases are the heart of the learned name
    // matching, so keep them clean.
    data.aliases = Array.from(
      new Set(body.aliases.map((a: any) => String(a || '').trim()).filter(Boolean))
    );
  }
  if (Array.isArray(body.degrees)) {
    data.degrees = Array.from(
      new Set(body.degrees.map((d: any) => String(d || '').trim()).filter(Boolean))
    );
  }

  try {
    const updated = await prisma.faculty.update({
      where: { id },
      data,
      select: {
        id: true, firstName: true, lastName: true, email: true,
        department: true, division: true, rank: true, status: true,
        aliases: true, degrees: true,
        adminTitle: true, positionType: true,
        _count: { select: { attendances: true } },
      },
    });
    return NextResponse.json({ ok: true, faculty: updated });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A faculty with this email already exists.' }, { status: 409 });
    }
    if (err?.code === 'P2025') {
      return NextResponse.json({ error: 'Faculty not found.' }, { status: 404 });
    }
    console.error('Faculty update failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

// ── DELETE /api/admin/faculty/[id] ────────────────────────────────────────
// Admin-only. Refuses to delete a faculty row that has any attendance
// records UNLESS ?force=1 is in the query string. With force, the
// attendance rows are deleted in the same transaction first, then the
// faculty row, so the "remove a person and everything they ever attended"
// path is one atomic operation.
//
// NOTE: Faculty.attendances has onDelete: Cascade in the schema, so the
// faculty delete alone *would* drop the attendances. We still wipe them
// explicitly first, in a transaction, so we can:
//   a) return an accurate deletedAttendances count
//   b) verify the row is gone before reporting success
//   c) protect against partially-cascaded states if a referential trigger
//      ever changes.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const force = new URL(req.url).searchParams.get('force') === '1';

  const attendanceCount = await prisma.attendance.count({ where: { facultyId: id } });
  if (attendanceCount > 0 && !force) {
    return NextResponse.json({
      error: `This faculty has ${attendanceCount} attendance record(s). Pass ?force=1 to delete the faculty AND their attendances.`,
      attendanceCount,
    }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const deletedAttendances = attendanceCount > 0
        ? (await tx.attendance.deleteMany({ where: { facultyId: id } })).count
        : 0;
      await tx.faculty.delete({ where: { id } });
      return { deletedAttendances };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return NextResponse.json({ error: 'Faculty not found.' }, { status: 404 });
    }
    console.error('Faculty delete failed:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

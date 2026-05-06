import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';

export const revalidate = 0;

// Schema-only export — empty CSV with the columns the legacy CSV format
// expected. Use this as a starter file; admins can fill it in and re-import
// via the Manage Data drag-drop in a future PR.
const HEADER = [
  'canonical_name',
  'override_email',
  'override_department',
  'override_rank',
  'override_division',
  'merge_target',
  'action_delete',
  'note',
];

export async function GET() {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return new NextResponse(HEADER.join(',') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="directory_overrides.csv"',
    },
  });
}

import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_MS, issueToken, validatePassword } from '@/lib/adminAuth';

// POST /api/admin/login  { password: string }
// Sets the admin_session cookie on success.
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  const ok = await validatePassword(password);

  if (!ok) {
    // Add a tiny artificial delay to slow down brute force a touch.
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ ok: false, error: 'Incorrect password' }, { status: 401 });
  }

  const token = await issueToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
  return res;
}

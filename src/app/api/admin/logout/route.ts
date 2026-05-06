import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME } from '@/lib/adminAuth';

// POST /api/admin/logout — clears the admin_session cookie.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

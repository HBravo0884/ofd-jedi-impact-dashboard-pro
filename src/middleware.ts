import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PROTECTED_PREFIXES = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const accessToken = request.cookies.get('sb-access-token')?.value;
  const refreshToken = request.cookies.get('sb-refresh-token')?.value;

  if (!accessToken) {
    return redirectToLogin(request);
  }

  // Verify the token is still valid by checking with Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? '',
  });

  if (error || !data.session?.user) {
    const response = redirectToLogin(request);
    response.cookies.delete('sb-access-token');
    response.cookies.delete('sb-refresh-token');
    return response;
  }

  // Optionally restrict to a specific email domain
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (allowedDomain) {
    const email = data.session.user.email ?? '';
    if (!email.endsWith(`@${allowedDomain}`)) {
      return NextResponse.redirect(new URL('/login?error=access_denied', request.url));
    }
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};

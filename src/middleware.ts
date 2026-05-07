import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyToken } from '@/lib/adminAuth';

// Routes that require an admin session.
// Any path starting with one of these prefixes is gated.
const PROTECTED_PREFIXES = ['/drilldown', '/directory', '/roster', '/admin'];

export const config = {
  // Run middleware on every page request EXCEPT static assets, the API admin login/logout
  // routes (those need to be reachable to log in), and Next internals.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|hucm_logo.png|api/admin/login|api/admin/logout|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const requiresAdmin = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (!requiresAdmin) return NextResponse.next();

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const ok = await verifyToken(token);
  if (ok) return NextResponse.next();

  // Not logged in — bounce back to the home page.
  // Using a flag in the URL so the home page can show "Admin access required" if it wants to.
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.searchParams.set('admin_required', '1');
  return NextResponse.redirect(url);
}

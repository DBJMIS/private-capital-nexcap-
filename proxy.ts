import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { createClient } from '@supabase/supabase-js';

import { cacheUserRoleOnHeaders, getUserRole } from '@/lib/auth/get-user-role';
import { getRolePermissions } from '@/lib/auth/get-role-permissions';
import { isAdminRole, pathnameAllowedForRole, VC_PATHNAME_HEADER } from '@/lib/auth/rbac';

function isInviteLandingPath(pathname: string) {
  return /^\/invite\/[^/]+\/?$/.test(pathname);
}

function isInvitePostAuthPath(pathname: string) {
  return /^\/invite\/[^/]+\/post-auth\/?$/.test(pathname);
}

/**
 * Next.js 16+ edge entry (replaces root `middleware.ts`).
 * Auth gate + RBAC + forwarded pathname for `(auth)` layout.
 */
export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(VC_PATHNAME_HEADER, pathname);

  if (pathname === '/unauthorized' || pathname.startsWith('/unauthorized/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i)
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isInviteLandingPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    const login = new URL('/login', req.url);
    login.searchParams.set('callbackUrl', pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (isInvitePostAuthPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const tenantId = typeof token.tenant_id === 'string' ? token.tenant_id : null;
  const jwtRole = typeof token.role === 'string' ? token.role : null;

  if (isAdminRole(jwtRole)) {
    cacheUserRoleOnHeaders(requestHeaders, 'admin');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!tenantId) {
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const dbRole = await getUserRole(supabase, token.email as string, tenantId, requestHeaders);
  const effective = dbRole ?? jwtRole;

  cacheUserRoleOnHeaders(requestHeaders, effective);

  if (!effective) {
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  if (isAdminRole(effective)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const allowedRoutes = await getRolePermissions(supabase, effective, tenantId);
  const allowedByPermissions =
    allowedRoutes.includes('*') ||
    allowedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!allowedByPermissions && !pathnameAllowedForRole(pathname, effective)) {
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  if (effective === 'panel_member' && (pathname === '/dashboard' || pathname === '/')) {
    return NextResponse.redirect(new URL('/assessments', req.url));
  }
  if (effective === 'senior_management' && (pathname === '/dashboard' || pathname === '/')) {
    return NextResponse.redirect(new URL('/portfolio/executive', req.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

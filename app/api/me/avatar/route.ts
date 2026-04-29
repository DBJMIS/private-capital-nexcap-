import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  await requireAuth();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const accessToken = typeof token?.accessToken === 'string' ? token.accessToken : null;

  if (!accessToken) {
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  }

  const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (graphRes.status === 404) {
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  }

  if (!graphRes.ok || !graphRes.body) {
    return NextResponse.json({ error: 'Unable to load avatar' }, { status: 502 });
  }

  return new NextResponse(graphRes.body, {
    status: 200,
    headers: {
      'Content-Type': graphRes.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

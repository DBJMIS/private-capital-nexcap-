/**
 * Shared HTTP helpers for report API routes.
 * File path: lib/reports/http.ts
 */

import { NextResponse } from 'next/server';

const cacheHeaders = {
  'Cache-Control': 'private, max-age=60, s-maxage=60, stale-while-revalidate=120',
};

export function reportsJson<T>(body: T, init?: number): NextResponse {
  return NextResponse.json(body, { status: init ?? 200, headers: cacheHeaders });
}

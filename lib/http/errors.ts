/**
 * Consistent API error responses; avoid leaking Postgres / PostgREST internals.
 * File path: lib/http/errors.ts
 */

import { NextResponse } from 'next/server';

export type ApiErrorJson = { error: string; code?: string };

export function jsonError(message: string, status: number, code?: string): NextResponse<ApiErrorJson> {
  const body: ApiErrorJson = code ? { error: message, code } : { error: message };
  return NextResponse.json(body, { status });
}

/** Use for 5xx paths where `err` may contain sensitive DB details */
export function sanitizeDbError(err: unknown): string {
  if (process.env.NODE_ENV === 'development') {
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
  }
  return 'Request could not be completed';
}

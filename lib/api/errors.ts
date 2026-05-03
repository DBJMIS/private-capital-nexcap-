import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNAUTHORISED'
  | 'UPSTREAM_ERROR'
  | 'PDF_ERROR'
  | 'STREAM_ERROR'
  | 'RATE_LIMIT';

export function apiError(code: ApiErrorCode, clientMessage: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message: clientMessage }, { status });
}

export function logAndReturn(
  error: unknown,
  context: string,
  code: ApiErrorCode,
  clientMessage: string,
  status: number,
): NextResponse {
  console.error(`[${context}]`, error);
  return apiError(code, clientMessage, status);
}

/** For SSE streams — returns a safe event object, never raw message */
export function sseError(clientMessage: string): {
  type: 'error';
  message: string;
} {
  return { type: 'error', message: clientMessage };
}

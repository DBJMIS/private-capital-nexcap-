/**
 * Map Supabase JS / PostgREST failures to actionable messages (esp. local "fetch failed").
 * File path: lib/supabase/query-errors.ts
 */

function stringifyErrorWithCause(e: unknown, depth = 0): string {
  if (depth > 6 || e == null) return '';
  if (e instanceof Error) {
    const parts: string[] = [];
    const m = (e.message ?? '').trim();
    if (m) parts.push(m);
    if (e.cause != null && e.cause !== e) {
      const inner = stringifyErrorWithCause(e.cause, depth + 1);
      if (inner) parts.push(inner);
    }
    return parts.join(' — ');
  }
  if (typeof e === 'object' && e !== null && 'message' in e) {
    return String((e as { message: unknown }).message ?? '');
  }
  return String(e);
}

export function isLikelySupabaseNetworkFailure(e: unknown): boolean {
  const s = stringifyErrorWithCause(e).toLowerCase();
  return (
    s.includes('fetch failed') ||
    s.includes('econnrefused') ||
    s.includes('enotfound') ||
    s.includes('getaddrinfo') ||
    s.includes('etimedout') ||
    s.includes('connect timeout') ||
    s.includes('und_err_connect_timeout') ||
    s.includes('connecttimeouterror') ||
    s.includes('certificate') ||
    s.includes('ssl') ||
    s.includes('socket')
  );
}

/** User- and operator-facing text when report (or other) queries fail. */
export function describeSupabaseLoadFailure(e: unknown): string {
  const detail = stringifyErrorWithCause(e) || 'Unknown error';
  if (isLikelySupabaseNetworkFailure(e)) {
    return (
      'Could not reach Supabase (the HTTP request failed). ' +
      'Confirm NEXT_PUBLIC_SUPABASE_URL points to a running project, SUPABASE_SERVICE_ROLE_KEY is set, ' +
      'and this machine can reach that host (VPN, firewall, or local supabase start). ' +
      `Detail: ${detail}`
    );
  }
  return detail;
}

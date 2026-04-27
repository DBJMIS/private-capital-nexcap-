/**
 * Tenant context for the current request (server only).
 *
 * Never import this from Client Components or shared code that runs in the browser.
 * tenant_id must come from the server-side profile / session, not client guesses.
 *
 * File path: lib/db/tenant.ts
 */

import 'server-only';

import { getProfile } from '@/lib/auth/session';

/**
 * Resolves tenant_id for the authenticated user from vc_profiles (RLS).
 * Returns null if there is no session or no active profile.
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const profile = await getProfile();
  return profile?.tenant_id ?? null;
}

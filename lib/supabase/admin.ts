import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Service role client — bypasses RLS. Use only after verifying the caller
 * (e.g. fund_manager owns the application / questionnaire).
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Same client as {@link createServiceRoleClient}; use after auth/tenant checks (e.g. assistant queries). */
export function createAdminClient() {
  return createServiceRoleClient();
}

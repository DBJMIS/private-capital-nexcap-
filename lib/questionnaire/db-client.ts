import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { Profile } from '@/types/auth';

/**
 * Fund managers are not included in vc_can_write_standard() RLS helpers.
 * After verifying questionnaire ownership, use the service role for reads/writes.
 */
export function createQuestionnaireDbClient(profile: Profile | null): SupabaseClient {
  if (profile?.role === 'fund_manager') {
    return createServiceRoleClient();
  }
  return createServerClient();
}

/**
 * Supabase clients.
 *
 * - Server: service role key (bypasses RLS; enforce tenant/role in app code)
 * - Browser: anon key
 *
 * File path: lib/supabase/server.ts
 */

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth-options';

export function createServerClient() {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  // Compatibility shim: many existing handlers call supabase.auth.getUser().
  // Identity source remains NextAuth (Azure AD), not Supabase Auth.
  (client.auth as any).getUser = async () => {
    const session = await getServerSession(authOptions);
    const user = session?.user
      ? {
          id: session.user.user_id,
          email: session.user.email ?? null,
        }
      : null;
    return { data: { user }, error: null };
  };

  return client;
}

export function createBrowserClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

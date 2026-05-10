import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';
import type { User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import type { VCRole } from '@/types/auth';
import { ALL_MODULE_IDS } from '@/lib/auth/module-access';

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  tenant_id: string;
  is_active: boolean;
};

function normalizeRole(raw: string | null | undefined): VCRole | null {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (
    r === 'admin' ||
    r === 'it_admin' ||
    r === 'pctu_officer' ||
    r === 'investment_officer' ||
    r === 'portfolio_manager' ||
    r === 'panel_member' ||
    r === 'senior_management' ||
    r === 'analyst' ||
    r === 'officer' ||
    r === 'viewer' ||
    r === 'fund_manager'
  ) {
    return r;
  }
  return null;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Azure AD often omits `email` on the ID token; UPN is usually in
 * `preferred_username`. NextAuth's default Azure `profile()` only maps
 * `profile.email`, so `user.email` can be empty unless we read OIDC claims here.
 */
function resolveSignInEmail(params: { user?: User | null; profile?: unknown; token: JWT }): string | null {
  const u = params.user;
  if (u && typeof u.email === 'string' && u.email.trim()) {
    return u.email.trim();
  }
  const raw = params.profile as Record<string, unknown> | undefined;
  if (raw) {
    for (const key of ['email', 'preferred_username', 'upn'] as const) {
      const v = raw[key];
      if (typeof v === 'string' && v.includes('@')) {
        return v.trim();
      }
    }
  }
  if (typeof params.token.email === 'string' && params.token.email.trim()) {
    return params.token.email.trim();
  }
  return null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const emailRaw = typeof creds?.email === 'string' ? creds.email.trim().toLowerCase() : '';
        const password = typeof creds?.password === 'string' ? creds.password : '';
        if (!emailRaw || !password) return null;

        const supabase = getSupabaseAdmin();
        const { data: rows, error } = await supabase
          .from('vc_profiles')
          .select('id, user_id, full_name, email, role, tenant_id, is_active, is_portal_user, password_hash')
          .ilike('email', emailRaw)
          .eq('is_portal_user', true)
          .eq('is_active', true)
          .limit(1);

        if (error) {
          console.error('[auth] portal credentials profile lookup', error.message);
          return null;
        }

        const row = (Array.isArray(rows) && rows[0] ? rows[0] : null) as
          | (ProfileRow & { is_portal_user?: boolean; password_hash?: string | null })
          | null;

        if (!row?.password_hash) return null;
        const roleOk = normalizeRole(row.role) === 'fund_manager';
        if (!roleOk) return null;

        const match = await bcrypt.compare(password, row.password_hash);
        if (!match) return null;

        return {
          id: row.user_id,
          email: row.email,
          name: row.full_name,
        } satisfies User;
      },
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid profile email User.Read offline_access',
        },
      },
      /** Ensures `user.email` is set when Microsoft only sends UPN on the token. */
      profile(profile, tokens) {
        const email =
          (typeof profile.email === 'string' && profile.email) ||
          (typeof profile.preferred_username === 'string' && profile.preferred_username) ||
          (typeof (profile as { upn?: string }).upn === 'string' && (profile as { upn: string }).upn) ||
          null;
        return {
          id: profile.sub,
          name: profile.name ?? null,
          email,
          image: null,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user, profile, account }) {
      if (typeof account?.access_token === 'string' && account.access_token.length > 0) {
        token.accessToken = account.access_token;
      }

      if (account?.provider === 'credentials' && user?.id) {
        const supabase = getSupabaseAdmin();
        const { data: row, error } = await supabase
          .from('vc_profiles')
          .select('id, user_id, full_name, email, role, tenant_id, is_active')
          .eq('user_id', user.id)
          .eq('is_portal_user', true)
          .maybeSingle();

        if (error || !row) {
          console.error('[auth] portal jwt profile', error?.message ?? 'missing row');
          token.role = null;
          token.tenant_id = null;
          token.profile_id = null;
          token.user_id = user.id;
          token.full_name = user.name ?? '';
          token.is_active = false;
          token.allowedModules = [];
          return token;
        }

        const pr = row as ProfileRow;
        let resolvedRole: VCRole | null = normalizeRole(pr.role);
        const { data: urRow } = await supabase
          .from('vc_user_roles')
          .select('role')
          .eq('profile_id', pr.id)
          .eq('tenant_id', pr.tenant_id)
          .eq('is_active', true)
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const urRole = urRow?.role != null ? normalizeRole(String(urRow.role)) : null;
        if (urRole) {
          resolvedRole = urRole;
        }

        token.role = resolvedRole;
        token.tenant_id = pr.tenant_id;
        token.profile_id = pr.id;
        token.user_id = pr.user_id;
        token.full_name = pr.full_name || user.name || pr.email;
        token.email = pr.email;
        token.name = pr.full_name || user.name || pr.email;
        token.is_active = !!pr.is_active;
        token.allowedModules = [];

        if (token.role === 'fund_manager') {
          const { error: loginUpdateErr } = await supabase
            .from('fund_manager_contacts')
            .update({ last_login_at: new Date().toISOString() })
            .eq('portal_user_id', user.id);
          if (loginUpdateErr) {
            console.error('[auth] update contact last_login_at', loginUpdateErr.message);
          }
        }

        return token;
      }

      const incomingEmail = resolveSignInEmail({ user, profile, token });
      const incomingName =
        (profile && 'name' in profile && typeof profile.name === 'string' && profile.name) ||
        token.name ||
        null;

      token.email = incomingEmail;
      token.name = incomingName;

      if (!incomingEmail) {
        token.role = null;
        token.tenant_id = null;
        token.profile_id = null;
        token.is_active = false;
        token.allowedModules = [];
        return token;
      }

      // Avoid a Supabase round-trip on every session read when the JWT already
      // holds a resolved profile for this email (initial sign-in still passes `user`).
      if (!user) {
        const tokenEmail =
          typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
        if (
          tokenEmail &&
          tokenEmail === incomingEmail.trim().toLowerCase() &&
          typeof token.profile_id === 'string' &&
          typeof token.tenant_id === 'string' &&
          typeof token.user_id === 'string' &&
          token.role &&
          Array.isArray(token.allowedModules)
        ) {
          return token;
        }
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('vc_profiles')
        .select('id, user_id, full_name, email, role, tenant_id, is_active')
        .ilike('email', incomingEmail)
        .eq('is_active', true)
        .limit(1);

      if (error) {
        console.error('[auth] vc_profiles lookup failed', error.message);
      }

      const row = (Array.isArray(data) && data[0] ? data[0] : null) as ProfileRow | null;

      if (!row) {
        token.role = null;
        token.tenant_id = null;
        token.profile_id = null;
        token.user_id = token.sub ?? incomingEmail;
        token.full_name = incomingName ?? incomingEmail;
        token.is_active = false;
        token.allowedModules = [];
        return token;
      }

      let resolvedRole: VCRole | null = normalizeRole(row.role);
      const { data: urRow } = await supabase
        .from('vc_user_roles')
        .select('role')
        .eq('profile_id', row.id)
        .eq('tenant_id', row.tenant_id)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const urRole = urRow?.role != null ? normalizeRole(String(urRow.role)) : null;
      if (resolvedRole === 'admin') {
        /* keep admin from profile */
      } else if (urRole) {
        resolvedRole = urRole;
      }

      let allowedModules: string[] = [];
      if (resolvedRole === 'admin') {
        allowedModules = ['*'];
      } else if (resolvedRole) {
        const { data: perms } = await supabase
          .from('vc_role_permissions')
          .select('module_id')
          .eq('tenant_id', row.tenant_id)
          .eq('role', resolvedRole)
          .neq('access_level', 'none');
        allowedModules = (perms ?? [])
          .map((p) => String((p as { module_id?: string | null }).module_id ?? ''))
          .filter((m) => ALL_MODULE_IDS.includes(m));
      }

      token.role = resolvedRole;
      token.tenant_id = row.tenant_id;
      token.profile_id = row.id;
      token.user_id = row.user_id;
      token.full_name = row.full_name || incomingName || row.email;
      token.email = row.email;
      token.name = row.full_name || incomingName || row.email;
      token.is_active = !!row.is_active;
      token.allowedModules = allowedModules;

      return token;
    },
    async session({ session, token }) {
      const email = token.email ?? null;
      const name = token.name ?? null;
      session.user = {
        ...session.user,
        email,
        name,
        id: token.user_id ?? token.sub ?? email ?? 'unknown-user',
        user_id: token.user_id ?? token.sub ?? email ?? 'unknown-user',
        full_name: token.full_name ?? name ?? email ?? 'Unknown user',
        role: token.role ?? null,
        tenant_id: token.tenant_id ?? null,
        profile_id: token.profile_id ?? null,
        is_active: token.is_active ?? false,
        allowedModules: Array.isArray(token.allowedModules) ? token.allowedModules : [],
      };
      return session;
    },
  },
};

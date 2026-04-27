import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { ASSIGNABLE_INVITE_ROLES_TUPLE, canManageUsers } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';

const Body = z.object({
  azure_id: z.string().uuid().optional(),
  user_email: z.string().email(),
  user_name: z.string().min(1).max(200),
  role: z.enum(ASSIGNABLE_INVITE_ROLES_TUPLE),
});

type AdminUser = { id: string; email: string | null };
type RoleRowByProfile = { id: string; is_active: boolean };
type RoleRowByUser = { id: string; is_active: boolean };

function supabaseAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isMissingProfileIdColumnError(err: { message?: string } | null | undefined): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes("could not find the 'profile_id' column") || msg.includes('column vc_user_roles.profile_id does not exist');
}

function isUserIdForeignKeyError(err: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '23503') {
    const txt = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
    return txt.includes('vc_user_roles_user_id_fkey');
  }
  const txt = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  return txt.includes('vc_user_roles_user_id_fkey');
}

async function findAuthUserByEmail(email: string): Promise<AdminUser | null> {
  const supabaseAdmin = supabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const first = await supabaseAdmin.auth.admin.listUsers();
  if (first.error) {
    return null;
  }
  const users = first.data?.users ?? [];
  const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalized);
  if (match) return { id: match.id, email: match.email ?? null };
  return null;
}

async function getOrCreateAuthUser(params: { email: string; name: string; fallbackUserId?: string | null }): Promise<AdminUser> {
  const existing = await findAuthUserByEmail(params.email);
  if (existing) return existing;

  const supabaseAdmin = supabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    email_confirm: true,
    user_metadata: {
      full_name: params.name,
      provider: 'azure',
    },
  });

  if (error || !data.user) {
    const msg = (error?.message ?? '').toLowerCase();
    // If another process already provisioned this identity, recover by lookup.
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      const retry = await findAuthUserByEmail(params.email);
      if (retry) return retry;
      if (params.fallbackUserId) {
        return { id: params.fallbackUserId, email: params.email };
      }
    }
    throw new Error(error?.message ?? 'Failed to provision auth user');
  }

  return { id: data.user.id, email: data.user.email ?? null };
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    const caller = await getProfile();
    if (!caller || !canManageUsers(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = Body.safeParse(await req.json().catch(() => ({})));
    if (!body.success) {
      return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
    }

    const email = body.data.user_email.trim().toLowerCase();
    const name = body.data.user_name.trim();
    const role = body.data.role;
    const now = new Date().toISOString();
    const supabaseAdmin = supabaseAdminClient();

    if (role === 'admin') {
      return NextResponse.json({ error: 'Cannot assign admin role via UI' }, { status: 403 });
    }

    // 1) Check existing profile first (can provide fallback user id)
    const { data: existingProfile } = await supabaseAdmin
      .from('vc_profiles')
      .select('id, user_id, role, is_active')
      .eq('tenant_id', caller.tenant_id)
      .ilike('email', email)
      .maybeSingle();

    if (existingProfile?.role === 'admin') {
      return NextResponse.json({ error: 'Cannot modify admin users' }, { status: 403 });
    }

    // 2) Ensure auth.users identity exists (pre-provision if first-time user)
    const authUser = await getOrCreateAuthUser({
      email,
      name,
      fallbackUserId: existingProfile?.user_id ?? null,
    });

    // 3) Upsert / refresh profile linked to auth user id
    let profileId = existingProfile?.id ?? null;
    if (!profileId) {
      const { data: insertedProfile, error: profileInsertErr } = await supabaseAdmin
        .from('vc_profiles')
        .insert({
          tenant_id: caller.tenant_id,
          user_id: authUser.id,
          full_name: name,
          email,
          role,
          is_active: true,
        })
        .select('id')
        .single();

      if (profileInsertErr || !insertedProfile?.id) {
        return NextResponse.json({ error: profileInsertErr?.message ?? 'Failed to create user profile' }, { status: 500 });
      }
      profileId = insertedProfile.id;
    } else {
      const { error: profileUpdateErr } = await supabaseAdmin
        .from('vc_profiles')
        .update({
          user_id: authUser.id,
          full_name: name,
          role,
          is_active: true,
          updated_at: now,
        })
        .eq('id', profileId)
        .eq('tenant_id', caller.tenant_id);

      if (profileUpdateErr) {
        return NextResponse.json({ error: profileUpdateErr.message }, { status: 500 });
      }
    }

    // 3) Upsert / reactivate role row for this profile/user.
    // Some environments use vc_user_roles.profile_id, others use vc_user_roles.user_id.
    let useUserIdColumn = false;
    let existingRoleRow: RoleRowByProfile | RoleRowByUser | null = null;

    const byProfile = await supabaseAdmin
      .from('vc_user_roles')
      .select('id, is_active')
      .eq('tenant_id', caller.tenant_id)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (isMissingProfileIdColumnError(byProfile.error)) {
      useUserIdColumn = true;
      const byUser = await supabaseAdmin
        .from('vc_user_roles')
        .select('id, is_active')
        .eq('tenant_id', caller.tenant_id)
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (byUser.error) {
        return NextResponse.json({ error: byUser.error.message }, { status: 500 });
      }
      existingRoleRow = byUser.data as RoleRowByUser | null;
    } else {
      if (byProfile.error) {
        return NextResponse.json({ error: byProfile.error.message }, { status: 500 });
      }
      existingRoleRow = byProfile.data as RoleRowByProfile | null;
    }

    if (existingRoleRow?.id && existingRoleRow.is_active) {
      return NextResponse.json({ error: 'User already has an active role' }, { status: 409 });
    }

    if (existingRoleRow?.id) {
      const { error: roleUpdateErr } = await supabaseAdmin
        .from('vc_user_roles')
        .update({
          role,
          assigned_at: now,
          assigned_by: caller.profile_id,
          is_active: true,
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq('id', existingRoleRow.id);

      if (roleUpdateErr) {
        return NextResponse.json({ error: roleUpdateErr.message }, { status: 500 });
      }
    } else {
      const insertPayloadBase = {
        tenant_id: caller.tenant_id,
        role,
        assigned_at: now,
        assigned_by: caller.profile_id,
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
      };
      if (useUserIdColumn) {
        // Different environments may bind vc_user_roles.user_id FK to either auth.users(id)
        // or vc_profiles(id). Try auth id first, then profile id fallback.
        const firstAttempt = await supabaseAdmin
          .from('vc_user_roles')
          .insert({ ...insertPayloadBase, user_id: authUser.id });
        if (firstAttempt.error && isUserIdForeignKeyError(firstAttempt.error)) {
          const fallbackAttempt = await supabaseAdmin
            .from('vc_user_roles')
            .insert({ ...insertPayloadBase, user_id: profileId });
          if (fallbackAttempt.error) {
            return NextResponse.json({ error: fallbackAttempt.error.message }, { status: 500 });
          }
        } else if (firstAttempt.error) {
          return NextResponse.json({ error: firstAttempt.error.message }, { status: 500 });
        }
      } else {
        const { error: roleInsertErr } = await supabaseAdmin
          .from('vc_user_roles')
          .insert({ ...insertPayloadBase, profile_id: profileId });
        if (roleInsertErr) {
          return NextResponse.json({ error: roleInsertErr.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authUser.id,
        profile_id: profileId,
        email,
        name,
        role,
      },
    });
  } catch (err) {
    console.error('add-internal error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

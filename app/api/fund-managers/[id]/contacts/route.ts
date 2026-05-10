import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const createContactSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  title: z.string().trim().max(200).optional(),
  is_primary: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

function dbjOnlyRole(role: string): boolean {
  return role !== 'fund_manager';
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !dbjOnlyRole(profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const { id: fundManagerId } = await ctx.params;
    if (!fundManagerId) {
      return logAndReturn(new Error('Missing fund manager id'), 'fund-managers/contacts:GET', 'VALIDATION_ERROR', 'Invalid fund manager id.', 400);
    }

    const adminClient = createServiceRoleClient();
    const { data, error } = await adminClient
      .from('fund_manager_contacts')
      .select('id, full_name, email, title, is_primary, portal_access, portal_user_id, invited_at, last_login_at')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .order('is_primary', { ascending: false })
      .order('full_name', { ascending: true });

    if (error) {
      return logAndReturn(error, 'fund-managers/contacts:GET:select', 'INTERNAL_ERROR', 'Could not load contacts.', 500);
    }

    return NextResponse.json({
      contacts: (data ?? []).map((row) => ({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        title: row.title,
        is_primary: row.is_primary ?? false,
        portal_access: row.portal_access ?? false,
        portal_user_id: row.portal_user_id,
        invited_at: row.invited_at,
        last_login_at: row.last_login_at,
      })),
    });
  } catch (error) {
    return logAndReturn(error, 'fund-managers/contacts:GET', 'INTERNAL_ERROR', 'Could not load contacts.', 500);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !dbjOnlyRole(profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const { id: fundManagerId } = await ctx.params;
    if (!fundManagerId) {
      return logAndReturn(new Error('Missing fund manager id'), 'fund-managers/contacts:POST', 'VALIDATION_ERROR', 'Invalid fund manager id.', 400);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      return logAndReturn(error, 'fund-managers/contacts:POST:json', 'VALIDATION_ERROR', 'Invalid JSON body.', 400);
    }

    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return logAndReturn(parsed.error, 'fund-managers/contacts:POST:validate', 'VALIDATION_ERROR', 'Invalid contact payload.', 400);
    }

    const adminClient = createServiceRoleClient();

    const { data: duplicate, error: dupError } = await adminClient
      .from('fund_manager_contacts')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .ilike('email', parsed.data.email.trim().toLowerCase())
      .maybeSingle();

    if (dupError) {
      return logAndReturn(dupError, 'fund-managers/contacts:POST:duplicate', 'INTERNAL_ERROR', 'Could not validate contact email.', 500);
    }
    if (duplicate?.id) {
      return logAndReturn(new Error('Duplicate email'), 'fund-managers/contacts:POST:duplicate', 'VALIDATION_ERROR', 'A contact with this email already exists for this firm.', 409);
    }

    if (parsed.data.is_primary === true) {
      const { error: clearPrimaryErr } = await adminClient
        .from('fund_manager_contacts')
        .update({ is_primary: false })
        .eq('tenant_id', profile.tenant_id)
        .eq('fund_manager_id', fundManagerId);
      if (clearPrimaryErr) {
        return logAndReturn(clearPrimaryErr, 'fund-managers/contacts:POST:clear_primary', 'INTERNAL_ERROR', 'Could not update primary contact state.', 500);
      }
    }

    const { data: inserted, error: insertError } = await adminClient
      .from('fund_manager_contacts')
      .insert({
        tenant_id: profile.tenant_id,
        fund_manager_id: fundManagerId,
        full_name: parsed.data.full_name.trim(),
        email: parsed.data.email.trim().toLowerCase(),
        title: parsed.data.title?.trim() || null,
        is_primary: parsed.data.is_primary ?? false,
        created_by: profile.user_id,
      })
      .select('*')
      .single();

    if (insertError || !inserted) {
      return logAndReturn(insertError ?? new Error('Insert failed'), 'fund-managers/contacts:POST:insert', 'INTERNAL_ERROR', 'Could not create contact.', 500);
    }

    return NextResponse.json({ contact: inserted });
  } catch (error) {
    return logAndReturn(error, 'fund-managers/contacts:POST', 'INTERNAL_ERROR', 'Could not create contact.', 500);
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    full_name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(320).optional(),
    title: z.string().trim().max(200).nullable().optional(),
    is_primary: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

type Ctx = { params: Promise<{ id: string; contactId: string }> };

function dbjOnlyRole(role: string): boolean {
  return role !== 'fund_manager';
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !dbjOnlyRole(profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const { id: fundManagerId, contactId } = await ctx.params;
    if (!fundManagerId || !contactId) {
      return logAndReturn(new Error('Missing ids'), 'fund-managers/contacts/contact:PATCH', 'VALIDATION_ERROR', 'Invalid contact path.', 400);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      return logAndReturn(error, 'fund-managers/contacts/contact:PATCH:json', 'VALIDATION_ERROR', 'Invalid JSON body.', 400);
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return logAndReturn(parsed.error, 'fund-managers/contacts/contact:PATCH:validate', 'VALIDATION_ERROR', 'Invalid contact payload.', 400);
    }

    const adminClient = createServiceRoleClient();

    const { data: existing, error: existingErr } = await adminClient
      .from('fund_manager_contacts')
      .select('id, tenant_id, fund_manager_id')
      .eq('id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .maybeSingle();

    if (existingErr) {
      return logAndReturn(existingErr, 'fund-managers/contacts/contact:PATCH:lookup', 'INTERNAL_ERROR', 'Could not load contact.', 500);
    }
    if (!existing) {
      return logAndReturn(new Error('Contact not found'), 'fund-managers/contacts/contact:PATCH:lookup', 'NOT_FOUND', 'Contact not found.', 404);
    }

    if (parsed.data.email) {
      const { data: duplicate, error: dupError } = await adminClient
        .from('fund_manager_contacts')
        .select('id')
        .eq('tenant_id', profile.tenant_id)
        .eq('fund_manager_id', fundManagerId)
        .ilike('email', parsed.data.email.trim().toLowerCase())
        .neq('id', contactId)
        .maybeSingle();

      if (dupError) {
        return logAndReturn(dupError, 'fund-managers/contacts/contact:PATCH:duplicate', 'INTERNAL_ERROR', 'Could not validate contact email.', 500);
      }
      if (duplicate?.id) {
        return logAndReturn(new Error('Duplicate email'), 'fund-managers/contacts/contact:PATCH:duplicate', 'VALIDATION_ERROR', 'A contact with this email already exists for this firm.', 409);
      }
    }

    if (parsed.data.is_primary === true) {
      const { error: clearPrimaryErr } = await adminClient
        .from('fund_manager_contacts')
        .update({ is_primary: false })
        .eq('tenant_id', profile.tenant_id)
        .eq('fund_manager_id', fundManagerId)
        .neq('id', contactId);
      if (clearPrimaryErr) {
        return logAndReturn(clearPrimaryErr, 'fund-managers/contacts/contact:PATCH:clear_primary', 'INTERNAL_ERROR', 'Could not update primary contact state.', 500);
      }
    }

    const updatePayload: {
      full_name?: string;
      email?: string;
      title?: string | null;
      is_primary?: boolean;
      updated_at?: string;
    } = { updated_at: new Date().toISOString() };
    if (parsed.data.full_name !== undefined) updatePayload.full_name = parsed.data.full_name.trim();
    if (parsed.data.email !== undefined) updatePayload.email = parsed.data.email.trim().toLowerCase();
    if (parsed.data.title !== undefined) updatePayload.title = parsed.data.title?.trim() || null;
    if (parsed.data.is_primary !== undefined) updatePayload.is_primary = parsed.data.is_primary;

    const { data: updated, error: updateErr } = await adminClient
      .from('fund_manager_contacts')
      .update(updatePayload)
      .eq('id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      return logAndReturn(updateErr ?? new Error('Update failed'), 'fund-managers/contacts/contact:PATCH:update', 'INTERNAL_ERROR', 'Could not update contact.', 500);
    }

    return NextResponse.json({ contact: updated });
  } catch (error) {
    return logAndReturn(error, 'fund-managers/contacts/contact:PATCH', 'INTERNAL_ERROR', 'Could not update contact.', 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !dbjOnlyRole(profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const { id: fundManagerId, contactId } = await ctx.params;
    if (!fundManagerId || !contactId) {
      return logAndReturn(new Error('Missing ids'), 'fund-managers/contacts/contact:DELETE', 'VALIDATION_ERROR', 'Invalid contact path.', 400);
    }

    const adminClient = createServiceRoleClient();
    const { data: contact, error: loadErr } = await adminClient
      .from('fund_manager_contacts')
      .select('id, portal_access')
      .eq('id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .maybeSingle();

    if (loadErr) {
      return logAndReturn(loadErr, 'fund-managers/contacts/contact:DELETE:load', 'INTERNAL_ERROR', 'Could not load contact.', 500);
    }
    if (!contact) {
      return logAndReturn(new Error('Contact not found'), 'fund-managers/contacts/contact:DELETE:load', 'NOT_FOUND', 'Contact not found.', 404);
    }
    if (contact.portal_access) {
      return logAndReturn(
        new Error('Cannot delete portal-enabled contact'),
        'fund-managers/contacts/contact:DELETE:portal_access',
        'VALIDATION_ERROR',
        'Cannot remove a contact with active portal access. Revoke portal access first.',
        400,
      );
    }

    const { error: deleteErr } = await adminClient
      .from('fund_manager_contacts')
      .delete()
      .eq('id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId);

    if (deleteErr) {
      return logAndReturn(deleteErr, 'fund-managers/contacts/contact:DELETE:delete', 'INTERNAL_ERROR', 'Could not delete contact.', 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return logAndReturn(error, 'fund-managers/contacts/contact:DELETE', 'INTERNAL_ERROR', 'Could not delete contact.', 500);
  }
}

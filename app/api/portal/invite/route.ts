import { randomBytes } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { portalRegisterInvitationUrl, sendPortalInvitationEmail } from '@/lib/email/send-portal-invitation-email';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { getProfile, requireAuth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['investment_officer', 'portfolio_manager', 'admin']);

const Body = z.object({
  fund_application_id: z.string().uuid(),
  fund_name: z.string().min(1).max(500),
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  fund_manager_id: z.string().uuid().optional().nullable(),
  personal_note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !STAFF_ROLES.has(profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid request body' }, { status: 400 });
    }

    const { fund_application_id, fund_name, full_name, personal_note } = parsed.data;
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const fundManagerId = parsed.data.fund_manager_id?.trim() || null;

    const supabase = createServiceRoleClient();

    const { data: appRow, error: appErr } = await supabase
      .from('vc_fund_applications')
      .select('id, fund_name, tenant_id')
      .eq('id', fund_application_id)
      .eq('tenant_id', profile.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (appErr || !appRow) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Application not found.' }, { status: 404 });
    }

    const app = appRow as { id: string; fund_name: string; tenant_id: string };

    if (app.fund_name.trim().toLowerCase() !== fund_name.trim().toLowerCase()) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Fund name does not match this application.' },
        { status: 400 },
      );
    }

    const { data: qRow, error: qErr } = await supabase
      .from('vc_dd_questionnaires')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .eq('application_id', app.id)
      .maybeSingle();

    if (qErr || !qRow?.id) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'No questionnaire found for this application.' },
        { status: 400 },
      );
    }

    const questionnaireId = qRow.id as string;

    const { data: contactRows, error: cErr } = await supabase
      .from('vc_dd_contact_persons')
      .select('email, full_name')
      .eq('tenant_id', profile.tenant_id)
      .eq('questionnaire_id', questionnaireId);

    if (cErr) {
      return logAndReturn(cErr, 'portal/invite:contacts', 'INTERNAL_ERROR', 'Could not verify contacts.', 500);
    }

    const hasMatchingEmail = (contactRows ?? []).some((c) => {
      const em = (c as { email?: string | null }).email?.trim().toLowerCase();
      return em === emailNorm;
    });

    if (!hasMatchingEmail) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Email must match a contact person on this application.' },
        { status: 400 },
      );
    }

    const { data: pendingInvite } = await supabase
      .from('vc_invitations')
      .select('id')
      .eq('tenant_id', profile.tenant_id)
      .ilike('email', emailNorm)
      .eq('status', 'pending')
      .eq('role', 'fund_manager')
      .maybeSingle();

    if (pendingInvite?.id) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'A pending portal invitation already exists for this email.' },
        { status: 409 },
      );
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tenantRow } = await supabase
      .from('vc_tenants')
      .select('name')
      .eq('id', profile.tenant_id)
      .maybeSingle();

    const tenantName = (tenantRow as { name?: string } | null)?.name?.trim() || 'Development Bank of Jamaica';

    const metadata: {
      application_id: string;
      fund_name: string;
      fund_manager_id: string | null;
    } = {
      application_id: fund_application_id,
      fund_name: app.fund_name,
      fund_manager_id: fundManagerId,
    };

    const { data: inserted, error: insErr } = await supabase
      .from('vc_invitations')
      .insert({
        tenant_id: profile.tenant_id,
        email: emailNorm,
        full_name: full_name.trim(),
        role: 'fund_manager',
        token,
        token_expires_at: expires,
        status: 'pending',
        invited_by: profile.profile_id,
        personal_note: personal_note?.trim() || null,
        metadata,
      })
      .select('id')
      .single();

    if (insErr || !inserted?.id) {
      return logAndReturn(insErr ?? new Error('insert'), 'portal/invite:insert', 'INTERNAL_ERROR', 'Could not create invitation.', 500);
    }

    const registerUrl = portalRegisterInvitationUrl(token);
    const send = await sendPortalInvitationEmail({
      to: emailNorm,
      inviteeName: full_name.trim(),
      organizationLabel: tenantName,
      fundName: app.fund_name,
      registerUrl,
      note: personal_note?.trim() || null,
    });

    if ('error' in send) {
      if (send.error === 'RESEND_API_KEY not configured') {
        return NextResponse.json({
          success: true as const,
          invitation_id: inserted.id,
          email: emailNorm,
          warning: send.error,
        });
      }
      return logAndReturn(new Error(send.error), 'portal/invite:email', 'UPSTREAM_ERROR', 'Invitation saved but email failed.', 502);
    }

    return NextResponse.json({
      success: true as const,
      invitation_id: inserted.id,
      email: emailNorm,
    });
  } catch (e) {
    return logAndReturn(e, 'portal/invite', 'INTERNAL_ERROR', 'Could not send invitation.', 500);
  }
}

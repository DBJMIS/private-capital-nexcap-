import { randomBytes, randomUUID } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { baseEmailTemplate, bodyText, ctaButton, escapeHtmlForEmail } from '@/lib/email/base-template';
import { isSmtpConfigured, sendEmail } from '@/lib/email/smtp-client';
import { portalRegisterInvitationUrl, sendPortalInvitationEmail } from '@/lib/email/send-portal-invitation-email';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const INVITE_ROLES = new Set(['investment_officer', 'portfolio_manager', 'admin']);

type Ctx = { params: Promise<{ id: string; contactId: string }> };

const optionalInviteBodySchema = z
  .object({
    application_id: z.string().uuid().optional(),
    portfolio_fund_id: z.string().uuid().optional(),
  })
  .strict();

function portalHomeUrl(): string {
  const o = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (o && !o.startsWith('http')) return `https://${o}`;
  return (o || 'http://localhost:3000').replace(/\/$/, '');
}

async function sendNewFundAccessEmail(to: string, fullName: string, firmName: string): Promise<{ ok: true } | { error: string }> {
  if (!isSmtpConfigured()) {
    return { error: 'RESEND_API_KEY not configured' };
  }

  const body = [
    bodyText(`Dear ${fullName},`),
    bodyText(
      `${firmName} has a new fund application in progress with DBJ. You can now access it in your portal.`,
    ),
    ctaButton('View Portal', `${portalHomeUrl()}/portal`),
    bodyText('If this was unexpected, please contact DBJ support.'),
  ].join('');

  const html = baseEmailTemplate(body, 'New fund added to your NexCap Portal account');
  try {
    await sendEmail({
      to,
      subject: 'New fund added to your NexCap Portal account',
      html,
    });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAuth();
    const profile = await getProfile();
    if (!profile || !INVITE_ROLES.has(profile.role)) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 });
    }

    const { id: fundManagerId, contactId } = await ctx.params;
    if (!fundManagerId || !contactId) {
      return logAndReturn(new Error('Missing ids'), 'fund-managers/contacts/invite:POST', 'VALIDATION_ERROR', 'Invalid contact path.', 400);
    }

    const adminClient = createServiceRoleClient();

    const { data: contact, error: contactErr } = await adminClient
      .from('fund_manager_contacts')
      .select('id, tenant_id, fund_manager_id, full_name, email, portal_user_id, portal_access')
      .eq('id', contactId)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .maybeSingle();

    if (contactErr) {
      return logAndReturn(contactErr, 'fund-managers/contacts/invite:POST:contact', 'INTERNAL_ERROR', 'Could not load contact.', 500);
    }
    if (!contact) {
      return logAndReturn(new Error('Contact not found'), 'fund-managers/contacts/invite:POST:contact', 'NOT_FOUND', 'Contact not found.', 404);
    }

    const { data: fundManager, error: fmErr } = await adminClient
      .from('fund_managers')
      .select('id, tenant_id, firm_name')
      .eq('id', fundManagerId)
      .eq('tenant_id', profile.tenant_id)
      .maybeSingle();

    if (fmErr) {
      return logAndReturn(fmErr, 'fund-managers/contacts/invite:POST:fund_manager', 'INTERNAL_ERROR', 'Could not load fund manager.', 500);
    }
    if (!fundManager) {
      return logAndReturn(new Error('Fund manager not found'), 'fund-managers/contacts/invite:POST:fund_manager', 'NOT_FOUND', 'Fund manager not found.', 404);
    }

    const { data: apps, error: appsErr } = await adminClient
      .from('vc_fund_applications')
      .select('id, fund_name, fund_manager_id')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (appsErr) {
      return logAndReturn(appsErr, 'fund-managers/contacts/invite:POST:applications', 'INTERNAL_ERROR', 'Could not load linked applications.', 500);
    }

    const fundNames = (apps ?? [])
      .map((r) => r.fund_name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

    if (contact.portal_user_id) {
      const { error: backfillErr } = await adminClient
        .from('vc_fund_applications')
        .update({ fund_manager_id: fundManagerId })
        .eq('tenant_id', profile.tenant_id)
        .is('fund_manager_id', null)
        .eq('manager_name', fundManager.firm_name)
        .is('deleted_at', null);

      if (backfillErr) {
        return logAndReturn(backfillErr, 'fund-managers/contacts/invite:POST:backfill', 'INTERNAL_ERROR', 'Could not attach fund manager to applications.', 500);
      }

      const send = await sendNewFundAccessEmail(contact.email, contact.full_name, fundManager.firm_name);
      if ('error' in send) {
        return logAndReturn(new Error(send.error), 'fund-managers/contacts/invite:POST:new_fund_email', 'UPSTREAM_ERROR', 'Could not send new fund notification.', 502);
      }

      return NextResponse.json({
        sent: true,
        type: 'new_fund_notification',
        funds: fundNames,
      });
    }

    let applicationIdForMeta: string | undefined;
    let portfolioFundIdForMeta: string | undefined;
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      let raw: unknown = {};
      try {
        raw = await req.json();
      } catch {
        raw = {};
      }
      const parsed = optionalInviteBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid request body.' }, { status: 400 });
      }
      const aid = parsed.data.application_id;
      const pid = parsed.data.portfolio_fund_id;
      if (aid && pid) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'Specify only one of application_id or portfolio_fund_id.' },
          { status: 400 },
        );
      }
      if (aid) {
        const { data: appRow, error: appLookupErr } = await adminClient
          .from('vc_fund_applications')
          .select('id, fund_manager_id')
          .eq('id', aid)
          .eq('tenant_id', profile.tenant_id)
          .is('deleted_at', null)
          .maybeSingle();
        if (appLookupErr) {
          return logAndReturn(appLookupErr, 'fund-managers/contacts/invite:POST:app_lookup', 'INTERNAL_ERROR', 'Could not verify application.', 500);
        }
        if (!appRow) {
          return NextResponse.json({ error: 'NOT_FOUND', message: 'Application not found.' }, { status: 404 });
        }
        const row = appRow as { id: string; fund_manager_id: string | null };
        if (row.fund_manager_id !== fundManager.id) {
          return NextResponse.json(
            { error: 'VALIDATION_ERROR', message: 'Application is not linked to this fund manager.' },
            { status: 400 },
          );
        }
        applicationIdForMeta = row.id;
      }
      if (pid) {
        const { data: pfRow, error: pfLookupErr } = await adminClient
          .from('vc_portfolio_funds')
          .select('id, fund_manager_id')
          .eq('id', pid)
          .eq('tenant_id', profile.tenant_id)
          .maybeSingle();
        if (pfLookupErr) {
          return logAndReturn(pfLookupErr, 'fund-managers/contacts/invite:POST:pf_lookup', 'INTERNAL_ERROR', 'Could not verify portfolio fund.', 500);
        }
        if (!pfRow) {
          return NextResponse.json({ error: 'NOT_FOUND', message: 'Portfolio fund not found.' }, { status: 404 });
        }
        const row = pfRow as { id: string; fund_manager_id: string | null };
        if (row.fund_manager_id !== fundManager.id) {
          return NextResponse.json(
            { error: 'VALIDATION_ERROR', message: 'Portfolio fund is not linked to this fund manager.' },
            { status: 400 },
          );
        }
        portfolioFundIdForMeta = row.id;
      }
    }

    const token = `${randomUUID()}-${randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const metadata: Record<string, string> = {
      fund_manager_id: fundManager.id,
      firm_name: fundManager.firm_name,
      contact_id: contact.id,
    };
    if (applicationIdForMeta) {
      metadata.application_id = applicationIdForMeta;
    }
    if (portfolioFundIdForMeta) {
      metadata.portfolio_fund_id = portfolioFundIdForMeta;
    }

    const { data: invitation, error: inviteErr } = await adminClient
      .from('vc_invitations')
      .insert({
        tenant_id: profile.tenant_id,
        email: contact.email.trim().toLowerCase(),
        full_name: contact.full_name,
        role: 'fund_manager',
        token,
        token_expires_at: expiresAt,
        status: 'pending',
        invited_by: profile.profile_id,
        metadata,
      })
      .select('id')
      .single();

    if (inviteErr || !invitation?.id) {
      return logAndReturn(inviteErr ?? new Error('Invitation create failed'), 'fund-managers/contacts/invite:POST:create_invite', 'INTERNAL_ERROR', 'Could not create invitation.', 500);
    }

    const { error: updateContactErr } = await adminClient
      .from('fund_manager_contacts')
      .update({
        invited_at: new Date().toISOString(),
        invitation_id: invitation.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_manager_id', fundManagerId);

    if (updateContactErr) {
      return logAndReturn(updateContactErr, 'fund-managers/contacts/invite:POST:update_contact', 'INTERNAL_ERROR', 'Could not update contact invitation state.', 500);
    }

    const send = await sendPortalInvitationEmail({
      to: contact.email.trim().toLowerCase(),
      inviteeName: contact.full_name,
      organizationLabel: fundManager.firm_name,
      fundName: fundManager.firm_name,
      invitedByStaffName: profile.full_name,
      registerUrl: portalRegisterInvitationUrl(token),
      note: null,
    });

    if ('error' in send) {
      return logAndReturn(new Error(escapeHtmlForEmail(send.error)), 'fund-managers/contacts/invite:POST:send_invite', 'UPSTREAM_ERROR', 'Invitation created but email failed to send.', 502);
    }

    return NextResponse.json({
      sent: true,
      type: 'registration_invitation',
      funds: fundNames,
    });
  } catch (error) {
    return logAndReturn(error, 'fund-managers/contacts/invite:POST', 'INTERNAL_ERROR', 'Could not send invitation.', 500);
  }
}

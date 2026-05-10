/**
 * External fund managers — NexCap Fund Manager Portal invite (Office365 SMTP).
 */

import 'server-only';

import {
  baseEmailTemplate,
  bodyText,
  bulletList,
  ctaButton,
  divider,
  escapeHtmlForEmail,
  htmlBlock,
} from '@/lib/email/base-template';
import {
  EMAIL_TRANSPORT_UNAVAILABLE_CLIENT_MESSAGE,
  isSmtpConfigured,
  sendEmail,
} from '@/lib/email/smtp-client';

function appOrigin(): string {
  const o = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (o && !o.startsWith('http')) return `https://${o}`;
  return o || 'http://localhost:3000';
}

export function portalRegisterInvitationUrl(token: string): string {
  const base = appOrigin().replace(/\/$/, '');
  return `${base}/portal/register?token=${encodeURIComponent(token)}`;
}

export type PortalInvitationEmailParams = {
  to: string;
  inviteeName: string;
  /** Inviting tenant / organisation name (shown as "from … at DBJ …") */
  organizationLabel: string;
  /** Optional fund name shown in prose (defaults to plain-language fallback if omitted) */
  fundName?: string | null;
  /** Optional inviting person shown before "from DBJ" if provided */
  invitedByStaffName?: string | null;
  registerUrl: string;
  note?: string | null;
};

export async function sendPortalInvitationEmail(
  params: PortalInvitationEmailParams,
): Promise<{ id: string } | { error: string }> {
  if (!isSmtpConfigured()) {
    console.warn('[sendPortalInvitationEmail] SMTP transport not configured');
    return { error: EMAIL_TRANSPORT_UNAVAILABLE_CLIENT_MESSAGE };
  }

  const previewText = 'You have been invited to the NexCap Fund Manager Portal';
  const inviterLabel = params.invitedByStaffName?.trim()
    ? params.invitedByStaffName.trim()
    : params.organizationLabel.trim();
  const fundPhrase = params.fundName?.trim() ? params.fundName.trim() : 'your fund';

  let inner = '';
  inner += bodyText(`Dear ${params.inviteeName},`);
  inner += bodyText(
    `${inviterLabel} from the Development Bank of Jamaica has invited you to access the NexCap Fund Manager Portal for ${fundPhrase}.`,
  );
  inner += bulletList([
    'Complete your Due Diligence Questionnaire',
    'Upload quarterly and annual reports',
    'View and acknowledge capital call notices',
    'Access your compliance obligations',
    'Download documents shared by DBJ',
  ]);
  inner += ctaButton('Set Up Your Account', params.registerUrl);
  inner += bodyText('This invitation expires in 30 days.');
  inner += bodyText('If you did not expect this invitation, please ignore this email.');

  if (params.note?.trim()) {
    inner += divider();
    inner += htmlBlock(
      `<div style="margin-top:0;padding:12px;background:#f9fafb;border-radius:8px;font-size:14px;color:#374151;">${escapeHtmlForEmail(params.note.trim())}</div>`,
    );
  }

  const html = baseEmailTemplate(inner, previewText);

  try {
    await sendEmail({
      to: params.to,
      subject: "You've been invited to the NexCap Fund Manager Portal",
      html,
    });
    return { id: 'smtp' };
  } catch (error) {
    console.error('[sendPortalInvitationEmail]', error instanceof Error ? error.message : 'send failed');
    return { error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

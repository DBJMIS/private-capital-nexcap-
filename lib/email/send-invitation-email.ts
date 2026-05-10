/**
 * Staff invitation via Office365 SMTP (NexCap / DBJ).
 */

import 'server-only';

import {
  baseEmailTemplate,
  bodyText,
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

export type InvitationEmailParams = {
  to: string;
  inviteeName: string;
  inviterName: string;
  roleLabel: string;
  acceptUrl: string;
  note?: string | null;
};

export async function sendInvitationEmail(params: InvitationEmailParams): Promise<{ id: string } | { error: string }> {
  if (!isSmtpConfigured()) {
    console.warn('[sendInvitationEmail] SMTP transport not configured');
    return { error: EMAIL_TRANSPORT_UNAVAILABLE_CLIENT_MESSAGE };
  }

  const previewText = `${params.inviteeName}: invitation to NexCap`;
  let inner = '';

  inner += bodyText(`Hello ${params.inviteeName},`);
  inner += bodyText(
    `${params.inviterName} has invited you to join the NexCap platform at the Development Bank of Jamaica as ${params.roleLabel}.`,
  );
  inner += ctaButton('Accept Invitation', params.acceptUrl);
  inner += bodyText('This invitation expires in 7 days.');
  inner += bodyText('If you did not expect this, ignore this email.');

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
      subject: "You've been invited to NexCap",
      html,
    });
    return { id: 'smtp' };
  } catch (error) {
    console.error('[sendInvitationEmail]', error instanceof Error ? error.message : 'send failed');
    return { error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

export function invitationAcceptUrl(token: string): string {
  return `${appOrigin()}/invite/${encodeURIComponent(token)}`;
}

/**
 * NexCap Fund Manager Portal password-reset (Office365 SMTP).
 */

import 'server-only';

import { baseEmailTemplate, bodyText, ctaButton } from '@/lib/email/base-template';
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

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}): Promise<{ id: string } | { error: string }> {
  if (!isSmtpConfigured()) {
    console.warn('[sendPasswordResetEmail] SMTP transport not configured');
    return { error: EMAIL_TRANSPORT_UNAVAILABLE_CLIENT_MESSAGE };
  }

  const previewText = 'Reset your NexCap password';

  let inner = '';
  inner += bodyText('Hello,');
  inner += bodyText('We received a request to reset the password for your NexCap Fund Manager Portal account.');
  inner += ctaButton('Reset Password', params.resetUrl);
  inner += bodyText('This link expires in 1 hour.');
  inner += bodyText(
    'If you did not request a password reset, please ignore this email. Your password will not be changed.',
  );

  const html = baseEmailTemplate(inner, previewText);

  try {
    await sendEmail({
      to: params.to,
      subject: 'Reset your NexCap password',
      html,
    });
    return { id: 'smtp' };
  } catch (error) {
    console.error('[sendPasswordResetEmail]', error instanceof Error ? error.message : 'send failed');
    return { error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

export function portalPasswordResetUrl(token: string): string {
  const base = appOrigin().replace(/\/$/, '');
  return `${base}/portal/reset-password?token=${encodeURIComponent(token)}`;
}

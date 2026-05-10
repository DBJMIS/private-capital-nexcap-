import 'server-only';

import nodemailer from 'nodemailer';

/** True when SMTP environment is provisioned enough to attempt outbound mail */
export function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    typeof process.env.SMTP_PASSWORD === 'string' &&
    process.env.SMTP_PASSWORD.length > 0 &&
    process.env.SMTP_FROM_EMAIL?.trim()
  );
}

/**
 * Returned when outbound email is skipped — preserves existing route branches unchanged.
 */
export const EMAIL_TRANSPORT_UNAVAILABLE_CLIENT_MESSAGE = 'RESEND_API_KEY not configured' as const;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    // Office365 requires this for port 587
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  },
});

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const from = process.env.SMTP_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error('SMTP_FROM_EMAIL not configured');
  }

  await transporter.sendMail({
    from: `"NexCap - DBJ" <${from}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    replyTo: payload.replyTo,
  });
}

// Verify SMTP connection on startup in development
if (process.env.NODE_ENV === 'development') {
  transporter.verify((error) => {
    if (error) {
      console.error('[SMTP] Connection failed:', error instanceof Error ? error.message : '[unknown error]');
    } else {
      console.log('[SMTP] Server ready to send emails');
    }
  });
}

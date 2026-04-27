/**
 * Pre-screening notifications (email stub until SMTP is configured).
 * File path: lib/pre-screening/notify.ts
 */

export type PreScreeningEmailPayload = {
  /** Fund manager / applicant email */
  fundManagerEmail: string;
  applicationId: string;
  fundName?: string;
  outcome: 'passed' | 'failed' | 'legal_review_required';
  summary: string;
  /** Optional officer mailbox — TODO: resolve from vc_profiles or env */
  officerEmail?: string | null;
};

/**
 * TODO: Configure SMTP / transactional provider (Resend, SendGrid, etc.).
 * Set env e.g. SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM — then implement send.
 */
export async function notifyPreScreeningResult(payload: PreScreeningEmailPayload): Promise<void> {
  // eslint-disable-next-line no-console -- intentional stub until SMTP / provider is configured
  console.info('[TODO: email notifyPreScreeningResult]', {
    to: payload.fundManagerEmail,
    cc: payload.officerEmail ?? undefined,
    subject: `DBJ Pre-Screening: ${payload.outcome} — application ${payload.applicationId}`,
    body: payload.summary,
  });
  if (payload.officerEmail) {
    // eslint-disable-next-line no-console
    console.info('[TODO: email assigned officer]', { to: payload.officerEmail, applicationId: payload.applicationId });
  }
}

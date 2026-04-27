/**
 * Send invitation email via Resend HTTP API.
 *
 * File path: lib/email/send-invitation-email.ts
 */

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
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn('[sendInvitationEmail] RESEND_API_KEY not set; skipping email');
    return { error: 'RESEND_API_KEY not configured' };
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim() || 'DBJ VC <onboarding@resend.dev>';
  const noteBlock = params.note?.trim()
    ? `<p style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-size:14px;color:#374151;">${escapeHtml(params.note.trim())}</p>`
    : '';

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0B1F45;">
<p>Hi ${escapeHtml(params.inviteeName)},</p>
<p><strong>${escapeHtml(params.inviterName)}</strong> has invited you to access the DBJ Private Capital Management Platform as a <strong>${escapeHtml(params.roleLabel)}</strong>.</p>
<p><a href="${params.acceptUrl}" style="display:inline-block;margin:16px 0;padding:12px 20px;background:#0B1F45;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Accept Invitation</a></p>
<p style="font-size:13px;color:#6b7280;">This link expires in 7 days.</p>
${noteBlock}
</body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: "You've been invited to DBJ VC Platform",
      html,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    console.error('[sendInvitationEmail]', res.status, json);
    return { error: json.message || `Resend error ${res.status}` };
  }
  return { id: json.id ?? 'unknown' };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function invitationAcceptUrl(token: string): string {
  return `${appOrigin()}/invite/${encodeURIComponent(token)}`;
}

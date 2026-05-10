import { randomBytes } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAndReturn } from '@/lib/api/errors';
import { portalPasswordResetUrl, sendPasswordResetEmail } from '@/lib/email/send-password-reset-email';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ success: true as const });
    }

    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      /* security: identical response shape */
      return NextResponse.json({ success: true as const });
    }

    const emailNorm = parsed.data.email.trim().toLowerCase();
    const supabase = createServiceRoleClient();

    const { data: profileRow } = await supabase
      .from('vc_profiles')
      .select('id, tenant_id, full_name, email, is_active, is_portal_user, password_hash')
      .ilike('email', emailNorm)
      .eq('is_portal_user', true)
      .eq('is_active', true)
      .maybeSingle();

    const profile = profileRow as {
      id: string;
      tenant_id: string;
      full_name: string;
      email: string;
      password_hash: string | null;
    } | null;

    if (!profile?.password_hash) {
      return NextResponse.json({ success: true as const });
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from('vc_invitations').insert({
      tenant_id: profile.tenant_id,
      email: emailNorm,
      full_name: profile.full_name.trim() || emailNorm,
      role: 'password_reset',
      token,
      token_expires_at: expires,
      status: 'pending',
      invited_by: null,
      personal_note: null,
      metadata: { profile_id: profile.id },
    });

    if (insErr) {
      return logAndReturn(insErr, 'portal/forgot-password:insert', 'INTERNAL_ERROR', 'Request could not be processed.', 500);
    }

    const send = await sendPasswordResetEmail({
      to: emailNorm,
      resetUrl: portalPasswordResetUrl(token),
    });
    if ('error' in send) {
      console.warn('[portal/forgot-password]', send.error);
    }

    return NextResponse.json({ success: true as const });
  } catch (e) {
    return logAndReturn(e, 'portal/forgot-password', 'INTERNAL_ERROR', 'Request could not be processed.', 500);
  }
}

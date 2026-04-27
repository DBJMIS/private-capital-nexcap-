import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Returns a short-lived signed URL for the obligation's stored PDF. */
export async function GET(_req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const supabase = createServerClient();
  const { data: ob, error } = await supabase
    .from('vc_reporting_obligations')
    .select('document_path')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', id)
    .maybeSingle();

  if (error || !ob) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const path = (ob as { document_path: string | null }).document_path;
  if (!path) {
    return NextResponse.json({ error: 'No document on file' }, { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from('portfolio-reports')
    .createSignedUrl(path, 3600);

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: sErr?.message ?? 'Could not sign URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}

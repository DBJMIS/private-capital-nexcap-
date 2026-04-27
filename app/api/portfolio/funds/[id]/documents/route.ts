import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { uploadReportingObligationDocument } from '@/lib/portfolio/reporting-obligation-document-upload';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Upload a reporting document for an obligation under this fund.
 * FormData: `file` (required), `obligation_id` (required), optional `submitted_date` (YYYY-MM-DD).
 * Same storage and DB behavior as POST /api/portfolio/obligations/[id]/upload.
 */
export async function POST(req: Request, ctx: Ctx) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fundId } = await ctx.params;
  const supabase = createServerClient();

  const { data: fund, error: fErr } = await supabase
    .from('vc_portfolio_funds')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('id', fundId)
    .maybeSingle();

  if (fErr || !fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 });
  }

  const obligationId = String(form.get('obligation_id') ?? '').trim();
  const file = form.get('file');
  if (!obligationId) {
    return NextResponse.json({ error: 'obligation_id is required' }, { status: 400 });
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const result = await uploadReportingObligationDocument(
    supabase,
    profile,
    obligationId,
    file,
    form.get('submitted_date'),
    fundId,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    document_path: result.document_path,
    document_name: result.document_name,
    obligation: result.obligation,
    suggest_extraction: result.suggest_extraction,
  });
}

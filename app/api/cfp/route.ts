import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { canMutateCfp, canViewCfpModule } from '@/lib/cfp/access';
import { DBJ_INVESTMENT_CRITERIA } from '@/lib/cfp/dbj-criteria';
import { loadCfpListPayload } from '@/lib/cfp/list-data';

export const dynamic = 'force-dynamic';

function defaultInvestmentCriteria(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DBJ_INVESTMENT_CRITERIA)) as Record<string, unknown>;
}

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canViewCfpModule(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { payload, error } = await loadCfpListPayload(supabase, profile.tenant_id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json(payload);
}

type PostBody = {
  title: string;
  description?: string | null;
  opening_date: string;
  closing_date: string;
  investment_criteria?: Record<string, unknown> | null;
};

export async function POST(req: Request) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile();
  if (!profile || !canMutateCfp(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const opening = typeof body.opening_date === 'string' ? body.opening_date.trim() : '';
  const closing = typeof body.closing_date === 'string' ? body.closing_date.trim() : '';
  if (!title || !opening || !closing) {
    return NextResponse.json({ error: 'title, opening_date, and closing_date are required' }, { status: 400 });
  }
  if (closing <= opening) {
    return NextResponse.json({ error: 'closing_date must be after opening_date' }, { status: 400 });
  }

  const criteria =
    body.investment_criteria && typeof body.investment_criteria === 'object'
      ? (body.investment_criteria as Record<string, unknown>)
      : defaultInvestmentCriteria();

  const { data, error } = await supabase
    .from('vc_cfps')
    .insert({
      tenant_id: profile.tenant_id,
      title,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      opening_date: opening,
      closing_date: closing,
      status: 'draft',
      investment_criteria: criteria,
      timeline_milestones: [],
      created_by: profile.user_id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create CFP' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id as string });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(500),
  firm_name: z.string().trim().min(1).max(500),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  linkedin_url: z.string().trim().max(2048).optional().nullable(),
  first_contact_date: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ),
});

export async function POST(req: Request) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'write:applications')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bodyRaw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(bodyRaw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fund_managers')
    .insert({
      tenant_id: profile.tenant_id,
      name: parsed.data.name,
      firm_name: parsed.data.firm_name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      linkedin_url: parsed.data.linkedin_url ?? null,
      first_contact_date: parsed.data.first_contact_date ?? null,
    })
    .select('id, name, firm_name, email, phone, linkedin_url, first_contact_date, created_at')
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create' }, { status: 500 });

  return NextResponse.json({ manager: data });
}

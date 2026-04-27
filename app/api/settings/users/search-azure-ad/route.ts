import { NextResponse } from 'next/server';

import { getProfile, requireAuth } from '@/lib/auth/session';
import { canManageUsers } from '@/lib/auth/rbac';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type GraphUser = {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
};

async function graphAccessToken(): Promise<string | null> {
  const clientId = process.env.AZURE_AD_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET?.trim();
  const tenantId = process.env.AZURE_AD_TENANT_ID?.trim();
  if (!clientId || !clientSecret || !tenantId) return null;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);
  form.set('scope', 'https://graph.microsoft.com/.default');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  return json.access_token ?? null;
}

export async function GET(req: Request) {
  await requireAuth();
  const caller = await getProfile();
  if (!caller || !canManageUsers(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ users: [] });

  const accessToken = await graphAccessToken();
  if (!accessToken) {
    return NextResponse.json({ users: [], graph_unavailable: true });
  }

  const searchQuery = `"displayName:${q}" OR "mail:${q}"`;
  const graphUrl =
    `https://graph.microsoft.com/v1.0/users` +
    `?$search=${encodeURIComponent(searchQuery)}` +
    `&$select=id,displayName,mail,userPrincipalName,jobTitle` +
    `&$top=10`;

  const graphRes = await fetch(graphUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ConsistencyLevel: 'eventual',
    },
    cache: 'no-store',
  });

  if (!graphRes.ok) {
    return NextResponse.json({ users: [], graph_unavailable: true });
  }

  const graphJson = (await graphRes.json().catch(() => ({}))) as { value?: GraphUser[] };
  const candidates = (graphJson.value ?? [])
    .map((u) => ({
      azure_id: u.id,
      name: u.displayName?.trim() || 'Unknown User',
      email: (u.mail || u.userPrincipalName || '').trim().toLowerCase(),
      job_title: u.jobTitle ?? null,
    }))
    .filter((u) => u.email.length > 0);

  const uniqueEmails = [...new Set(candidates.map((c) => c.email))];
  const supabase = createServerClient();
  let activeRoleEmails = new Set<string>();

  if (uniqueEmails.length > 0) {
    const { data: profiles } = await supabase
      .from('vc_profiles')
      .select('id, email')
      .eq('tenant_id', caller.tenant_id)
      .in('email', uniqueEmails);
    const profileRows = profiles ?? [];
    const profileByEmail = new Map(profileRows.map((p) => [String(p.email).toLowerCase(), String(p.id)]));
    const profileIds = [...new Set(profileRows.map((p) => String(p.id)))];

    if (profileIds.length > 0) {
      const { data: roles } = await supabase
        .from('vc_user_roles')
        .select('profile_id, is_active')
        .eq('tenant_id', caller.tenant_id)
        .in('profile_id', profileIds)
        .eq('is_active', true);
      const activeProfileIds = new Set((roles ?? []).map((r) => String(r.profile_id)));
      activeRoleEmails = new Set(
        [...profileByEmail.entries()].filter(([, id]) => activeProfileIds.has(id)).map(([email]) => email),
      );
    }
  }

  return NextResponse.json({
    users: candidates.map((u) => ({
      ...u,
      already_added: activeRoleEmails.has(u.email),
    })),
  });
}

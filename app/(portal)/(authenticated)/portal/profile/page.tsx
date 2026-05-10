import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/portal/PortalShell';
import { PortalProfilePageClient } from '@/components/portal/PortalProfilePageClient';
import { authOptions } from '@/lib/auth-options';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import type { ContactWithFirm, PortalProfileApplication } from '@/types/portal-profile';

export const dynamic = 'force-dynamic';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseFundManagersEmbed(v: unknown): ContactWithFirm['fund_managers'] {
  if (v == null) return null;
  const first: unknown = Array.isArray(v) ? v[0] : v;
  if (!isRecord(first)) return null;
  const id = first['id'];
  const firm_name = first['firm_name'];
  const name = first['name'];
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return {
    id,
    firm_name: typeof firm_name === 'string' ? firm_name : null,
    name,
  };
}

function parseContactRow(row: unknown): ContactWithFirm | null {
  if (!isRecord(row)) return null;
  const id = row['id'];
  const full_name = row['full_name'];
  const email = row['email'];
  const title = row['title'];
  const is_primary = row['is_primary'];
  const invited_at = row['invited_at'];
  const last_login_at = row['last_login_at'];
  const fund_manager_id = row['fund_manager_id'];
  if (typeof id !== 'string' || typeof full_name !== 'string' || typeof email !== 'string') return null;
  if (typeof is_primary !== 'boolean') return null;
  const fmIdParsed =
    typeof fund_manager_id === 'string' ? fund_manager_id : fund_manager_id === null ? null : null;
  return {
    id,
    full_name,
    email,
    title: typeof title === 'string' ? title : title === null ? null : null,
    is_primary,
    invited_at: typeof invited_at === 'string' ? invited_at : invited_at === null ? null : null,
    last_login_at: typeof last_login_at === 'string' ? last_login_at : last_login_at === null ? null : null,
    fund_manager_id: fmIdParsed,
    fund_managers: parseFundManagersEmbed(row['fund_managers']),
  };
}

function parseApplicationRows(rows: unknown): PortalProfileApplication[] {
  if (!Array.isArray(rows)) return [];
  const out: PortalProfileApplication[] = [];
  for (const r of rows) {
    if (!isRecord(r)) continue;
    const id = r['id'];
    const fund_name = r['fund_name'];
    const status = r['status'];
    const submitted_at = r['submitted_at'];
    if (typeof id !== 'string' || typeof fund_name !== 'string' || typeof status !== 'string') continue;
    out.push({
      id,
      fund_name,
      status,
      submitted_at: typeof submitted_at === 'string' ? submitted_at : submitted_at === null ? null : null,
    });
  }
  return out;
}

function parseProfileRow(row: unknown): { full_name: string; email: string; created_at: string } | null {
  if (!isRecord(row)) return null;
  const full_name = row['full_name'];
  const email = row['email'];
  const created_at = row['created_at'];
  if (typeof full_name !== 'string' || typeof email !== 'string' || typeof created_at !== 'string') return null;
  return { full_name, email, created_at };
}

export default async function PortalProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/portal/login');
  if (session.user.role !== 'fund_manager') redirect('/portal/login');

  const tenantId = session.user.tenant_id;
  if (!tenantId) redirect('/portal/login');

  const userId = session.user.id;
  const admin = createServiceRoleClient();

  const [{ data: tenantRow }, { data: contactRaw, error: contactErr }, { data: profileRaw }] = await Promise.all([
    admin.from('vc_tenants').select('name').eq('id', tenantId).maybeSingle(),
    admin
      .from('fund_manager_contacts')
      .select(
        'id, full_name, email, title, is_primary, invited_at, last_login_at, fund_manager_id, fund_managers ( id, firm_name, name )',
      )
      .eq('portal_user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('vc_profiles')
      .select('full_name, email, created_at')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('is_portal_user', true)
      .maybeSingle(),
  ]);

  if (contactErr) {
    console.error('portal/profile: contact', contactErr);
  }

  const contact = contactRaw ? parseContactRow(contactRaw) : null;
  const profile = profileRaw ? parseProfileRow(profileRaw) : null;

  const tenantName =
    tenantRow && isRecord(tenantRow) && typeof tenantRow['name'] === 'string' && tenantRow['name'].trim()
      ? tenantRow['name'].trim()
      : '—';

  const rawFm =
    contactRaw && isRecord(contactRaw) && typeof contactRaw['fund_manager_id'] === 'string'
      ? contactRaw['fund_manager_id']
      : null;
  const fmId = contact?.fund_manager_id ?? rawFm;

  const { data: appRows, error: appErr } = fmId
    ? await admin
        .from('vc_fund_applications')
        .select('id, fund_name, status, submitted_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .or(`created_by.eq.${userId},fund_manager_id.eq.${fmId}`)
        .order('created_at', { ascending: false })
    : await admin
        .from('vc_fund_applications')
        .select('id, fund_name, status, submitted_at')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

  if (appErr) {
    console.error('portal/profile: applications', appErr);
  }

  const applications = parseApplicationRows(appRows ?? []);

  return (
    <PortalShell user={session.user}>
      <PortalProfilePageClient
        tenantName={tenantName}
        contact={contact}
        profile={profile}
        sessionUser={{
          name: session.user.name ?? session.user.full_name,
          email: session.user.email ?? '',
          full_name: session.user.full_name,
        }}
        applications={applications}
      />
    </PortalShell>
  );
}

import { DivestmentTrackingClient } from '@/components/portfolio/DivestmentTrackingClient';
import { can } from '@/lib/auth/permissions';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { type DivestmentRow, summarizeDivestments } from '@/lib/portfolio/divestments';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DivestmentPage() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="text-sm text-red-700">Forbidden</p>;
  }

  const supabase = createServerClient();
  const [divRes, fundRes] = await Promise.all([
    supabase
      .from('vc_divestments')
      .select(
        'id, tenant_id, fund_id, company_name, divestment_type, announcement_date, completion_date, original_investment_amount, proceeds_received, currency, multiple_on_invested_capital, is_full_exit, remaining_stake_pct, exit_route, notes, buyer_name, status, created_by, created_at, updated_at',
      )
      .eq('tenant_id', profile.tenant_id)
      .order('completion_date', { ascending: false }),
    supabase
      .from('vc_portfolio_funds')
      .select('id, fund_name, currency, exchange_rate_jmd_usd')
      .eq('tenant_id', profile.tenant_id)
      .eq('fund_status', 'active')
      .order('fund_name'),
  ]);
  if (divRes.error) return <p className="text-sm text-red-700">Error loading divestments: {divRes.error.message}</p>;
  if (fundRes.error) return <p className="text-sm text-red-700">Error loading funds: {fundRes.error.message}</p>;

  const divestments = (divRes.data ?? []) as DivestmentRow[];
  const funds = (fundRes.data ?? []) as Array<{
    id: string;
    fund_name: string;
    currency: 'USD' | 'JMD';
    exchange_rate_jmd_usd: number | null;
  }>;
  const fundById = new Map(
    funds.map((f) => [f.id, { fund_name: f.fund_name, exchange_rate_jmd_usd: f.exchange_rate_jmd_usd }]),
  );

  return (
    <DivestmentTrackingClient
      funds={funds}
      initialData={{
        divestments,
        summary: summarizeDivestments(divestments, fundById),
      }}
    />
  );
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

function pickManagerOrFundId(payload: WebhookPayload): { fundManagerId?: string; fundId?: string } {
  const r = payload.record ?? {};
  const o = payload.old_record ?? {};
  const manager = (r.fund_manager_id as string | undefined) ?? (o.fund_manager_id as string | undefined);
  const fundId = (r.fund_id as string | undefined) ?? (o.fund_id as string | undefined);
  return { fundManagerId: manager, fundId };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = (await req.json().catch(() => ({}))) as WebhookPayload;
  const { fundManagerId, fundId } = pickManagerOrFundId(payload);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const appUrl = Deno.env.get('APP_BASE_URL') ?? '';
  const triggerSecret = Deno.env.get('RELATIONSHIP_PROFILE_TRIGGER_SECRET') ?? '';
  if (!supabaseUrl || !serviceRole || !appUrl || !triggerSecret) {
    return new Response('Missing required env vars', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  let managerId = fundManagerId;
  if (!managerId && fundId) {
    const { data } = await supabase
      .from('vc_portfolio_funds')
      .select('fund_manager_id')
      .eq('id', fundId)
      .maybeSingle();
    managerId = (data?.fund_manager_id as string | null) ?? undefined;
  }
  if (!managerId && payload.table === 'fund_manager_notes') {
    const rec = payload.record ?? {};
    managerId = rec.fund_manager_id as string | undefined;
  }
  if (!managerId) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'No manager id resolved' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const response = await fetch(`${appUrl.replace(/\/$/, '')}/api/ai/relationship-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-relationship-trigger-secret': triggerSecret,
    },
    body: JSON.stringify({ fund_manager_id: managerId }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return new Response(JSON.stringify({ ok: false, status: response.status, body: text }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, fund_manager_id: managerId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

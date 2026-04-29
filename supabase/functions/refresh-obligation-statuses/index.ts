import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const today = new Date().toISOString().split('T')[0]!;
  const in14Days = new Date();
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = in14Days.toISOString().split('T')[0]!;
  const minus30Days = new Date();
  minus30Days.setDate(minus30Days.getDate() - 30);
  const minus30DaysStr = minus30Days.toISOString().split('T')[0]!;

  const { data: tenants } = await supabase.from('vc_tenants').select('id');

  for (const tenant of tenants ?? []) {
    const tid = String((tenant as { id: string }).id);

    await supabase
      .from('vc_reporting_obligations')
      .update({ status: 'due' })
      .eq('tenant_id', tid)
      .eq('status', 'pending')
      .lte('due_date', in14DaysStr)
      .gte('due_date', today);

    await supabase
      .from('vc_reporting_obligations')
      .update({ status: 'outstanding' })
      .eq('tenant_id', tid)
      .in('status', ['pending', 'due'])
      .lt('due_date', today);

    await supabase
      .from('vc_reporting_obligations')
      .update({ status: 'overdue' })
      .eq('tenant_id', tid)
      .eq('status', 'outstanding')
      .lt('due_date', minus30DaysStr);
  }

  return new Response(JSON.stringify({ ok: true, ran_at: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

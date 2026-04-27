// TODO: DEPLOY THIS AS A SUPABASE EDGE FUNCTION
// Schedule: every 30 minutes via pg_cron or
// Supabase cron (Dashboard → Edge Functions → Schedules)
//
// This function:
// 1. Finds all presentations where:
//    - status = 'scheduled'
//    - scheduled_date is in the past (see cutoff logic below — refine when meeting times exist)
// 2. Marks them as completed (auto_completed = true)
// 3. Updates application status to presentation_complete
// 4. If Teams meeting: fetches recording URL via Graph API
//
// To enable:
// 1. Deploy: supabase functions deploy auto-complete-presentations
// 2. Set schedule in Supabase Dashboard
// 3. Add SUPABASE_SERVICE_ROLE_KEY to function secrets

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  // Stub: treat scheduled_date (date-only) as past when strictly before UTC calendar today.
  // TODO: refine with meeting start time + grace window (e.g. scheduled_date + duration + 2h).
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data: presentations, error } = await supabase
    .from('vc_presentations')
    .select('id, application_id, teams_meeting_id, scheduled_date')
    .eq('status', 'scheduled')
    .lt('scheduled_date', todayUtc);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: string[] = [];

  for (const pres of presentations ?? []) {
    const actualDate = new Date().toISOString().slice(0, 10);

    await supabase
      .from('vc_presentations')
      .update({
        status: 'completed',
        actual_date: actualDate,
        auto_completed: true,
      })
      .eq('id', pres.id as string);

    await supabase.from('vc_fund_applications').update({ status: 'presentation_complete' }).eq('id', pres.application_id as string);

    // TODO: TEAMS INTEGRATION
    // If pres.teams_meeting_id exists:
    // Fetch recording URL from Graph API
    // Update teams_recording_url on presentation

    results.push(pres.id as string);
  }

  return new Response(JSON.stringify({ auto_completed: results.length, ids: results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

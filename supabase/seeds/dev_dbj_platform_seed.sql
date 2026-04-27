-- =============================================================================
-- DBJ VC — development seed (single tenant, users, sample pipeline data)
-- =============================================================================
-- Idempotent: safe to run multiple times (looks up by slug / email / names).
--
-- Prerequisites:
--   - All DBJ VC migrations applied (core schema + RLS + scoring fixes, etc.)
--   - auth.users / auth.identities: PostgreSQL requires the TABLE OWNER (or a
--     superuser) to INSERT. If you see 42501 "must be owner of table users":
--       • Local: run the whole file via `supabase db reset` / `supabase db seed`,
--         or `psql` with the **postgres** user on the DB port (CLI status shows
--         it, often 54322), not the transaction pooler (6543).
--       • Hosted Supabase: use **SQL Editor** while connected as a role that
--         owns auth (often works as postgres); or create the four users under
--         Authentication → Users, then re-run this seed (it will skip INSERTs
--         when those emails already exist).
--     The "service_role" API key does not grant SQL table ownership — use the
--     database postgres connection string for auth inserts, or the Dashboard.
--
-- Test login (email / password) after seed:
--   admin@dbj.com          / Devpassword123!
--   analyst.one@dbj.com    / Devpassword123!
--   officer.one@dbj.com    / Devpassword123!
--   viewer@dbj.com         / Devpassword123!
--
-- Password hashing: bcrypt via pgcrypto crypt(..., gen_salt('bf')).
--
-- Transaction split: PostgreSQL requires enum label 'funded' to be committed
-- before it can be used in INSERTs; extension + enum run in their own txn.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Allow application row in terminal "funded" state (not in original enum).
DO $enum$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'fund_application_status'
      AND e.enumlabel = 'funded'
  ) THEN
    ALTER TYPE public.fund_application_status ADD VALUE 'funded';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$enum$;

COMMIT;

BEGIN;

DO $$
DECLARE
  v_instance_id uuid;
  v_pw          text := crypt('Devpassword123!', gen_salt('bf'));

  v_tenant_id   uuid;
  v_admin_id    uuid;
  v_analyst_id  uuid;
  v_officer_id  uuid;
  v_viewer_id   uuid;

  v_app_caribbean uuid;
  v_app_jamaica   uuid;
  v_app_sme       uuid;
  v_app_diaspora  uuid;
  v_app_agritech  uuid;

  v_chk_caribbean uuid;

  v_q_jamaica   uuid;
  v_q_sme       uuid;
  v_q_diaspora  uuid;

  v_deal_agri   uuid;
  v_inv_agri    uuid;

  v_inv_idb     uuid;
  v_inv_goj     uuid;
  v_inv_jpsa    uuid;

  v_assess_sme  uuid;
  v_assess_dia  uuid;

  v_ratio_pass  numeric := 0.78;
  v_ratio_fail  numeric := 0.52;

  v_can_mutate_auth boolean;
BEGIN
  ---------------------------------------------------------------------------
  -- Can this session INSERT into auth.users? (42501 if not owner/superuser.)
  ---------------------------------------------------------------------------
  v_can_mutate_auth := coalesce(
    (
      SELECT c.relowner = r.oid OR r.rolsuper
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN pg_catalog.pg_roles r
      WHERE n.nspname = 'auth'
        AND c.relname = 'users'
        AND r.rolname = current_user
    ),
    false
  );

  ---------------------------------------------------------------------------
  -- Auth instance_id for auth.users (GoTrue).
  -- Use the standard all-zero UUID for local/dev seeds. Do not use
  --   SELECT id INTO v_instance_id FROM auth.instances
  -- here: some runners execute statements outside the DO block, where
  -- SELECT ... INTO <name> is interpreted as CREATE TABLE <name>, which
  -- yields errors like: relation "v_instance_id" does not exist (42P01).
  -- Same pitfall applies to every PL variable (e.g. v_admin_id): use
  --   var := (SELECT ... LIMIT 1)
  -- instead of SELECT ... INTO var throughout this seed.
  -- If you ever need the real hosted instance UUID, set it explicitly after
  -- confirming auth.instances exists (e.g. SELECT id FROM auth.instances).
  ---------------------------------------------------------------------------
  v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;

  ---------------------------------------------------------------------------
  -- Users + identities (by email)
  ---------------------------------------------------------------------------
  v_admin_id := (SELECT id FROM auth.users WHERE email = 'admin@dbj.com' LIMIT 1);
  IF v_admin_id IS NULL THEN
    IF NOT v_can_mutate_auth THEN
      RAISE EXCEPTION
        'Cannot INSERT into auth.users as role "%": must be owner of auth.users or a superuser (SQLSTATE 42501). '
        'Use a direct postgres connection (local: supabase db reset / psql on the DB port), '
        'or create user admin@dbj.com in the Supabase Auth UI then re-run this seed.',
        current_user;
    END IF;
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      v_admin_id, v_instance_id, 'authenticated', 'authenticated', 'admin@dbj.com', v_pw,
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_admin_id,
      jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@dbj.com'),
      'email',
      'admin@dbj.com',
      now(),
      now(),
      now()
    );
  END IF;

  v_analyst_id := (SELECT id FROM auth.users WHERE email = 'analyst.one@dbj.com' LIMIT 1);
  IF v_analyst_id IS NULL THEN
    IF NOT v_can_mutate_auth THEN
      RAISE EXCEPTION
        'Cannot INSERT into auth.users as role "%": must be owner of auth.users or a superuser (SQLSTATE 42501). '
        'Create user analyst.one@dbj.com in the Supabase Auth UI (or run seed as postgres), then re-run.',
        current_user;
    END IF;
    v_analyst_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      v_analyst_id, v_instance_id, 'authenticated', 'authenticated', 'analyst.one@dbj.com', v_pw,
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_analyst_id,
      jsonb_build_object('sub', v_analyst_id::text, 'email', 'analyst.one@dbj.com'),
      'email',
      'analyst.one@dbj.com',
      now(),
      now(),
      now()
    );
  END IF;

  v_officer_id := (SELECT id FROM auth.users WHERE email = 'officer.one@dbj.com' LIMIT 1);
  IF v_officer_id IS NULL THEN
    IF NOT v_can_mutate_auth THEN
      RAISE EXCEPTION
        'Cannot INSERT into auth.users as role "%": must be owner of auth.users or a superuser (SQLSTATE 42501). '
        'Create user officer.one@dbj.com in the Supabase Auth UI (or run seed as postgres), then re-run.',
        current_user;
    END IF;
    v_officer_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      v_officer_id, v_instance_id, 'authenticated', 'authenticated', 'officer.one@dbj.com', v_pw,
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_officer_id,
      jsonb_build_object('sub', v_officer_id::text, 'email', 'officer.one@dbj.com'),
      'email',
      'officer.one@dbj.com',
      now(),
      now(),
      now()
    );
  END IF;

  v_viewer_id := (SELECT id FROM auth.users WHERE email = 'viewer@dbj.com' LIMIT 1);
  IF v_viewer_id IS NULL THEN
    IF NOT v_can_mutate_auth THEN
      RAISE EXCEPTION
        'Cannot INSERT into auth.users as role "%": must be owner of auth.users or a superuser (SQLSTATE 42501). '
        'Create user viewer@dbj.com in the Supabase Auth UI (or run seed as postgres), then re-run.',
        current_user;
    END IF;
    v_viewer_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      v_viewer_id, v_instance_id, 'authenticated', 'authenticated', 'viewer@dbj.com', v_pw,
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_viewer_id,
      jsonb_build_object('sub', v_viewer_id::text, 'email', 'viewer@dbj.com'),
      'email',
      'viewer@dbj.com',
      now(),
      now(),
      now()
    );
  END IF;

  ---------------------------------------------------------------------------
  -- Tenant
  ---------------------------------------------------------------------------
  v_tenant_id := (SELECT id FROM public.vc_tenants WHERE slug = 'dbj' LIMIT 1);
  IF v_tenant_id IS NULL THEN
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.vc_tenants (id, name, slug)
    VALUES (v_tenant_id, 'Development Bank of Jamaica', 'dbj');
  END IF;

  ---------------------------------------------------------------------------
  -- Profiles (unique per tenant + email)
  ---------------------------------------------------------------------------
  INSERT INTO public.vc_profiles (id, user_id, tenant_id, full_name, email, role)
  VALUES (gen_random_uuid(), v_admin_id, v_tenant_id, 'DBJ Admin', 'admin@dbj.com', 'admin')
  ON CONFLICT (tenant_id, email) DO NOTHING;

  INSERT INTO public.vc_profiles (id, user_id, tenant_id, full_name, email, role)
  VALUES (gen_random_uuid(), v_analyst_id, v_tenant_id, 'DBJ Analyst One', 'analyst.one@dbj.com', 'analyst')
  ON CONFLICT (tenant_id, email) DO NOTHING;

  INSERT INTO public.vc_profiles (id, user_id, tenant_id, full_name, email, role)
  VALUES (gen_random_uuid(), v_officer_id, v_tenant_id, 'DBJ Officer One', 'officer.one@dbj.com', 'officer')
  ON CONFLICT (tenant_id, email) DO NOTHING;

  INSERT INTO public.vc_profiles (id, user_id, tenant_id, full_name, email, role)
  VALUES (gen_random_uuid(), v_viewer_id, v_tenant_id, 'DBJ Viewer', 'viewer@dbj.com', 'viewer')
  ON CONFLICT (tenant_id, email) DO NOTHING;

  ---------------------------------------------------------------------------
  -- Fund applications (by fund_name + tenant)
  ---------------------------------------------------------------------------
  v_app_caribbean := (
    SELECT id FROM public.vc_fund_applications
    WHERE tenant_id = v_tenant_id AND fund_name = 'Caribbean Growth Fund I' AND deleted_at IS NULL
    LIMIT 1
  );
  IF v_app_caribbean IS NULL THEN
    v_app_caribbean := gen_random_uuid();
    INSERT INTO public.vc_fund_applications (
      id, tenant_id, fund_name, manager_name, country_of_incorporation, geographic_area,
      total_capital_commitment_usd, status, submitted_at, created_by
    ) VALUES (
      v_app_caribbean, v_tenant_id, 'Caribbean Growth Fund I', 'Growth Capital Partners', 'Jamaica', 'Caribbean',
      15000000, 'pre_screening', now() - interval '30 days', v_admin_id
    );
  END IF;

  v_app_jamaica := (
    SELECT id FROM public.vc_fund_applications
    WHERE tenant_id = v_tenant_id AND fund_name = 'Jamaica Tech Ventures' AND deleted_at IS NULL
    LIMIT 1
  );
  IF v_app_jamaica IS NULL THEN
    v_app_jamaica := gen_random_uuid();
    INSERT INTO public.vc_fund_applications (
      id, tenant_id, fund_name, manager_name, country_of_incorporation, geographic_area,
      total_capital_commitment_usd, status, submitted_at, created_by
    ) VALUES (
      v_app_jamaica, v_tenant_id, 'Jamaica Tech Ventures', 'Tech Ventures JA Ltd', 'Jamaica', 'Caribbean',
      8000000, 'due_diligence', now() - interval '25 days', v_admin_id
    );
  END IF;

  v_app_sme := (
    SELECT id FROM public.vc_fund_applications
    WHERE tenant_id = v_tenant_id AND fund_name = 'SME Impact Fund III' AND deleted_at IS NULL
    LIMIT 1
  );
  IF v_app_sme IS NULL THEN
    v_app_sme := gen_random_uuid();
    INSERT INTO public.vc_fund_applications (
      id, tenant_id, fund_name, manager_name, country_of_incorporation, geographic_area,
      total_capital_commitment_usd, status, submitted_at, created_by
    ) VALUES (
      v_app_sme, v_tenant_id, 'SME Impact Fund III', 'SME Impact Managers LLC', 'Jamaica', 'Caribbean',
      20000000, 'approved', now() - interval '60 days', v_admin_id
    );
  END IF;

  v_app_diaspora := (
    SELECT id FROM public.vc_fund_applications
    WHERE tenant_id = v_tenant_id AND fund_name = 'Diaspora Investment Fund' AND deleted_at IS NULL
    LIMIT 1
  );
  IF v_app_diaspora IS NULL THEN
    v_app_diaspora := gen_random_uuid();
    INSERT INTO public.vc_fund_applications (
      id, tenant_id, fund_name, manager_name, country_of_incorporation, geographic_area,
      total_capital_commitment_usd, status, submitted_at, created_by
    ) VALUES (
      v_app_diaspora, v_tenant_id, 'Diaspora Investment Fund', 'Diaspora Capital GP', 'Jamaica', 'Caribbean',
      12000000, 'rejected', now() - interval '45 days', v_admin_id
    );
  END IF;

  v_app_agritech := (
    SELECT id FROM public.vc_fund_applications
    WHERE tenant_id = v_tenant_id AND fund_name = 'AgriTech Caribbean Fund' AND deleted_at IS NULL
    LIMIT 1
  );
  IF v_app_agritech IS NULL THEN
    v_app_agritech := gen_random_uuid();
    INSERT INTO public.vc_fund_applications (
      id, tenant_id, fund_name, manager_name, country_of_incorporation, geographic_area,
      total_capital_commitment_usd, status, submitted_at, created_by
    ) VALUES (
      v_app_agritech, v_tenant_id, 'AgriTech Caribbean Fund', 'AgriTech Caribbean GP', 'Jamaica', 'Caribbean',
      25000000, 'funded', now() - interval '90 days', v_admin_id
    );
  END IF;

  ---------------------------------------------------------------------------
  -- Pre-screening checklist (Caribbean Growth Fund I)
  ---------------------------------------------------------------------------
  v_chk_caribbean := (
    SELECT id FROM public.vc_pre_screening_checklists
    WHERE tenant_id = v_tenant_id AND application_id = v_app_caribbean
    LIMIT 1
  );
  IF v_chk_caribbean IS NULL THEN
    v_chk_caribbean := gen_random_uuid();
    INSERT INTO public.vc_pre_screening_checklists (
      id, tenant_id, application_id, fund_info_complete, strategy_complete,
      management_complete, legal_complete, overall_pass
    ) VALUES (
      v_chk_caribbean, v_tenant_id, v_app_caribbean, false, false, false, false, false
    );
  END IF;

  ---------------------------------------------------------------------------
  -- Questionnaires
  ---------------------------------------------------------------------------
  v_q_jamaica := (
    SELECT id FROM public.vc_dd_questionnaires
    WHERE tenant_id = v_tenant_id AND application_id = v_app_jamaica
    LIMIT 1
  );
  IF v_q_jamaica IS NULL THEN
    v_q_jamaica := gen_random_uuid();
    INSERT INTO public.vc_dd_questionnaires (id, tenant_id, application_id, status, started_at)
    VALUES (v_q_jamaica, v_tenant_id, v_app_jamaica, 'in_progress', now() - interval '10 days');
  END IF;

  v_q_sme := (
    SELECT id FROM public.vc_dd_questionnaires
    WHERE tenant_id = v_tenant_id AND application_id = v_app_sme
    LIMIT 1
  );
  IF v_q_sme IS NULL THEN
    v_q_sme := gen_random_uuid();
    INSERT INTO public.vc_dd_questionnaires (id, tenant_id, application_id, status, started_at, completed_at)
    VALUES (v_q_sme, v_tenant_id, v_app_sme, 'completed', now() - interval '40 days', now() - interval '15 days');
  END IF;

  v_q_diaspora := (
    SELECT id FROM public.vc_dd_questionnaires
    WHERE tenant_id = v_tenant_id AND application_id = v_app_diaspora
    LIMIT 1
  );
  IF v_q_diaspora IS NULL THEN
    v_q_diaspora := gen_random_uuid();
    INSERT INTO public.vc_dd_questionnaires (id, tenant_id, application_id, status, started_at, completed_at)
    VALUES (v_q_diaspora, v_tenant_id, v_app_diaspora, 'completed', now() - interval '35 days', now() - interval '12 days');
  END IF;

  ---------------------------------------------------------------------------
  -- DD sections helper: ensure 9 sections for a questionnaire
  ---------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.vc_dd_sections WHERE tenant_id = v_tenant_id AND questionnaire_id = v_q_jamaica LIMIT 1
  ) THEN
    INSERT INTO public.vc_dd_sections (id, questionnaire_id, tenant_id, section_key, section_order, status)
    VALUES
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'basic_info'::public.dd_section_key, 1, 'in_progress'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'sponsor'::public.dd_section_key, 2, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'deal_flow'::public.dd_section_key, 3, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'portfolio_monitoring'::public.dd_section_key, 4, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'investment_strategy'::public.dd_section_key, 5, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'governing_rules'::public.dd_section_key, 6, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'investors_fundraising'::public.dd_section_key, 7, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'legal'::public.dd_section_key, 8, 'not_started'),
      (gen_random_uuid(), v_q_jamaica, v_tenant_id, 'staff_bios'::public.dd_section_key, 9, 'not_started');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_dd_sections WHERE tenant_id = v_tenant_id AND questionnaire_id = v_q_sme LIMIT 1
  ) THEN
    INSERT INTO public.vc_dd_sections (id, questionnaire_id, tenant_id, section_key, section_order, status)
    VALUES
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'basic_info'::public.dd_section_key, 1, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'sponsor'::public.dd_section_key, 2, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'deal_flow'::public.dd_section_key, 3, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'portfolio_monitoring'::public.dd_section_key, 4, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'investment_strategy'::public.dd_section_key, 5, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'governing_rules'::public.dd_section_key, 6, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'investors_fundraising'::public.dd_section_key, 7, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'legal'::public.dd_section_key, 8, 'completed'),
      (gen_random_uuid(), v_q_sme, v_tenant_id, 'staff_bios'::public.dd_section_key, 9, 'completed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_dd_sections WHERE tenant_id = v_tenant_id AND questionnaire_id = v_q_diaspora LIMIT 1
  ) THEN
    INSERT INTO public.vc_dd_sections (id, questionnaire_id, tenant_id, section_key, section_order, status)
    VALUES
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'basic_info'::public.dd_section_key, 1, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'sponsor'::public.dd_section_key, 2, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'deal_flow'::public.dd_section_key, 3, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'portfolio_monitoring'::public.dd_section_key, 4, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'investment_strategy'::public.dd_section_key, 5, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'governing_rules'::public.dd_section_key, 6, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'investors_fundraising'::public.dd_section_key, 7, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'legal'::public.dd_section_key, 8, 'completed'),
      (gen_random_uuid(), v_q_diaspora, v_tenant_id, 'staff_bios'::public.dd_section_key, 9, 'completed');
  END IF;

  ---------------------------------------------------------------------------
  -- Assessments (SME + Diaspora) — criteria + subcriteria scaffold then scores
  ---------------------------------------------------------------------------
  v_assess_sme := (
    SELECT id FROM public.vc_assessments
    WHERE tenant_id = v_tenant_id AND application_id = v_app_sme
    LIMIT 1
  );
  IF v_assess_sme IS NULL THEN
    v_assess_sme := gen_random_uuid();
    INSERT INTO public.vc_assessments (
      id, tenant_id, application_id, questionnaire_id, evaluator_id, status,
      overall_score, overall_weighted_score, pass_threshold, passed, recommendation,
      completed_at, approved_by
    ) VALUES (
      v_assess_sme, v_tenant_id, v_app_sme, v_q_sme, v_analyst_id, 'approved',
      78, 78, 70, true, 'approve'::public.assessment_recommendation,
      now() - interval '14 days', v_admin_id
    );

    INSERT INTO public.vc_assessment_criteria (id, tenant_id, assessment_id, criteria_key, criteria_weight, max_points, raw_score, weighted_score)
    VALUES
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'firm'::public.vc_assessment_criteria_key, 12, 12, round(12 * v_ratio_pass, 2), round(12 * v_ratio_pass, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'fundraising'::public.vc_assessment_criteria_key, 18, 18, round(18 * v_ratio_pass, 2), round(18 * v_ratio_pass, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'team'::public.vc_assessment_criteria_key, 20, 20, round(20 * v_ratio_pass, 2), round(20 * v_ratio_pass, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'investment_strategy'::public.vc_assessment_criteria_key, 10, 10, round(10 * v_ratio_pass, 2), round(10 * v_ratio_pass, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'investment_process'::public.vc_assessment_criteria_key, 15, 15, round(15 * v_ratio_pass, 2), round(15 * v_ratio_pass, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'representative_pipeline'::public.vc_assessment_criteria_key, 15, 15, round(15 * v_ratio_pass, 2), round(15 * v_ratio_pass, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_sme, 'governance'::public.vc_assessment_criteria_key, 10, 10, round(10 * v_ratio_pass, 2), round(10 * v_ratio_pass, 2));

    -- Subcriteria rows + scores (proportional to max_points * ratio)
    INSERT INTO public.vc_assessment_subcriteria (id, tenant_id, criteria_id, subcriteria_key, description, max_points, score)
    SELECT gen_random_uuid(), v_tenant_id, c.id, s.subk, s.descr, s.mx, round(s.mx * v_ratio_pass, 2)
    FROM public.vc_assessment_criteria c
    CROSS JOIN LATERAL (
      VALUES
        ('firm', 'sme_experience', 'Experience with SME investment and finance', 6::numeric),
        ('firm', 'financial_strength', 'Financial strength', 3::numeric),
        ('firm', 'business_network', 'Quality of firm business network', 3::numeric),
        ('fundraising', 'financial_commitment', 'Financial commitment to the fund', 6::numeric),
        ('fundraising', 'raise_existing', 'Ability to fundraise from existing clients/investors', 4::numeric),
        ('fundraising', 'raise_new', 'Ability to fundraise from new investors', 4::numeric),
        ('fundraising', 'fundraising_strategy', 'Fundraising strategy', 4::numeric),
        ('team', 'individual_experience', 'Individual experience of team members', 2::numeric),
        ('team', 'work_together', 'Previous work together of team members', 4::numeric),
        ('team', 'dedication', 'Dedication of team to the fund', 3::numeric),
        ('team', 'complementarity', 'Complementarity of team skills', 2::numeric),
        ('team', 'remuneration_retention', 'Remuneration and retention policy', 3::numeric),
        ('team', 'personal_commitments', 'Personal commitments by team members to fund capital', 3::numeric),
        ('team', 'capacity_commitments', 'Evidence of capacity to meet capital commitments', 3::numeric),
        ('investment_strategy', 'pipeline_development', 'Pipeline development', 1::numeric),
        ('investment_strategy', 'deal_negotiation', 'Deal negotiation and structuring', 2::numeric),
        ('investment_strategy', 'portfolio_management', 'Portfolio management', 3::numeric),
        ('investment_strategy', 'exit_strategy', 'Exit strategy', 2::numeric),
        ('investment_strategy', 'esg_impact', 'ESG/Impact strategy', 2::numeric),
        ('investment_process', 'lead_generation', 'Lead generation', 1::numeric),
        ('investment_process', 'screening', 'Screening', 1::numeric),
        ('investment_process', 'due_diligence', 'Due diligence', 2::numeric),
        ('investment_process', 'value_addition', 'Value addition plans for portfolio companies', 5::numeric),
        ('investment_process', 'grooming_exit', 'Grooming companies for exit', 2::numeric),
        ('investment_process', 'reporting_systems', 'Reporting systems for portfolio companies', 2::numeric),
        ('investment_process', 'crisis_management', 'Crisis management of troubled portfolio company', 2::numeric),
        ('representative_pipeline', 'number_quality', 'Number and quality of companies', 3::numeric),
        ('representative_pipeline', 'negotiation_status', 'Negotiation status', 6::numeric),
        ('representative_pipeline', 'thesis_per_company', 'Developed information and investment thesis per company', 6::numeric),
        ('governance', 'shareholder_structure', 'Shareholder structure of fund manager', 2::numeric),
        ('governance', 'investment_committee', 'Composition and rules of Investment Committee', 2::numeric),
        ('governance', 'advisory_board', 'Composition and rules of Advisory Board', 2::numeric),
        ('governance', 'conflict_resolution', 'Conflict resolution mechanisms', 2::numeric),
        ('governance', 'reporting_valuation', 'Fund reporting & valuation', 1::numeric),
        ('governance', 'pri_esg', 'Adherence to PRI and ESG good practice', 1::numeric)
    ) AS s(criteria_key_text, subk, descr, mx)
    WHERE c.assessment_id = v_assess_sme AND c.criteria_key::text = s.criteria_key_text;
  END IF;

  v_assess_dia := (
    SELECT id FROM public.vc_assessments
    WHERE tenant_id = v_tenant_id AND application_id = v_app_diaspora
    LIMIT 1
  );
  IF v_assess_dia IS NULL THEN
    v_assess_dia := gen_random_uuid();
    INSERT INTO public.vc_assessments (
      id, tenant_id, application_id, questionnaire_id, evaluator_id, status,
      overall_score, overall_weighted_score, pass_threshold, passed, recommendation,
      completed_at
    ) VALUES (
      v_assess_dia, v_tenant_id, v_app_diaspora, v_q_diaspora, v_analyst_id, 'completed',
      52, 52, 70, false, 'reject'::public.assessment_recommendation,
      now() - interval '10 days'
    );

    INSERT INTO public.vc_assessment_criteria (id, tenant_id, assessment_id, criteria_key, criteria_weight, max_points, raw_score, weighted_score)
    VALUES
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'firm'::public.vc_assessment_criteria_key, 12, 12, round(12 * v_ratio_fail, 2), round(12 * v_ratio_fail, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'fundraising'::public.vc_assessment_criteria_key, 18, 18, round(18 * v_ratio_fail, 2), round(18 * v_ratio_fail, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'team'::public.vc_assessment_criteria_key, 20, 20, round(20 * v_ratio_fail, 2), round(20 * v_ratio_fail, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'investment_strategy'::public.vc_assessment_criteria_key, 10, 10, round(10 * v_ratio_fail, 2), round(10 * v_ratio_fail, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'investment_process'::public.vc_assessment_criteria_key, 15, 15, round(15 * v_ratio_fail, 2), round(15 * v_ratio_fail, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'representative_pipeline'::public.vc_assessment_criteria_key, 15, 15, round(15 * v_ratio_fail, 2), round(15 * v_ratio_fail, 2)),
      (gen_random_uuid(), v_tenant_id, v_assess_dia, 'governance'::public.vc_assessment_criteria_key, 10, 10, round(10 * v_ratio_fail, 2), round(10 * v_ratio_fail, 2));

    INSERT INTO public.vc_assessment_subcriteria (id, tenant_id, criteria_id, subcriteria_key, description, max_points, score)
    SELECT gen_random_uuid(), v_tenant_id, c.id, s.subk, s.descr, s.mx, round(s.mx * v_ratio_fail, 2)
    FROM public.vc_assessment_criteria c
    CROSS JOIN LATERAL (
      VALUES
        ('firm', 'sme_experience', 'Experience with SME investment and finance', 6::numeric),
        ('firm', 'financial_strength', 'Financial strength', 3::numeric),
        ('firm', 'business_network', 'Quality of firm business network', 3::numeric),
        ('fundraising', 'financial_commitment', 'Financial commitment to the fund', 6::numeric),
        ('fundraising', 'raise_existing', 'Ability to fundraise from existing clients/investors', 4::numeric),
        ('fundraising', 'raise_new', 'Ability to fundraise from new investors', 4::numeric),
        ('fundraising', 'fundraising_strategy', 'Fundraising strategy', 4::numeric),
        ('team', 'individual_experience', 'Individual experience of team members', 2::numeric),
        ('team', 'work_together', 'Previous work together of team members', 4::numeric),
        ('team', 'dedication', 'Dedication of team to the fund', 3::numeric),
        ('team', 'complementarity', 'Complementarity of team skills', 2::numeric),
        ('team', 'remuneration_retention', 'Remuneration and retention policy', 3::numeric),
        ('team', 'personal_commitments', 'Personal commitments by team members to fund capital', 3::numeric),
        ('team', 'capacity_commitments', 'Evidence of capacity to meet capital commitments', 3::numeric),
        ('investment_strategy', 'pipeline_development', 'Pipeline development', 1::numeric),
        ('investment_strategy', 'deal_negotiation', 'Deal negotiation and structuring', 2::numeric),
        ('investment_strategy', 'portfolio_management', 'Portfolio management', 3::numeric),
        ('investment_strategy', 'exit_strategy', 'Exit strategy', 2::numeric),
        ('investment_strategy', 'esg_impact', 'ESG/Impact strategy', 2::numeric),
        ('investment_process', 'lead_generation', 'Lead generation', 1::numeric),
        ('investment_process', 'screening', 'Screening', 1::numeric),
        ('investment_process', 'due_diligence', 'Due diligence', 2::numeric),
        ('investment_process', 'value_addition', 'Value addition plans for portfolio companies', 5::numeric),
        ('investment_process', 'grooming_exit', 'Grooming companies for exit', 2::numeric),
        ('investment_process', 'reporting_systems', 'Reporting systems for portfolio companies', 2::numeric),
        ('investment_process', 'crisis_management', 'Crisis management of troubled portfolio company', 2::numeric),
        ('representative_pipeline', 'number_quality', 'Number and quality of companies', 3::numeric),
        ('representative_pipeline', 'negotiation_status', 'Negotiation status', 6::numeric),
        ('representative_pipeline', 'thesis_per_company', 'Developed information and investment thesis per company', 6::numeric),
        ('governance', 'shareholder_structure', 'Shareholder structure of fund manager', 2::numeric),
        ('governance', 'investment_committee', 'Composition and rules of Investment Committee', 2::numeric),
        ('governance', 'advisory_board', 'Composition and rules of Advisory Board', 2::numeric),
        ('governance', 'conflict_resolution', 'Conflict resolution mechanisms', 2::numeric),
        ('governance', 'reporting_valuation', 'Fund reporting & valuation', 1::numeric),
        ('governance', 'pri_esg', 'Adherence to PRI and ESG good practice', 1::numeric)
    ) AS s(criteria_key_text, subk, descr, mx)
    WHERE c.assessment_id = v_assess_dia AND c.criteria_key::text = s.criteria_key_text;
  END IF;

  ---------------------------------------------------------------------------
  -- Deal + investment + disbursements (AgriTech)
  ---------------------------------------------------------------------------
  v_deal_agri := (
    SELECT id FROM public.vc_deals
    WHERE tenant_id = v_tenant_id AND application_id = v_app_agritech
    LIMIT 1
  );
  IF v_deal_agri IS NULL THEN
    v_deal_agri := gen_random_uuid();
    INSERT INTO public.vc_deals (
      id, tenant_id, application_id, title, stage, deal_value_usd, sector, geography, created_by
    ) VALUES (
      v_deal_agri, v_tenant_id, v_app_agritech, 'AgriTech Caribbean Fund — DBJ participation',
      'funded'::public.deal_stage, 2500000, 'Agriculture / AgriTech', 'Caribbean', v_admin_id
    );
  END IF;

  v_inv_agri := (
    SELECT id FROM public.vc_investments
    WHERE tenant_id = v_tenant_id AND application_id = v_app_agritech AND deal_id = v_deal_agri
    LIMIT 1
  );
  IF v_inv_agri IS NULL THEN
    v_inv_agri := gen_random_uuid();
    INSERT INTO public.vc_investments (
      id, tenant_id, deal_id, application_id, approved_amount_usd, disbursed_amount_usd,
      remaining_amount_usd, status, instrument_type, investment_date, created_by,
      portfolio_latest_score
    ) VALUES (
      v_inv_agri, v_tenant_id, v_deal_agri, v_app_agritech, 2500000, 1200000,
      1300000, 'active'::public.investment_status, 'equity'::public.instrument_type,
      (now() - interval '60 days')::date, v_admin_id, 81
    );
  ELSE
    UPDATE public.vc_investments
    SET approved_amount_usd = 2500000, disbursed_amount_usd = 1200000,
        remaining_amount_usd = 1300000, portfolio_latest_score = 81
    WHERE id = v_inv_agri;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_disbursements WHERE tenant_id = v_tenant_id AND investment_id = v_inv_agri AND tranche_number = 1
  ) THEN
    INSERT INTO public.vc_disbursements (
      id, tenant_id, investment_id, tranche_number, amount_usd, status, approved_by, disbursement_date
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_agri, 1, 700000, 'disbursed'::public.disbursement_status, v_admin_id,
      (now() - interval '45 days')::date
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_disbursements WHERE tenant_id = v_tenant_id AND investment_id = v_inv_agri AND tranche_number = 2
  ) THEN
    INSERT INTO public.vc_disbursements (
      id, tenant_id, investment_id, tranche_number, amount_usd, status, approved_by, disbursement_date
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_agri, 2, 500000, 'disbursed'::public.disbursement_status, v_admin_id,
      (now() - interval '20 days')::date
    );
  END IF;

  ---------------------------------------------------------------------------
  -- Portfolio snapshots (AgriTech investment)
  ---------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM public.vc_portfolio_snapshots
    WHERE tenant_id = v_tenant_id AND investment_id = v_inv_agri AND snapshot_date = '2024-12-31'
  ) THEN
    INSERT INTO public.vc_portfolio_snapshots (
      id, tenant_id, investment_id, snapshot_date, revenue_usd, repayment_status, performance_score, notes
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_agri, '2024-12-31', 3200000, 'current'::public.repayment_status, 74,
      'AgriTech Q4 2024'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_portfolio_snapshots
    WHERE tenant_id = v_tenant_id AND investment_id = v_inv_agri AND snapshot_date = '2025-03-31'
  ) THEN
    INSERT INTO public.vc_portfolio_snapshots (
      id, tenant_id, investment_id, snapshot_date, revenue_usd, repayment_status, performance_score, notes
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_agri, '2025-03-31', 3800000, 'current'::public.repayment_status, 81,
      'AgriTech Q1 2025'
    );
  END IF;

  ---------------------------------------------------------------------------
  -- Investors + commitments (capital figures on investor rows)
  ---------------------------------------------------------------------------
  v_inv_idb := (SELECT id FROM public.vc_investors WHERE tenant_id = v_tenant_id AND name = 'IDB Invest' LIMIT 1);
  IF v_inv_idb IS NULL THEN
    v_inv_idb := gen_random_uuid();
    INSERT INTO public.vc_investors (id, tenant_id, name, investor_type, country, committed_capital_usd, deployed_capital_usd)
    VALUES (v_inv_idb, v_tenant_id, 'IDB Invest', 'multilateral'::public.investor_type, 'United States', 5000000, 0);
  END IF;

  v_inv_goj := (SELECT id FROM public.vc_investors WHERE tenant_id = v_tenant_id AND name = 'Government of Jamaica' LIMIT 1);
  IF v_inv_goj IS NULL THEN
    v_inv_goj := gen_random_uuid();
    INSERT INTO public.vc_investors (id, tenant_id, name, investor_type, country, committed_capital_usd, deployed_capital_usd)
    VALUES (v_inv_goj, v_tenant_id, 'Government of Jamaica', 'government'::public.investor_type, 'Jamaica', 10000000, 0);
  END IF;

  v_inv_jpsa := (SELECT id FROM public.vc_investors WHERE tenant_id = v_tenant_id AND name = 'Jamaica Private Sector Alliance' LIMIT 1);
  IF v_inv_jpsa IS NULL THEN
    v_inv_jpsa := gen_random_uuid();
    INSERT INTO public.vc_investors (id, tenant_id, name, investor_type, country, committed_capital_usd, deployed_capital_usd)
    VALUES (v_inv_jpsa, v_tenant_id, 'Jamaica Private Sector Alliance', 'private'::public.investor_type, 'Jamaica', 2000000, 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_investor_commitments
    WHERE tenant_id = v_tenant_id AND investor_id = v_inv_idb AND investment_id = v_inv_agri AND committed_amount_usd = 5000000
  ) THEN
    INSERT INTO public.vc_investor_commitments (
      id, tenant_id, investor_id, application_id, investment_id, committed_amount_usd, deployed_amount_usd, confirmed, commitment_date, notes
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_idb, v_app_agritech, v_inv_agri, 5000000, 0, true, '2024-06-01', 'Seed: IDB Invest commitment to AgriTech'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_investor_commitments
    WHERE tenant_id = v_tenant_id AND investor_id = v_inv_goj AND investment_id = v_inv_agri AND committed_amount_usd = 10000000
  ) THEN
    INSERT INTO public.vc_investor_commitments (
      id, tenant_id, investor_id, application_id, investment_id, committed_amount_usd, deployed_amount_usd, confirmed, commitment_date, notes
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_goj, v_app_agritech, v_inv_agri, 10000000, 0, true, '2024-06-01', 'Seed: GOJ commitment to AgriTech'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_investor_commitments
    WHERE tenant_id = v_tenant_id AND investor_id = v_inv_jpsa AND investment_id = v_inv_agri AND committed_amount_usd = 2000000
  ) THEN
    INSERT INTO public.vc_investor_commitments (
      id, tenant_id, investor_id, application_id, investment_id, committed_amount_usd, deployed_amount_usd, confirmed, commitment_date, notes
    ) VALUES (
      gen_random_uuid(), v_tenant_id, v_inv_jpsa, v_app_agritech, v_inv_agri, 2000000, 0, true, '2024-06-15', 'Seed: JPSA commitment to AgriTech'
    );
  END IF;

  ---------------------------------------------------------------------------
  -- Tasks (idempotent by title + tenant)
  ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.vc_tasks WHERE tenant_id = v_tenant_id AND title = 'Complete pre-screening review for Caribbean Growth Fund I') THEN
    INSERT INTO public.vc_tasks (
      id, tenant_id, entity_type, entity_id, assigned_to, title, description, status, priority, due_date, created_by
    ) VALUES (
      gen_random_uuid(), v_tenant_id, 'application', v_app_caribbean, v_officer_id,
      'Complete pre-screening review for Caribbean Growth Fund I',
      'Review checklist and record outcomes for Caribbean Growth Fund I.',
      'pending'::public.task_status, 'high'::public.task_priority, (now() + interval '5 days')::date, v_admin_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vc_tasks WHERE tenant_id = v_tenant_id AND title = 'Schedule IC meeting for Jamaica Tech Ventures') THEN
    INSERT INTO public.vc_tasks (
      id, tenant_id, entity_type, entity_id, assigned_to, title, description, status, priority, due_date, created_by
    ) VALUES (
      gen_random_uuid(), v_tenant_id, 'application', v_app_jamaica, v_analyst_id,
      'Schedule IC meeting for Jamaica Tech Ventures',
      'Coordinate investment committee calendar for Jamaica Tech Ventures.',
      'pending'::public.task_status, 'medium'::public.task_priority, (now() + interval '10 days')::date, v_admin_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vc_tasks WHERE tenant_id = v_tenant_id AND title = 'Review Q1 monitoring report for AgriTech') THEN
    INSERT INTO public.vc_tasks (
      id, tenant_id, entity_type, entity_id, assigned_to, title, description, status, priority, due_date, created_by
    ) VALUES (
      gen_random_uuid(), v_tenant_id, 'investment', v_inv_agri, v_officer_id,
      'Review Q1 monitoring report for AgriTech',
      'Read latest monitoring metrics and flag follow-ups.',
      'pending'::public.task_status, 'medium'::public.task_priority, (now() + interval '7 days')::date, v_admin_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vc_tasks WHERE tenant_id = v_tenant_id AND title = 'Upload legal documents for SME Impact Fund III') THEN
    INSERT INTO public.vc_tasks (
      id, tenant_id, entity_type, entity_id, assigned_to, title, description, status, priority, due_date, created_by, completed_at
    ) VALUES (
      gen_random_uuid(), v_tenant_id, 'application', v_app_sme, v_analyst_id,
      'Upload legal documents for SME Impact Fund III',
      'Attach final legal pack to the application record.',
      'completed'::public.task_status, 'low'::public.task_priority, (now() - interval '3 days')::date, v_admin_id, now() - interval '1 day'
    );
  END IF;

END $$;

COMMIT;

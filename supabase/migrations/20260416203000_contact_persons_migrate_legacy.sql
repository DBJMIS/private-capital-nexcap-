-- =============================================================================
-- Contact persons: consolidate legacy basic_info fields into one JSON answer
-- =============================================================================
-- vc_dd_answers already exists (question_key + answer_json). This migration:
-- 1) Reads legacy rows contact_1_* / contact_2_* per basic_info section
-- 2) Deletes those legacy question_key rows
-- 3) Inserts question_key = 'contact_persons' with a JSON array of two objects
--    { id, name, email, phone } when no contact_persons row exists yet
-- =============================================================================

BEGIN;

DO $$
DECLARE
  rec RECORD;
  j jsonb;
  c1n text;
  c1e text;
  c1p text;
  c2n text;
  c2e text;
  c2p text;
BEGIN
  FOR rec IN
    SELECT s.id AS section_id, s.tenant_id
    FROM public.vc_dd_sections s
    WHERE s.section_key = 'basic_info'::public.dd_section_key
  LOOP
    SELECT
      max(a.answer_text) FILTER (WHERE a.question_key = 'contact_1_name'),
      max(a.answer_text) FILTER (WHERE a.question_key = 'contact_1_email'),
      max(a.answer_text) FILTER (WHERE a.question_key = 'contact_1_phone'),
      max(a.answer_text) FILTER (WHERE a.question_key = 'contact_2_name'),
      max(a.answer_text) FILTER (WHERE a.question_key = 'contact_2_email'),
      max(a.answer_text) FILTER (WHERE a.question_key = 'contact_2_phone')
    INTO c1n, c1e, c1p, c2n, c2e, c2p
    FROM public.vc_dd_answers a
    WHERE a.section_id = rec.section_id
      AND a.tenant_id = rec.tenant_id;

    DELETE FROM public.vc_dd_answers a
    WHERE a.section_id = rec.section_id
      AND a.question_key IN (
        'contact_1_name',
        'contact_1_email',
        'contact_1_phone',
        'contact_2_name',
        'contact_2_email',
        'contact_2_phone'
      );

    IF NOT EXISTS (
      SELECT 1
      FROM public.vc_dd_answers a2
      WHERE a2.section_id = rec.section_id
        AND a2.question_key = 'contact_persons'
    ) THEN
      j := jsonb_build_array(
        jsonb_build_object(
          'id',
          gen_random_uuid()::text,
          'name',
          coalesce(nullif(trim(c1n), ''), ''),
          'email',
          coalesce(nullif(trim(c1e), ''), ''),
          'phone',
          coalesce(nullif(trim(c1p), ''), '')
        ),
        jsonb_build_object(
          'id',
          gen_random_uuid()::text,
          'name',
          coalesce(nullif(trim(c2n), ''), ''),
          'email',
          coalesce(nullif(trim(c2e), ''), ''),
          'phone',
          coalesce(nullif(trim(c2p), ''), '')
        )
      );

      INSERT INTO public.vc_dd_answers (
        id,
        tenant_id,
        section_id,
        question_key,
        answer_text,
        answer_value,
        answer_boolean,
        answer_json
      )
      VALUES (
        gen_random_uuid(),
        rec.tenant_id,
        rec.section_id,
        'contact_persons',
        NULL,
        NULL,
        NULL,
        j
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

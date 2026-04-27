-- DD documents: tagging + Supabase Storage bucket for questionnaire uploads
BEGIN;

ALTER TABLE public.vc_dd_documents
  ADD COLUMN IF NOT EXISTS tag varchar(128),
  ADD COLUMN IF NOT EXISTS question_key varchar(200),
  ADD COLUMN IF NOT EXISTS staff_bio_id uuid REFERENCES public.vc_dd_staff_bios (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vc_dd_documents.tag IS
  'Logical slot e.g. org_chart, financial_statements, legal_doc, staff_cv';
COMMENT ON COLUMN public.vc_dd_documents.question_key IS
  'Optional link to questions-config key when upload is per-question';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dd-documents',
  'dd-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS dd_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS dd_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS dd_documents_storage_update ON storage.objects;
DROP POLICY IF EXISTS dd_documents_storage_delete ON storage.objects;

-- Path convention: {tenant_id}/{questionnaire_id}/{object_name}
CREATE POLICY dd_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dd-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
  );

CREATE POLICY dd_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dd-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
    AND (SELECT public.get_my_tenant_id()) IS NOT NULL
  );

CREATE POLICY dd_documents_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dd-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
  );

CREATE POLICY dd_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dd-documents'
    AND split_part(name, '/', 1) = (SELECT public.get_my_tenant_id())::text
  );

COMMIT;

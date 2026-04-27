-- Support staff: optional link to staff bio + department (Section II modal).
-- File: supabase/migrations/20260417153000_vc_dd_support_staff_bio_department.sql

ALTER TABLE public.vc_dd_support_staff
  ADD COLUMN IF NOT EXISTS bio_id uuid REFERENCES public.vc_dd_staff_bios (id) ON DELETE SET NULL;

ALTER TABLE public.vc_dd_support_staff
  ADD COLUMN IF NOT EXISTS department text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vc_dd_support_staff_department_chk'
  ) THEN
    ALTER TABLE public.vc_dd_support_staff
      ADD CONSTRAINT vc_dd_support_staff_department_chk
      CHECK (
        department IS NULL
        OR department IN ('legal', 'accounting', 'it', 'admin', 'other')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.vc_dd_support_staff.bio_id IS
  'Optional link to vc_dd_staff_bios when bio is collected via sponsor modal.';
COMMENT ON COLUMN public.vc_dd_support_staff.department IS
  'legal | accounting | it | admin | other';

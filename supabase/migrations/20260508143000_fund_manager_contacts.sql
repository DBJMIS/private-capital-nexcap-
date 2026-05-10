-- Fund manager contacts table
-- Stores all people associated with a
-- fund manager firm, tracks portal access
BEGIN;

create table if not exists public.fund_manager_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vc_tenants(id) on delete cascade,
  fund_manager_id uuid not null references public.fund_managers(id) on delete cascade,
  full_name text not null,
  email text not null,
  title text default null,
  is_primary boolean default false,
  portal_user_id uuid default null references auth.users(id) on delete set null,
  portal_access boolean default false,
  invited_at timestamptz default null,
  invitation_id uuid default null references public.vc_invitations(id) on delete set null,
  last_login_at timestamptz default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid default null references auth.users(id) on delete set null
);

-- Unique email per fund manager firm
-- per tenant
create unique index if not exists fund_manager_contacts_email_firm_idx
  on public.fund_manager_contacts(tenant_id, fund_manager_id, email);

-- Index for portal user lookup
create index if not exists fund_manager_contacts_portal_user_idx
  on public.fund_manager_contacts(portal_user_id)
  where portal_user_id is not null;

-- RLS
alter table public.fund_manager_contacts
  enable row level security;

-- DBJ staff can read all contacts
-- for their tenant
drop policy if exists "fmc_select_staff" on public.fund_manager_contacts;
create policy "fmc_select_staff"
  on public.fund_manager_contacts
  for select to authenticated
  using (tenant_id = (
    select tenant_id from public.vc_profiles
    where user_id = auth.uid()
    limit 1
  ));

-- DBJ staff can insert contacts
drop policy if exists "fmc_insert_staff" on public.fund_manager_contacts;
create policy "fmc_insert_staff"
  on public.fund_manager_contacts
  for insert to authenticated
  with check (tenant_id = (
    select tenant_id from public.vc_profiles
    where user_id = auth.uid()
    limit 1
  ));

-- DBJ staff can update contacts
drop policy if exists "fmc_update_staff" on public.fund_manager_contacts;
create policy "fmc_update_staff"
  on public.fund_manager_contacts
  for update to authenticated
  using (tenant_id = (
    select tenant_id from public.vc_profiles
    where user_id = auth.uid()
    limit 1
  ));

-- Portal users can read their own
-- contact record
drop policy if exists "fmc_select_portal_user" on public.fund_manager_contacts;
create policy "fmc_select_portal_user"
  on public.fund_manager_contacts
  for select to authenticated
  using (portal_user_id = auth.uid());

-- Also link fund applications to
-- fund_manager_id for multi-fund support
-- Add fund_manager_id to applications
-- if not already there
alter table public.vc_fund_applications
  add column if not exists fund_manager_id uuid default null
  references public.fund_managers(id)
  on delete set null;

create index if not exists vfa_fund_manager_id_idx
  on public.vc_fund_applications(fund_manager_id)
  where fund_manager_id is not null;

COMMIT;

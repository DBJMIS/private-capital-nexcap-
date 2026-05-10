export type ContactWithFirm = {
  id: string;
  full_name: string;
  email: string;
  title: string | null;
  is_primary: boolean;
  invited_at: string | null;
  last_login_at: string | null;
  fund_manager_id: string | null;
  fund_managers: {
    id: string;
    firm_name: string | null;
    name: string;
  } | null;
};

export type PortalProfileApplication = {
  id: string;
  fund_name: string;
  status: string;
  submitted_at: string | null;
};

export type PortalProfileClientProps = {
  tenantName: string;
  contact: ContactWithFirm | null;
  profile: { full_name: string; email: string; created_at: string } | null;
  sessionUser: { name: string; email: string; full_name: string };
  applications: PortalProfileApplication[];
};

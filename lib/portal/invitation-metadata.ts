/**
 * Parsed metadata on vc_invitations rows for portal flows.
 */

export type PortalInviteMetadata = {
  application_id?: string;
  portfolio_fund_id?: string;
  fund_name?: string;
  fund_manager_id?: string;
  contact_id?: string;
  profile_id?: string;
};

export function parsePortalInviteMetadata(raw: unknown): PortalInviteMetadata {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  return {
    application_id: typeof o.application_id === 'string' ? o.application_id : undefined,
    portfolio_fund_id: typeof o.portfolio_fund_id === 'string' ? o.portfolio_fund_id : undefined,
    fund_name: typeof o.fund_name === 'string' ? o.fund_name : undefined,
    fund_manager_id: typeof o.fund_manager_id === 'string' ? o.fund_manager_id : undefined,
    contact_id: typeof o.contact_id === 'string' ? o.contact_id : undefined,
    profile_id: typeof o.profile_id === 'string' ? o.profile_id : undefined,
  };
}

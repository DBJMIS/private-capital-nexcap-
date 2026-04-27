export function landingPathForInviteRole(role: string): string {
  switch (role) {
    case 'pctu_officer':
      return '/portfolio';
    case 'investment_officer':
      return '/dashboard';
    case 'portfolio_manager':
      return '/portfolio';
    case 'panel_member':
      return '/assessments';
    case 'it_admin':
      return '/settings/users';
    case 'senior_management':
      return '/portfolio/executive';
    default:
      return '/dashboard';
  }
}

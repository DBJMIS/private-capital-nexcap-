/**
 * Microsoft Graph / Teams — stub for future integration.
 * No real API calls; configure env and permissions before enabling.
 */

export interface TeamsMeeting {
  meeting_id: string;
  join_url: string;
  subject: string;
  start_datetime: string;
  end_datetime: string;
}

export interface GraphConfig {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  organizer_user_id: string;
}

// TODO: TEAMS INTEGRATION
// Requires Azure AD app permissions:
// - Calendars.ReadWrite
// - OnlineMeetings.ReadWrite
// - Mail.Send
// Additional env var needed: TEAMS_ORGANIZER_USER_ID
export async function createTeamsMeeting(
  _config: GraphConfig,
  _subject: string,
  _startDatetime: string,
  _durationMinutes: number,
  _attendeeEmails: string[],
): Promise<TeamsMeeting> {
  throw new Error(
    'Teams integration not yet active. ' +
      'Configure TEAMS_ORGANIZER_USER_ID and ' +
      'required Graph API permissions to enable.',
  );
}

// TODO: TEAMS INTEGRATION
export async function getMeetingRecording(_config: GraphConfig, _meetingId: string): Promise<string | null> {
  throw new Error('Teams integration not yet active.');
}

// TODO: TEAMS INTEGRATION
export async function sendCalendarInvite(
  _config: GraphConfig,
  _to: string[],
  _subject: string,
  _body: string,
  _meetingUrl: string,
  _startDatetime: string,
): Promise<void> {
  throw new Error('Teams integration not yet active.');
}

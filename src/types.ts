export interface WeeklySchedule {
  /** 0 = Sunday .. 6 = Saturday */
  dayOfWeek: number;
  /** Hour of day in `timezone`, 0-23 */
  hour: number;
  /** Minute of hour in `timezone`, 0-59 */
  minute: number;
  /** IANA timezone name, e.g. "Europe/Copenhagen" */
  timezone: string;
}

export type Faction = 'horde' | 'alliance';

export interface EventTemplate {
  id: string;
  guildId: string;
  channelId: string;
  title: string;
  description?: string;
  faction: Faction;
  roles: string[];
  schedule: WeeklySchedule;
  nextFireAt: string;
  createdBy: string;
  createdAt: string;
}

export type EventInstanceStatus = 'posted' | 'closed';

export interface EventInstance {
  id: string;
  templateId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  description?: string;
  faction: Faction;
  roles: string[];
  scheduledFor: string;
  postedAt: string;
  status: EventInstanceStatus;
}

export interface Signup {
  id: string;
  eventInstanceId: string;
  discordUserId: string;
  discordUsername: string;
  role: string;
  className: string;
  spec: string;
  characterName: string;
  note?: string;
  douses?: number;
  signedUpAt: string;
}

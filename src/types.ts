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
  /**
   * Whether the weekly post still goes out. Absent means yes: every template
   * written before this flag existed keeps posting.
   */
  enabled?: boolean;
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
  /** Their nickname on this Discord server, falling back to global name. */
  discordNickname?: string;
  role: string;
  className: string;
  spec: string;
  characterName: string;
  note?: string;
  douses?: number;
  signedUpAt: string;
}

/** One name on the raid roster, as the website's roster builder holds it. */
export interface RosterPlayer {
  characterName: string;
  className: string;
  spec?: string;
}

/** Eight groups of five, empty seats included. */
export type RosterGroups = (RosterPlayer | null)[][];

/** Match key of a character => what they answered on the roster post. */
export type RosterState = Record<string, 'confirmed' | 'cancelled'>;

/** A roster posted to Discord, and the answers it has collected. */
export interface PostedRoster {
  /** The signup event this roster belongs to, so its buttons reach the signup. */
  instanceId: string;
  channelId: string;
  messageId: string;
  groups: RosterGroups;
  confirmations: RosterState;
  postedAt: string;
}

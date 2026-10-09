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
  /**
   * The raid the website files each post under, 'naxxramas' or 'world_tour'.
   * Absent on templates made from Discord before the website could set it;
   * the website then reads it off the title.
   */
  raidType?: string;
  /**
   * The weekly moment the signup for the next raid goes up, in the schedule's
   * own timezone: the last time this day and time comes round before the
   * raid. "Wednesday 20:30" for a Wednesday 19:30 raid posts next week's
   * signup an hour after this week's raid starts. Absent means the signup is
   * posted at the raid's own time, which is how every template before this
   * field behaved.
   */
  postAt?: Pick<WeeklySchedule, 'dayOfWeek' | 'hour' | 'minute'>;
  /** When the next raid starts; the post for it goes up at `postAt`. */
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
  /**
   * When they first signed up for this event. Set once and never moved: the
   * signup numbers are counted off it, and editing a signup, signing off or
   * coming back must not send somebody to the back of the list.
   */
  signedUpAt: string;
}

/** One thing somebody did to their signup. Kept for good, never edited. */
export interface SignupLogEntry {
  eventInstanceId: string;
  discordUserId: string;
  discordName?: string;
  characterName: string;
  role: string;
  className: string;
  spec: string;
  action: 'signed_up' | 'changed' | 'signed_off' | 'signed_up_again' | 'removed';
  at: string;
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

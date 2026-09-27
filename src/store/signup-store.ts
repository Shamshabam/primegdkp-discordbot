import type { EventInstance, EventTemplate, Signup, PostedRoster } from '../types.js';

/**
 * Everything the bot needs to persist. The JSON file implementation lets the
 * bot run standalone; swapping in an API-backed implementation later (once
 * the website exists) points the same bot logic at the Laravel backend
 * instead, with no changes to commands/handlers/scheduler.
 */
export interface SignupStore {
  createTemplate(template: Omit<EventTemplate, 'id' | 'createdAt'>): Promise<EventTemplate>;
  listTemplates(guildId: string): Promise<EventTemplate[]>;
  getTemplate(id: string): Promise<EventTemplate | undefined>;
  updateTemplate(id: string, patch: Partial<EventTemplate>): Promise<void>;
  deleteTemplate(id: string): Promise<boolean>;

  /** Caller supplies `id` (generated before the Discord message is sent, so button custom_ids can reference it). */
  createInstance(instance: EventInstance): Promise<EventInstance>;
  getInstance(id: string): Promise<EventInstance | undefined>;

  /** Change a posted event - its title, or when it starts - in place. */
  updateInstance(id: string, patch: Partial<EventInstance>): Promise<EventInstance | undefined>;
  deleteInstance(id: string): Promise<EventInstance | undefined>;

  /** Every event still taking signups, so their messages can be brought up to date. */
  listOpenInstances(): Promise<EventInstance[]>;

  /**
   * Every event posted to a guild, open or closed, with how many have signed
   * up to each. The calendar shows the lot rather than only what is still
   * taking signups.
   */
  listInstancesWithCounts(guildId: string): Promise<Array<{ instance: EventInstance; signups: number }>>;

  /** The roster posted for an event, if one has been. */
  getRoster(instanceId: string): Promise<PostedRoster | undefined>;

  /** Store the roster for an event, replacing any earlier one. */
  saveRoster(roster: PostedRoster): Promise<void>;

  /** Record an answer on the roster, and hand back the roster it changed. */
  setConfirmation(instanceId: string, characterKey: string, answer: 'confirmed' | 'cancelled'): Promise<PostedRoster | undefined>;

  upsertSignup(signup: Omit<Signup, 'id' | 'signedUpAt'>): Promise<Signup>;
  removeSignup(eventInstanceId: string, discordUserId: string): Promise<void>;
  listSignups(eventInstanceId: string): Promise<Signup[]>;
}

import type { EventInstance, EventTemplate, Signup } from '../types.js';

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
  deleteInstance(id: string): Promise<EventInstance | undefined>;

  upsertSignup(signup: Omit<Signup, 'id' | 'signedUpAt'>): Promise<Signup>;
  removeSignup(eventInstanceId: string, discordUserId: string): Promise<void>;
  listSignups(eventInstanceId: string): Promise<Signup[]>;
}

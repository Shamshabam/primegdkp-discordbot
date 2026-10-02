import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EventInstance, EventTemplate, PostedRoster, Signup, SignupLogEntry } from '../types.js';
import type { SignupStore } from './signup-store.js';

interface Data {
  templates: EventTemplate[];
  instances: EventInstance[];
  signups: Signup[];
  /** Optional: every file written before rosters existed has none. */
  rosters?: PostedRoster[];
  /**
   * Every sign-up, change and sign-off, in the order they happened. Only ever
   * added to - removing a signup does not remove its history - so who signed
   * when can always be worked out again. Absent in files written before it.
   */
  signupLog?: SignupLogEntry[];
}

const EMPTY: Data = { templates: [], instances: [], signups: [], rosters: [], signupLog: [] };

/**
 * What a save does to a signup that already exists, or null when it changes
 * nothing worth recording (the bot filling in a nickname, say).
 */
function whatChanged(before: Signup, after: Omit<Signup, 'id' | 'signedUpAt'>): SignupLogEntry['action'] | null {
  if (after.role === 'Absence' && before.role !== 'Absence') return 'signed_off';
  if (before.role === 'Absence' && after.role !== 'Absence') return 'signed_up_again';

  const same = before.role === after.role
    && before.className === after.className
    && before.spec === after.spec
    && before.characterName === after.characterName;

  return same ? null : 'changed';
}

function logSignup(data: Data, signup: Signup, action: SignupLogEntry['action'], at: string): void {
  data.signupLog ??= [];
  data.signupLog.push({
    eventInstanceId: signup.eventInstanceId,
    discordUserId: signup.discordUserId,
    discordName: signup.discordNickname ?? signup.discordUsername,
    characterName: signup.characterName,
    role: signup.role,
    className: signup.className,
    spec: signup.spec,
    action,
    at,
  });
}

/**
 * File-backed SignupStore. Writes are serialized through `queue` so
 * concurrent Discord interactions can't interleave read-modify-write cycles
 * and corrupt the file.
 */
export class JsonFileStore implements SignupStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async read(): Promise<Data> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as Data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY);
      throw error;
    }
  }

  private async write(data: Data): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private mutate<T>(fn: (data: Data) => Promise<{ data: Data; result: T }>): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const { data: next, result } = await fn(data);
      await this.write(next);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  createTemplate(template: Omit<EventTemplate, 'id' | 'createdAt'>): Promise<EventTemplate> {
    return this.mutate(async (data) => {
      const created: EventTemplate = { ...template, id: randomUUID(), createdAt: new Date().toISOString() };
      data.templates.push(created);
      return { data, result: created };
    });
  }

  async listTemplates(guildId: string): Promise<EventTemplate[]> {
    const data = await this.read();
    return data.templates.filter((t) => t.guildId === guildId);
  }

  async getTemplate(id: string): Promise<EventTemplate | undefined> {
    const data = await this.read();
    return data.templates.find((t) => t.id === id);
  }

  updateTemplate(id: string, patch: Partial<EventTemplate>): Promise<void> {
    return this.mutate(async (data) => {
      const template = data.templates.find((t) => t.id === id);
      if (template) Object.assign(template, patch);
      return { data, result: undefined };
    });
  }

  deleteTemplate(id: string): Promise<boolean> {
    return this.mutate(async (data) => {
      const before = data.templates.length;
      data.templates = data.templates.filter((t) => t.id !== id);
      return { data, result: data.templates.length < before };
    });
  }

  createInstance(instance: EventInstance): Promise<EventInstance> {
    return this.mutate(async (data) => {
      data.instances.push(instance);
      return { data, result: instance };
    });
  }

  async getInstance(id: string): Promise<EventInstance | undefined> {
    const data = await this.read();
    return data.instances.find((i) => i.id === id);
  }

  updateInstance(id: string, patch: Partial<EventInstance>): Promise<EventInstance | undefined> {
    return this.mutate(async (data) => {
      const instance = data.instances.find((i) => i.id === id);
      if (!instance) return { data, result: undefined };
      // id, channel and message identify the post - patching those would point
      // the record at a message it does not belong to.
      const { id: _id, channelId: _channelId, messageId: _messageId, ...rest } = patch;
      Object.assign(instance, rest);
      return { data, result: instance };
    });
  }

  deleteInstance(id: string): Promise<EventInstance | undefined> {
    return this.mutate(async (data) => {
      const instance = data.instances.find((i) => i.id === id);
      if (!instance) return { data, result: undefined };
      data.instances = data.instances.filter((i) => i.id !== id);
      data.signups = data.signups.filter((s) => s.eventInstanceId !== id);
      return { data, result: instance };
    });
  }

  async listOpenInstances(): Promise<EventInstance[]> {
    const data = await this.read();
    return data.instances.filter((i) => i.status !== 'closed');
  }

  async getRoster(instanceId: string): Promise<PostedRoster | undefined> {
    const data = await this.read();
    return (data.rosters ?? []).find((r) => r.instanceId === instanceId);
  }

  saveRoster(roster: PostedRoster): Promise<void> {
    return this.mutate(async (data) => {
      const rosters = data.rosters ?? [];
      const existing = rosters.find((r) => r.instanceId === roster.instanceId);

      if (existing) {
        // The answers people have already given survive a re-push of the
        // roster: the raid leader moving somebody between groups is not
        // them un-confirming.
        Object.assign(existing, roster, { confirmations: { ...existing.confirmations, ...roster.confirmations } });
      } else {
        rosters.push(roster);
      }

      data.rosters = rosters;
      return { data, result: undefined };
    });
  }

  setConfirmation(instanceId: string, characterKey: string, answer: 'confirmed' | 'cancelled'): Promise<PostedRoster | undefined> {
    return this.mutate(async (data) => {
      const roster = (data.rosters ?? []).find((r) => r.instanceId === instanceId);

      if (roster) {
        roster.confirmations[characterKey] = answer;
      }

      return { data, result: roster };
    });
  }

  setDouses(eventInstanceId: string, discordUserId: string, douses: number): Promise<Signup | undefined> {
    return this.mutate(async (data) => {
      const existing = data.signups.find(
        (s) => s.eventInstanceId === eventInstanceId && s.discordUserId === discordUserId,
      );

      if (existing) {
        existing.douses = douses;
      }

      return { data, result: existing };
    });
  }

  upsertSignup(signup: Omit<Signup, 'id' | 'signedUpAt'>): Promise<Signup> {
    return this.mutate(async (data) => {
      const now = new Date().toISOString();
      const existing = data.signups.find(
        (s) => s.eventInstanceId === signup.eventInstanceId && s.discordUserId === signup.discordUserId,
      );

      if (existing) {
        const action = whatChanged(existing, signup);

        existing.role = signup.role;
        existing.className = signup.className;
        existing.spec = signup.spec;
        existing.characterName = signup.characterName;
        existing.note = signup.note;
        existing.douses = signup.douses;
        existing.discordUsername = signup.discordUsername;
        // Kept when the save does not carry one, so a later save cannot
        // blank it - and written when it does. It used to be dropped here,
        // so the nickname fill-in re-saved the same people on every redraw.
        existing.discordNickname = signup.discordNickname ?? existing.discordNickname;
        // signedUpAt is left alone. It used to be reset on every save, so
        // editing a signup, signing off, or the bot filling in a nickname
        // sent the person to the back of the signup numbers.

        if (action) {
          logSignup(data, existing, action, now);
        }

        return { data, result: existing };
      }

      const created: Signup = { ...signup, id: randomUUID(), signedUpAt: now };
      data.signups.push(created);
      logSignup(data, created, created.role === 'Absence' ? 'signed_off' : 'signed_up', now);
      return { data, result: created };
    });
  }

  removeSignup(eventInstanceId: string, discordUserId: string): Promise<void> {
    return this.mutate(async (data) => {
      const now = new Date().toISOString();

      for (const signup of data.signups) {
        if (signup.eventInstanceId === eventInstanceId && signup.discordUserId === discordUserId) {
          logSignup(data, signup, 'removed', now);
        }
      }

      data.signups = data.signups.filter(
        (s) => !(s.eventInstanceId === eventInstanceId && s.discordUserId === discordUserId),
      );
      return { data, result: undefined };
    });
  }

  async listSignupLog(eventInstanceId: string): Promise<SignupLogEntry[]> {
    const data = await this.read();

    return (data.signupLog ?? []).filter((entry) => entry.eventInstanceId === eventInstanceId);
  }

  async listInstancesWithCounts(guildId: string): Promise<Array<{ instance: EventInstance; signups: number }>> {
    const data = await this.read();

    const counts = new Map<string, number>();

    for (const signup of data.signups) {
      counts.set(signup.eventInstanceId, (counts.get(signup.eventInstanceId) ?? 0) + 1);
    }

    return data.instances
      .filter((instance) => instance.guildId === guildId)
      .map((instance) => ({ instance, signups: counts.get(instance.id) ?? 0 }));
  }

  async listSignups(eventInstanceId: string): Promise<Signup[]> {
    const data = await this.read();
    return data.signups.filter((s) => s.eventInstanceId === eventInstanceId);
  }
}

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { EventInstance, EventTemplate, Signup } from '../types.js';
import type { SignupStore } from './signup-store.js';

interface Data {
  templates: EventTemplate[];
  instances: EventInstance[];
  signups: Signup[];
}

const EMPTY: Data = { templates: [], instances: [], signups: [] };

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

  deleteInstance(id: string): Promise<EventInstance | undefined> {
    return this.mutate(async (data) => {
      const instance = data.instances.find((i) => i.id === id);
      if (!instance) return { data, result: undefined };
      data.instances = data.instances.filter((i) => i.id !== id);
      data.signups = data.signups.filter((s) => s.eventInstanceId !== id);
      return { data, result: instance };
    });
  }

  upsertSignup(signup: Omit<Signup, 'id' | 'signedUpAt'>): Promise<Signup> {
    return this.mutate(async (data) => {
      const existing = data.signups.find(
        (s) => s.eventInstanceId === signup.eventInstanceId && s.discordUserId === signup.discordUserId,
      );

      if (existing) {
        existing.role = signup.role;
        existing.className = signup.className;
        existing.spec = signup.spec;
        existing.characterName = signup.characterName;
        existing.note = signup.note;
        existing.douses = signup.douses;
        existing.discordUsername = signup.discordUsername;
        existing.signedUpAt = new Date().toISOString();
        return { data, result: existing };
      }

      const created: Signup = { ...signup, id: randomUUID(), signedUpAt: new Date().toISOString() };
      data.signups.push(created);
      return { data, result: created };
    });
  }

  removeSignup(eventInstanceId: string, discordUserId: string): Promise<void> {
    return this.mutate(async (data) => {
      data.signups = data.signups.filter(
        (s) => !(s.eventInstanceId === eventInstanceId && s.discordUserId === discordUserId),
      );
      return { data, result: undefined };
    });
  }

  async listSignups(eventInstanceId: string): Promise<Signup[]> {
    const data = await this.read();
    return data.signups.filter((s) => s.eventInstanceId === eventInstanceId);
  }
}

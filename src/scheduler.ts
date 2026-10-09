import { randomUUID } from 'node:crypto';
import { ChannelType, type Client } from 'discord.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import { nextOccurrence } from './schedule/next-occurrence.js';
import type { SignupStore } from './store/signup-store.js';
import type { EventInstance, EventTemplate } from './types.js';

const CHECK_INTERVAL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How long after a raid's start its signup may still go up. A template with no
 * lead posts at the raid's own time, so the start itself cannot mean "too
 * late"; a bot that was down for a day should not post for last night either.
 */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Polls every minute for templates whose signup is due and posts a fresh signup message for each. */
export function startScheduler(client: Client, store: SignupStore): NodeJS.Timeout {
  const tick = () => checkAndPost(client, store).catch((error) => console.error('Scheduler tick failed:', error));
  tick();
  return setInterval(tick, CHECK_INTERVAL_MS);
}

/** When the signup for the template's next raid goes up. */
export function postTimeOf(template: Pick<EventTemplate, 'nextFireAt' | 'postDaysBefore'>): Date {
  return new Date(new Date(template.nextFireAt).getTime() - (template.postDaysBefore ?? 0) * DAY_MS);
}

/**
 * What to do with a template on a tick: post the signup for its next raid,
 * roll past a raid that is already over, or leave it alone until it is due.
 *
 * A raid whose start has already gone by is not posted - the bot may have
 * been down, and nobody wants a signup for last Wednesday - it just rolls
 * forward to the week after. One that is due is posted once: a second tick
 * within the same window, or a lead time shortened after the post went up,
 * finds the instance already there and does nothing.
 */
export function decide(
  template: EventTemplate,
  now: Date,
  posted: Pick<EventInstance, 'templateId' | 'scheduledFor'>[],
): 'wait' | 'post' | 'skip' {
  const raidAt = new Date(template.nextFireAt);

  if (raidAt.getTime() + STALE_AFTER_MS <= now.getTime()) return 'skip';
  if (postTimeOf(template).getTime() > now.getTime()) return 'wait';
  if (template.enabled === false) return 'wait';
  if (posted.some((i) => i.templateId === template.id && i.scheduledFor === template.nextFireAt)) return 'wait';

  return 'post';
}

async function checkAndPost(client: Client, store: SignupStore): Promise<void> {
  const now = new Date();
  const open = await store.listOpenInstances();

  for (const guild of client.guilds.cache.values()) {
    const templates = await store.listTemplates(guild.id);

    for (const template of templates) {
      const action = decide(template, now, open);

      if (action === 'post') {
        try {
          await postInstance(client, store, template);
        } catch (error) {
          console.error(`Failed to post recurring event ${template.id}:`, error);
        }
      } else if (action === 'skip') {
        // The raid is over; the next one is a week on, whether or not the
        // template is switched on. A template switched off keeps rolling so
        // switching it back on does not fire every missed week at once.
        const next = nextOccurrence(template.schedule, new Date(template.nextFireAt));
        await store.updateTemplate(template.id, { nextFireAt: next.toISOString() });
      }
    }
  }
}

/** Posts the signup for the template's next raid and records the instance. */
export async function postInstance(client: Client, store: SignupStore, template: EventTemplate): Promise<EventInstance> {
  const channel = await client.channels.fetch(template.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${template.channelId} is not a postable text channel`);
  }

  const instanceId = randomUUID();
  const draft: EventInstance = {
    id: instanceId,
    templateId: template.id,
    guildId: template.guildId,
    channelId: template.channelId,
    messageId: '',
    title: template.title,
    description: template.description,
    faction: template.faction,
    roles: template.roles,
    scheduledFor: template.nextFireAt,
    postedAt: new Date().toISOString(),
    status: 'posted' as const,
  };

  const message = await channel.send({
    embeds: [buildSignupEmbed(draft, [])],
    components: [buildSignupButtons(instanceId, false)],
  });

  return store.createInstance({ ...draft, messageId: message.id });
}

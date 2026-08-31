import { randomUUID } from 'node:crypto';
import { ChannelType, type Client } from 'discord.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import { nextOccurrence } from './schedule/next-occurrence.js';
import type { SignupStore } from './store/signup-store.js';
import type { EventTemplate } from './types.js';

const CHECK_INTERVAL_MS = 60_000;

/** Polls every minute for templates whose `nextFireAt` has passed and posts a fresh signup message for each. */
export function startScheduler(client: Client, store: SignupStore): NodeJS.Timeout {
  const tick = () => checkAndPost(client, store).catch((error) => console.error('Scheduler tick failed:', error));
  tick();
  return setInterval(tick, CHECK_INTERVAL_MS);
}

async function checkAndPost(client: Client, store: SignupStore): Promise<void> {
  const now = new Date();

  for (const guild of client.guilds.cache.values()) {
    const templates = await store.listTemplates(guild.id);

    for (const template of templates) {
      if (new Date(template.nextFireAt) > now) continue;

      try {
        await postInstance(client, store, template);
      } catch (error) {
        console.error(`Failed to post recurring event ${template.id}:`, error);
      }

      const next = nextOccurrence(template.schedule, now);
      await store.updateTemplate(template.id, { nextFireAt: next.toISOString() });
    }
  }
}

async function postInstance(client: Client, store: SignupStore, template: EventTemplate): Promise<void> {
  const channel = await client.channels.fetch(template.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${template.channelId} is not a postable text channel`);
  }

  const instanceId = randomUUID();
  const draft = {
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

  await store.createInstance({ ...draft, messageId: message.id });
}

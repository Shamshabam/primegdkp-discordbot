import type { Client } from 'discord.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import type { SignupStore } from './store/signup-store.js';

/**
 * Bring every open signup message up to date with how the bot renders today.
 *
 * A posted embed is drawn from the stored signups each time it is edited, so a
 * change to the layout reaches the old posts as soon as anything touches them -
 * but nothing touches an embed between signups, and Wednesday's raid should not
 * have to wait for the next person to sign up to look like the new ones. Run at
 * startup, so a deploy is what brings them into line.
 *
 * One bad message - deleted, or in a channel the bot has lost - must not stop
 * the rest, so each is tried on its own.
 */
export async function refreshOpenSignups(client: Client, store: SignupStore): Promise<void> {
  const instances = await store.listOpenInstances();

  for (const instance of instances) {
    try {
      await refreshSignupMessage(client, store, instance.id);
    } catch (error) {
      console.error(`Could not refresh signup message for ${instance.id}:`, error);
    }
  }
}

/** Re-renders and edits the live signup message after a roster change. */
export async function refreshSignupMessage(client: Client, store: SignupStore, instanceId: string): Promise<void> {
  const instance = await store.getInstance(instanceId);
  if (!instance) return;

  const signups = await store.listSignups(instanceId);
  const channel = await client.channels.fetch(instance.channelId);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(instance.messageId);
  await message.edit({
    embeds: [buildSignupEmbed(instance, signups)],
    components: [buildSignupButtons(instance.id, instance.status === 'closed')],
  });
}

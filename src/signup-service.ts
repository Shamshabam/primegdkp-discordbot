import type { Client } from 'discord.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import type { SignupStore } from './store/signup-store.js';

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

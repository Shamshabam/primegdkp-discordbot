import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js';
import { drawRoster } from './roster.js';
import type { SignupStore } from './store/signup-store.js';
import type { PostedRoster } from './types.js';

/**
 * The buttons under a posted roster.
 *
 * Sign up is the same button the signup message carries, so somebody looking at
 * the roster does not have to scroll back up the channel to find it.
 */
export function buildRosterButtons(instanceId: string, closed: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`signup:${instanceId}`)
      .setLabel('Sign up')
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`confirm:${instanceId}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cancelsignup:${instanceId}`)
      .setLabel('Cancel signup')
      .setStyle(ButtonStyle.Danger),
  );
}

/** The roster drawn as it stands, ready to attach. */
export function rosterAttachment(roster: PostedRoster): AttachmentBuilder {
  return new AttachmentBuilder(drawRoster(roster.groups, roster.confirmations), { name: 'roster.png' });
}

/**
 * Redraw the posted roster and edit the message in place.
 *
 * Called after every button press, so the boxes fill in as people answer
 * rather than waiting for somebody to push the roster again from the website.
 */
export async function refreshRosterMessage(
  client: Client,
  store: SignupStore,
  instanceId: string,
): Promise<void> {
  const roster = await store.getRoster(instanceId);
  if (!roster) return;

  const instance = await store.getInstance(instanceId);
  const channel = await client.channels.fetch(roster.channelId);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(roster.messageId);

  await message.edit({
    files: [rosterAttachment(roster)],
    components: [buildRosterButtons(instanceId, instance?.status === 'closed')],
  });
}

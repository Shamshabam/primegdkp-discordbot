import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import { extractErrorMessage } from '../error.js';
import { refreshSignupMessage } from '../signup-service.js';
import type { SignupStore } from '../store/signup-store.js';
import { findClass } from '../wow-classes.js';

interface PendingSignup {
  instanceId: string;
  role: string;
  className: string;
  spec: string;
  characterName: string;
  note?: string;
}

const pendingDouse = new Map<string, PendingSignup>();

export function getPendingDouse(key: string): PendingSignup | undefined {
  const pending = pendingDouse.get(key);
  if (pending) pendingDouse.delete(key);
  return pending;
}

function isWorldTour(title: string): boolean {
  return title.toLowerCase().includes('world tour');
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction, store: SignupStore): Promise<void> {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'charname') return;

  // custom_id = charname:{instanceId}:{role}:{className}:{spec}
  const [, instanceId, role, className, spec] = parts;
  const characterName = interaction.fields.getTextInputValue('character_name').trim();
  let note: string | undefined;
  try {
    note = interaction.fields.getTextInputValue('signup_note')?.trim() || undefined;
  } catch {
    // note field may not exist on older modals
  }

  try {
    const instance = await store.getInstance(instanceId);
    if (instance && isWorldTour(instance.title)) {
      const key = `${instanceId}:${interaction.user.id}`;
      pendingDouse.set(key, { instanceId, role, className, spec, characterName, note });

      const select = new StringSelectMenuBuilder()
        .setCustomId(`douse:${instanceId}`)
        .setPlaceholder('Select your douse status')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Yes, one douse').setValue('1').setEmoji('🧪'),
          new StringSelectMenuOptionBuilder().setLabel('Yes, two douses').setValue('2').setEmoji('🧪'),
          new StringSelectMenuOptionBuilder().setLabel('No douse').setValue('0').setEmoji('❌'),
        );

      await interaction.reply({
        content: '**Do you have Douse?**',
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        ephemeral: true,
      });
      return;
    }

    await store.upsertSignup({
      eventInstanceId: instanceId,
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      role,
      className,
      spec,
      characterName,
      note,
    });

    await refreshSignupMessage(interaction.client, store, instanceId);

    const wowClass = findClass(className);
    await interaction.reply({
      content: `Signed up as **${wowClass?.emoji ?? ''} ${characterName}** (${className} - ${spec}, ${role}).`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({ content: extractErrorMessage(error), ephemeral: true });
  }
}

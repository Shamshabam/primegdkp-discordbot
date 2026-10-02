import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import { guildDisplayName } from '../discord-names.js';
import { extractErrorMessage } from '../error.js';
import { refreshSignupMessage } from '../signup-service.js';
import type { SignupStore } from '../store/signup-store.js';
import { findClass } from '../wow-classes.js';

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
    const worldTour = instance !== undefined && isWorldTour(instance.title);

    // On a world tour the douse question comes after this, and anybody who
    // closed it without answering used to not be signed up at all - the
    // signup was only saved once they picked. They are signed up here, as no
    // douses, and the answer only changes the count. Somebody editing a
    // signup they already answered keeps their answer until they pick again.
    let douses: number | undefined;

    if (worldTour) {
      const existing = (await store.listSignups(instanceId)).find((s) => s.discordUserId === interaction.user.id);
      douses = existing?.douses ?? 0;
    }

    await store.upsertSignup({
      eventInstanceId: instanceId,
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      discordNickname: guildDisplayName(interaction),
      role,
      className,
      spec,
      characterName,
      note,
      douses,
    });

    await refreshSignupMessage(interaction.client, store, instanceId);

    const wowClass = findClass(className);
    const signedUp = `Signed up as **${wowClass?.emoji ?? ''} ${characterName}** (${className} - ${spec}, ${role}).`;

    if (worldTour) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`douse:${instanceId}`)
        .setPlaceholder('Select your douse status')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Yes, one douse').setValue('1').setEmoji('🧪'),
          new StringSelectMenuOptionBuilder().setLabel('Yes, two douses').setValue('2').setEmoji('🧪'),
          new StringSelectMenuOptionBuilder().setLabel('No douse').setValue('0').setEmoji('❌'),
        );

      await interaction.reply({
        content: `${signedUp}\n**Do you have Douse?** Left unanswered, you are signed up with no douses.`,
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ content: signedUp, ephemeral: true });
  } catch (error) {
    await interaction.reply({ content: extractErrorMessage(error), ephemeral: true });
  }
}

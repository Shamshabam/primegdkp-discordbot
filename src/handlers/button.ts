import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from 'discord.js';
import { extractErrorMessage } from '../error.js';
import { key } from '../roster.js';
import { refreshRosterMessage } from '../roster-service.js';
import { refreshSignupMessage } from '../signup-service.js';
import type { SignupStore } from '../store/signup-store.js';

export async function handleButton(interaction: ButtonInteraction, store: SignupStore): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const instanceId = parts[1];

  try {
    const instance = await store.getInstance(instanceId);
    if (!instance) {
      await interaction.reply({ content: 'This event no longer exists.', ephemeral: true });
      return;
    }

    if (action === 'signup' || action === 'editsignup') {
      if (instance.status === 'closed') {
        await interaction.reply({ content: 'Signups are closed for this event.', ephemeral: true });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`role:${instanceId}:${instance.faction}`)
        .setPlaceholder('Choose your role')
        .addOptions(instance.roles.map((role) => new StringSelectMenuOptionBuilder().setLabel(role).setValue(role)));

      await interaction.reply({
        content: '**Step 1/4** — Pick your role:',
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'fillname') {
      const modal = new ModalBuilder()
        .setCustomId(`charname:${instanceId}:Fill:Fill:Fill`)
        .setTitle('Character Name');

      const nameInput = new TextInputBuilder()
        .setCustomId('character_name')
        .setLabel('Enter your character name')
        .setPlaceholder('e.g. Arthas')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(12)
        .setRequired(true);

      const noteInput = new TextInputBuilder()
        .setCustomId('signup_note')
        .setLabel('Note (required for Fill)')
        .setPlaceholder('e.g. Pala/Priest/Warrior, Can Tank, Can MC...')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
      );
      await interaction.showModal(modal);
      return;
    }

    if (action === 'confirm' || action === 'cancelsignup') {
      const answer = action === 'confirm' ? 'confirmed' : 'cancelled';
      const roster = await store.getRoster(instanceId);

      if (!roster) {
        await interaction.reply({ content: 'No roster has been posted for this raid yet.', ephemeral: true });
        return;
      }

      // Which row is theirs. The roster is typed by the raid leader and
      // the signup by the player, so the two spell the same character
      // differently often enough that an exact match is no use.
      const signups = await store.listSignups(instanceId);
      const mine = signups.find((s) => s.discordUserId === interaction.user.id);
      const names = new Set<string>();

      if (mine) {
        names.add(key(mine.characterName));
      }

      let matched: string | undefined;

      for (const group of roster.groups) {
        for (const player of group) {
          if (player && names.has(key(player.characterName))) {
            matched = key(player.characterName);
          }
        }
      }

      if (!matched) {
        await interaction.reply({
          content: mine
            ? `You are signed up as **${mine.characterName}**, but that character is not on this roster.`
            : 'You are not signed up for this raid, so there is no name on the roster to tick.',
          ephemeral: true,
        });
        return;
      }

      await store.setConfirmation(instanceId, matched, answer);
      await refreshRosterMessage(interaction.client, store, instanceId);

      await interaction.reply({
        content: answer === 'confirmed'
          ? 'Confirmed - you are ticked off on the roster.'
          : 'Marked as cancelled on the roster. Tell your raid leader if this was a mistake.',
        ephemeral: true,
      });
      return;
    }

    if (action === 'withdraw') {
      const existingSignups = await store.listSignups(instanceId);
      const existing = existingSignups.find((s) => s.discordUserId === interaction.user.id);

      if (!existing) {
        await interaction.reply({ content: 'You are not signed up for this event.', ephemeral: true });
        return;
      }

      await store.upsertSignup({
        eventInstanceId: instanceId,
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
        role: 'Absence',
        className: existing.className,
        spec: existing.spec,
        characterName: existing.characterName,
        note: existing.note,
      });

      await refreshSignupMessage(interaction.client, store, instanceId);
      await interaction.reply({ content: `You have been marked as absent for this event.`, ephemeral: true });
      return;
    }
  } catch (error) {
    await interaction.reply({ content: extractErrorMessage(error), ephemeral: true });
  }
}

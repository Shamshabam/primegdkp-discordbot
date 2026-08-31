import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
} from 'discord.js';
import { extractErrorMessage } from '../error.js';
import { refreshSignupMessage } from '../signup-service.js';
import type { SignupStore } from '../store/signup-store.js';

export async function handleButton(interaction: ButtonInteraction, store: SignupStore): Promise<void> {
  const [action, instanceId] = interaction.customId.split(':');

  try {
    const instance = await store.getInstance(instanceId);
    if (!instance) {
      await interaction.reply({ content: 'This event no longer exists.', ephemeral: true });
      return;
    }

    if (action === 'signup' || action === 'editsignup') {
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

    if (action === 'withdraw') {
      await store.removeSignup(instanceId, interaction.user.id);
      await refreshSignupMessage(interaction.client, store, instanceId);
      await interaction.reply({ content: 'You have been signed off.', ephemeral: true });
      return;
    }
  } catch (error) {
    await interaction.reply({ content: extractErrorMessage(error), ephemeral: true });
  }
}

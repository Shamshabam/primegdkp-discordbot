import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { extractErrorMessage } from '../error.js';
import { refreshSignupMessage } from '../signup-service.js';
import type { SignupStore } from '../store/signup-store.js';
import type { Faction } from '../types.js';
import { classesForFaction, findClass, parseCustomEmoji } from '../wow-classes.js';
import { getPendingDouse } from './modal-submit.js';

export async function handleSelectMenu(interaction: StringSelectMenuInteraction, store: SignupStore): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[0];

  try {
    if (action === 'role') {
      await handleRoleSelect(interaction);
    } else if (action === 'class') {
      await handleClassSelect(interaction);
    } else if (action === 'spec') {
      await handleSpecSelect(interaction);
    } else if (action === 'douse') {
      await handleDouseSelect(interaction, store);
    }
  } catch (error) {
    await interaction.reply({ content: extractErrorMessage(error), ephemeral: true });
  }
}

async function handleRoleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  // custom_id = role:{instanceId}:{faction}
  const [, instanceId, faction] = interaction.customId.split(':');
  const role = interaction.values[0];

  if (role === 'Fill') {
    const modal = new ModalBuilder()
      .setCustomId(`charname:${instanceId}:${role}:Fill:Fill`)
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

  const classes = classesForFaction(faction as Faction);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`class:${instanceId}:${faction}:${role}`)
    .setPlaceholder('Choose your class')
    .addOptions(
      classes.map((c) =>
        new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.name).setEmoji(parseCustomEmoji(c.emoji)),
      ),
    );

  await interaction.update({
    content: `**Step 2/4** — Role: **${role}**. Now pick your class:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

async function handleClassSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  // custom_id = class:{instanceId}:{faction}:{role}
  const [, instanceId, faction, role] = interaction.customId.split(':');
  const className = interaction.values[0];
  const wowClass = findClass(className);

  if (!wowClass) {
    await interaction.update({ content: 'Unknown class.', components: [] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`spec:${instanceId}:${faction}:${role}:${className}`)
    .setPlaceholder('Choose your spec')
    .addOptions(
      wowClass.specs.map((s) =>
        new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.name).setEmoji(parseCustomEmoji(s.emoji)),
      ),
    );

  await interaction.update({
    content: `**Step 3/4** — Role: **${role}** · Class: **${wowClass.emoji} ${className}**. Now pick your spec:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

async function handleSpecSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  // custom_id = spec:{instanceId}:{faction}:{role}:{className}
  const [, instanceId, _faction, role, className] = interaction.customId.split(':');
  const spec = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`charname:${instanceId}:${role}:${className}:${spec}`)
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
    .setLabel('Note (optional)')
    .setPlaceholder('e.g. Tank 3/4, Can MC, Can Pull...')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
  );
  await interaction.showModal(modal);
}

async function handleDouseSelect(interaction: StringSelectMenuInteraction, store: SignupStore): Promise<void> {
  // custom_id = douse:{instanceId}
  const [, instanceId] = interaction.customId.split(':');
  const douses = parseInt(interaction.values[0], 10);
  const key = `${instanceId}:${interaction.user.id}`;
  const pending = getPendingDouse(key);

  if (!pending) {
    await interaction.update({ content: 'Signup session expired. Please sign up again.', components: [] });
    return;
  }

  await store.upsertSignup({
    eventInstanceId: instanceId,
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.username,
    role: pending.role,
    className: pending.className,
    spec: pending.spec,
    characterName: pending.characterName,
    note: pending.note,
    douses,
  });

  await refreshSignupMessage(interaction.client, store, instanceId);

  const wowClass = findClass(pending.className);
  const douseStr = douses > 0 ? ` · 🧪 ${douses} douse${douses > 1 ? 's' : ''}` : '';
  await interaction.update({
    content: `Signed up as **${wowClass?.emoji ?? ''} ${pending.characterName}** (${pending.className} - ${pending.spec}, ${pending.role})${douseStr}.`,
    components: [],
  });
}

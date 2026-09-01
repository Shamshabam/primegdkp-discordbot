import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Config } from '../config.js';
import { buildSignupButtons, buildSignupEmbed } from '../embeds/signup-embed.js';
import { extractErrorMessage } from '../error.js';
import { nextOccurrence } from '../schedule/next-occurrence.js';
import type { SignupStore } from '../store/signup-store.js';
import type { Faction } from '../types.js';

const DAY_CHOICES = [
  { name: 'Sunday', value: 0 },
  { name: 'Monday', value: 1 },
  { name: 'Tuesday', value: 2 },
  { name: 'Wednesday', value: 3 },
  { name: 'Thursday', value: 4 },
  { name: 'Friday', value: 5 },
  { name: 'Saturday', value: 6 },
];

export const gdkpEventCommand = new SlashCommandBuilder()
  .setName('prime')
  .setDescription('Manage recurring GDKP raid signup posts')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a recurring weekly signup post')
      .addStringOption((o) =>
        o.setName('title').setDescription('Event title, e.g. "Molten Core GDKP"').setRequired(true),
      )
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel to post signups in')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addIntegerOption((o) =>
        o.setName('day').setDescription('Day of the week').setRequired(true).addChoices(...DAY_CHOICES),
      )
      .addStringOption((o) => o.setName('time').setDescription('Time in 24h HH:mm, e.g. 19:30').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('faction')
          .setDescription('Horde (Shaman) or Alliance (Paladin)')
          .setRequired(true)
          .addChoices({ name: 'Horde', value: 'horde' }, { name: 'Alliance', value: 'alliance' }),
      )
      .addStringOption((o) =>
        o
          .setName('timezone')
          .setDescription('IANA timezone, e.g. Europe/Copenhagen (defaults to bot default)')
          .setRequired(false),
      )
      .addStringOption((o) =>
        o
          .setName('roles')
          .setDescription('Comma-separated signup roles (default: Tank,Healer,DPS,Fill,Bench)')
          .setRequired(false),
      )
      .addStringOption((o) =>
        o.setName('description').setDescription('Extra text shown on the signup post').setRequired(false),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List recurring signup events in this server'))
  .addSubcommand((sub) =>
    sub
      .setName('delete')
      .setDescription('Delete a recurring signup event')
      .addStringOption((o) => o.setName('id').setDescription('Event ID from /prime list').setRequired(true)),
  );

export async function handleGdkpEventCommand(
  interaction: ChatInputCommandInteraction,
  config: Config,
  store: SignupStore,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === 'create') {
      await handleCreate(interaction, config, store);
    } else if (sub === 'list') {
      await handleList(interaction, store);
    } else if (sub === 'delete') {
      await handleDelete(interaction, store);
    }
  } catch (error) {
    await interaction.reply({ content: extractErrorMessage(error), ephemeral: true });
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  config: Config,
  store: SignupStore,
): Promise<void> {
  const title = interaction.options.getString('title', true);
  const channel = interaction.options.getChannel('channel', true);
  const day = interaction.options.getInteger('day', true);
  const time = interaction.options.getString('time', true);
  const timezone = interaction.options.getString('timezone') ?? config.defaultTimezone;
  const faction = interaction.options.getString('faction', true) as Faction;
  const rolesInput = interaction.options.getString('roles');
  const description = interaction.options.getString('description') ?? undefined;

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    await interaction.reply({ content: 'Time must be in 24h HH:mm format, e.g. 19:30.', ephemeral: true });
    return;
  }

  const schedule = { dayOfWeek: day, hour: Number(match[1]), minute: Number(match[2]), timezone };

  let nextFireAt: Date;
  try {
    nextFireAt = nextOccurrence(schedule);
  } catch {
    await interaction.reply({ content: `"${timezone}" isn't a recognized timezone name.`, ephemeral: true });
    return;
  }

  const roles = (rolesInput ?? 'Tank,Healer,DPS,Fill,Bench')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const template = await store.createTemplate({
    guildId: interaction.guildId!,
    channelId: channel.id,
    title,
    description,
    faction,
    roles,
    schedule,
    nextFireAt: nextFireAt.toISOString(),
    createdBy: interaction.user.id,
  });

  // Post the first signup embed immediately
  const targetChannel = await interaction.client.channels.fetch(channel.id);
  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Could not find that text channel.', ephemeral: true });
    return;
  }

  const instanceId = randomUUID();
  const now = new Date();
  const draft = {
    id: instanceId,
    templateId: template.id,
    guildId: interaction.guildId!,
    channelId: channel.id,
    messageId: '',
    title,
    description,
    faction,
    roles,
    scheduledFor: now.toISOString(),
    postedAt: now.toISOString(),
    status: 'posted' as const,
  };

  const message = await targetChannel.send({
    embeds: [buildSignupEmbed(draft, [])],
    components: [buildSignupButtons(instanceId, false)],
  });

  await store.createInstance({ ...draft, messageId: message.id });

  await interaction.reply({
    content: `Created **${title}** in <#${channel.id}> — signup post is live! Next recurring post: <t:${Math.floor(nextFireAt.getTime() / 1000)}:F>. Event ID: \`${template.id}\``,
    ephemeral: true,
  });
}

async function handleList(interaction: ChatInputCommandInteraction, store: SignupStore): Promise<void> {
  const templates = await store.listTemplates(interaction.guildId!);
  if (templates.length === 0) {
    await interaction.reply({ content: 'No recurring events configured yet. Use \`/prime create\`.', ephemeral: true });
    return;
  }

  const lines = templates.map((t) => {
    const next = Math.floor(new Date(t.nextFireAt).getTime() / 1000);
    return `\`${t.id}\` — **${t.title}** in <#${t.channelId}>, next <t:${next}:F>`;
  });

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function handleDelete(interaction: ChatInputCommandInteraction, store: SignupStore): Promise<void> {
  const id = interaction.options.getString('id', true);
  const template = await store.getTemplate(id);
  if (!template || template.guildId !== interaction.guildId) {
    await interaction.reply({ content: 'Template not found.', ephemeral: true });
    return;
  }
  const deleted = await store.deleteTemplate(id);
  await interaction.reply({
    content: deleted ? `Deleted event \`${id}\`.` : `No event found with ID \`${id}\`.`,
    ephemeral: true,
  });
}

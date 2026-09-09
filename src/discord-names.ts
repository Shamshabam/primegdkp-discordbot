import { GuildMember, type Interaction } from 'discord.js';

/**
 * The name to show for whoever is interacting: their nickname on this server
 * when they have one, otherwise their global Discord name, otherwise the raw
 * username.
 *
 * GuildMember.displayName already resolves that chain, but an interaction's
 * member can arrive as the raw API object (no methods) rather than a
 * GuildMember, so that case is handled by hand.
 */
export function guildDisplayName(interaction: Interaction): string {
  const member = interaction.member;

  if (member instanceof GuildMember) {
    return member.displayName;
  }

  const nick = (member as { nick?: string | null } | null)?.nick;

  return nick ?? interaction.user.globalName ?? interaction.user.username;
}

import type { Client, Guild, GuildMember } from 'discord.js';

/** A member who holds one of the asked-for roles. */
export interface RoleMember {
  id: string;
  name: string;
  roles: string[];
}

/** Raised when Discord will not hand the member list over. */
export class MemberListUnavailable extends Error {}

/** How many pages of a thousand members to read before giving up. */
const MAX_PAGES = 20;

/**
 * Everybody in the server holding any of the named roles.
 *
 * Read through the REST member list rather than the gateway. Listing members
 * needs the Server Members Intent switched on for the application in the
 * Developer Portal, but asking for it at login is what broke the bot before:
 * a gateway intent the portal has not granted stops the bot connecting at
 * all. A REST call that is refused only fails this one request.
 *
 * Role names are matched without regard to case, so "host" finds "Host".
 */
export async function membersWithRoles(client: Client, guildId: string, roleNames: string[]): Promise<{
  members: RoleMember[];
  missingRoles: string[];
}> {
  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();

  const wanted = new Map<string, string>();
  const missingRoles: string[] = [];

  for (const name of roleNames) {
    const role = roles.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());

    if (role) {
      wanted.set(role.id, role.name);
    } else {
      missingRoles.push(name);
    }
  }

  if (wanted.size === 0) {
    return { members: [], missingRoles };
  }

  const members: RoleMember[] = [];

  for (const member of await everyMember(guild)) {
    const held = member.roles.cache.filter((role) => wanted.has(role.id)).map((role) => role.name);

    if (held.length > 0 && ! member.user.bot) {
      members.push({ id: member.id, name: member.displayName, roles: held });
    }
  }

  members.sort((a, b) => a.name.localeCompare(b.name));

  return { members, missingRoles };
}

async function everyMember(guild: Guild): Promise<GuildMember[]> {
  const all: GuildMember[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    let batch;

    try {
      batch = await guild.members.list({ limit: 1000, after });
    } catch (error) {
      throw new MemberListUnavailable(
        'Discord refused the member list. Turn on "Server Members Intent" under Bot in the Discord Developer Portal. '
        + `(${error instanceof Error ? error.message : String(error)})`,
      );
    }

    all.push(...batch.values());

    if (batch.size < 1000) {
      break;
    }

    after = batch.lastKey();
  }

  return all;
}

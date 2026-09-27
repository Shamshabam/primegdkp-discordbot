import type { Client } from 'discord.js';
import type { Signup } from './types.js';
import type { SignupStore } from './store/signup-store.js';

/**
 * Fill in the server nickname for signups that were recorded without one.
 *
 * Every signup taken from now on records what the server calls the person, but
 * the embed can only show what was recorded - so everybody who signed up before
 * that, and everybody who pressed Absence before that path recorded it, was
 * still shown as a raw Discord username. A roster of usernames is no use to a
 * raid leader reading a signup list, because a username is not what anybody is
 * called in the channel.
 *
 * Fetched one member at a time and written back, so it costs one request per
 * person once rather than a request per person on every redraw. Fetching a
 * single member by id is an ordinary REST call - it is listing a guild's whole
 * membership that needs the privileged intent, which this bot does not have and
 * asking for broke it once before.
 */
export async function backfillNicknames(
  client: Client,
  store: SignupStore,
  guildId: string,
  signups: Signup[],
): Promise<Signup[]> {
  const missing = signups.filter((s) => ! s.discordNickname);

  if (missing.length === 0) {
    return signups;
  }

  let guild;

  try {
    guild = await client.guilds.fetch(guildId);
  } catch {
    // Not a guild this bot can see any more. Nothing to look anybody up in.
    return signups;
  }

  const found = new Map<string, string>();

  for (const signup of missing) {
    if (found.has(signup.discordUserId)) {
      continue;
    }

    try {
      const member = await guild.members.fetch(signup.discordUserId);

      found.set(signup.discordUserId, member.displayName);
    } catch {
      // Left the server, or cannot be fetched. Their username is all there is,
      // and one person who cannot be looked up must not cost the rest theirs.
    }
  }

  if (found.size === 0) {
    return signups;
  }

  const filled = signups.map((signup) => {
    const nickname = signup.discordNickname ?? found.get(signup.discordUserId);

    return nickname ? { ...signup, discordNickname: nickname } : signup;
  });

  // Written back so this is paid once. A failure here costs nothing beyond
  // doing it again next time, so it must not stop the message being drawn.
  for (const signup of filled) {
    if (signup.discordNickname && ! signups.find((s) => s.id === signup.id)?.discordNickname) {
      try {
        await store.upsertSignup(signup);
      } catch {
        // Drawn with the right name regardless.
      }
    }
  }

  return filled;
}

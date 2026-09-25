import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { EventInstance, Signup } from '../types.js';
import { classDisplayOrder, findClass, findSpec, getCombatRole } from '../wow-classes.js';

export function buildSignupEmbed(instance: EventInstance, signups: Signup[]): EmbedBuilder {
  const mainSignups = signups.filter((s) => s.role !== 'Absence');
  const absenceSignups = signups.filter((s) => s.role === 'Absence');

  // Assign global signup numbers based on signup order
  const ordered = [...mainSignups].sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt));
  const signupNumber = new Map<string, number>();
  ordered.forEach((s, i) => signupNumber.set(s.id, i + 1));

  // Role-bucket counts for the overview. Fill sits outside the three buckets,
  // so it is left out of the tally the same way it has its own section below.
  let tankCount = 0;
  let healerCount = 0;
  let dpsCount = 0;
  for (const s of mainSignups) {
    if (s.role === 'Fill') continue;
    const bucket = bucketOf(s);
    if (bucket === 'Tank') tankCount++;
    else if (bucket === 'Healer') healerCount++;
    else dpsCount++;
  }

  const embed = new EmbedBuilder()
    .setTitle(instance.title)
    .setColor(0x2b2d31);

  if (instance.description) embed.setDescription(instance.description);

  // Info bar: Discord timestamps (auto-localize to each viewer's timezone)
  const eventDate = new Date(instance.scheduledFor);
  const unixTs = Math.floor(eventDate.getTime() / 1000);

  embed.addFields(
    { name: '​', value: `📅 <t:${unixTs}:D>  ·  ⏰ <t:${unixTs}:t>`, inline: true },
    { name: '​', value: `👥 **${mainSignups.length}**  ·  🕐 <t:${unixTs}:R>`, inline: true },
  );

  // Role summary: Tanks · Healers · DPS, the three buckets the list is split by.
  const totalDouses = mainSignups.reduce((sum, s) => sum + (s.douses ?? 0), 0);
  const douseSummary = totalDouses > 0 ? `  ·  🧪 **${totalDouses}** Douses` : '';
  embed.addFields({
    name: '​',
    value: `🛡️ **${tankCount}** Tanks  ·  💚 **${healerCount}** Healers  ·  ⚔️ **${dpsCount}** DPS${douseSummary}`,
    inline: false,
  });

  // Split by role first, then by class inside each - a Tank divider with the
  // warriors, druids and paladins who signed as tanks under it, and the same
  // for healers and DPS. The bucket is the role the signer picked, which
  // defaults from their spec, so a Feral who chose Tank lands under Tanks.
  const buckets: { key: RoleBucket; header: string }[] = [
    { key: 'Tank', header: '🛡️  —  TANKS  —' },
    { key: 'Healer', header: '💚  —  HEALERS  —' },
    { key: 'DPS', header: '⚔️  —  DPS  —' },
  ];

  for (const { key, header } of buckets) {
    const inBucket = mainSignups.filter((s) => s.role !== 'Fill' && bucketOf(s) === key);
    if (inBucket.length === 0) continue;

    embed.addFields({ name: header, value: '​', inline: false });
    addClassFields(embed, inBucket, instance.faction, signupNumber);
  }

  // Fill
  const fillSignups = mainSignups.filter((s) => s.role === 'Fill');
  if (fillSignups.length > 0) {
    const lines = fillSignups.map((s) => {
      const noteStr = s.note ? NOTE_MARK : '';

      return `🔄 \`${String(signupNumber.get(s.id) ?? 0).padStart(2, ' ')}\` ${who(s)}${noteStr}`;
    });
    embed.addFields({
      name: `🔄 Fill (${fillSignups.length})`,
      value: lines.join('\n'),
      inline: true,
    });
  }

  // Absence
  if (absenceSignups.length > 0) {
    const lines = absenceSignups.map((s) => {
      const cls = findClass(s.className);
      const nickname = s.discordNickname ?? s.discordUsername;

      return `${cls?.emoji ?? '❌'} ${nickname ? `${nickname} - ` : ''}~~${s.characterName}~~`;
    });
    embed.addFields({
      name: `❌ Absence (${absenceSignups.length})`,
      value: lines.join('\n'),
      inline: false,
    });
  }

  // Footer
  if (instance.status === 'closed') {
    embed.setFooter({ text: 'Signups closed' });
  }

  return embed;
}

type RoleBucket = 'Tank' | 'Healer' | 'DPS';

/**
 * Which of the three buckets a signup belongs in.
 *
 * The role the signer picked wins - it already defaults from their spec in the
 * signup flow - and anything else is placed from the spec's combat role so a
 * stray value still lands somewhere sensible rather than vanishing.
 */
function bucketOf(signup: Signup): RoleBucket {
  if (signup.role === 'Tank' || signup.role === 'Healer' || signup.role === 'DPS') {
    return signup.role;
  }

  const combatRole = getCombatRole(signup.className, signup.spec);

  return combatRole === 'tank' ? 'Tank' : combatRole === 'healer' ? 'Healer' : 'DPS';
}

/** One inline field per class present, in the raid's display order. */
function addClassFields(
  embed: EmbedBuilder,
  signups: Signup[],
  faction: EventInstance['faction'],
  signupNumber: Map<string, number>,
): void {
  const byClass = new Map<string, Signup[]>();
  for (const s of signups) {
    const arr = byClass.get(s.className) ?? [];
    arr.push(s);
    byClass.set(s.className, arr);
  }

  for (const className of classDisplayOrder(faction)) {
    const classSignups = byClass.get(className);
    if (!classSignups || classSignups.length === 0) continue;

    const wowClass = findClass(className);
    const lines = classSignups.map((s) => formatLine(s, signupNumber.get(s.id) ?? 0));
    embed.addFields({
      name: `${wowClass?.emoji ?? '❓'} ${className} (${classSignups.length})`,
      value: lines.join('\n'),
      inline: true,
    });
  }
}

/**
 * Who somebody is, on one line: the name they go by in Discord, then the
 * character they are bringing.
 *
 * Both are wanted for different reasons - the raid leader knows people by
 * their Discord name and the game knows them by the character - so neither
 * one on its own is enough to work out who has signed.
 */
/**
 * Who signed up, and what they are bringing.
 *
 * The Discord name carries the weight because that is the question being
 * asked of this list - who is coming - and the character is the detail. Discord
 * has no font sizes in an embed, so the difference is bold against plain; the
 * only real size control is subtext, which takes a whole line and would double
 * the length of a forty-name list.
 */
function who(signup: Signup): string {
    const nickname = signup.discordNickname ?? signup.discordUsername;

    return nickname ? `**${nickname}** - ${signup.characterName}` : `**${signup.characterName}**`;
}

/**
 * A note is marked rather than printed.
 *
 * Discord has no hover text in a message, so the choice is a mark or the
 * whole note inline; forty signups with a sentence each is unreadable. The
 * glyph is a text one rather than an emoji, which renders at the size of the
 * line instead of standing a head above it.
 */
const NOTE_MARK = ' \u270E';

function formatLine(signup: Signup, num: number): string {
  const wowClass = findClass(signup.className);
  const spec = wowClass ? findSpec(wowClass, signup.spec) : undefined;
  const padded = String(num).padStart(2, ' ');
  const noteStr = signup.note ? NOTE_MARK : '';
  const douseStr = signup.douses && signup.douses > 0 ? ` 🧪${signup.douses}` : '';

  return `${spec?.emoji ?? '❓'} \`${padded}\` ${who(signup)}${douseStr}${noteStr}`;
}

export function buildSignupButtons(instanceId: string, closed: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`signup:${instanceId}`)
      .setLabel('Sign Up')
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`editsignup:${instanceId}`)
      .setLabel('Edit Signup')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`withdraw:${instanceId}`)
      .setLabel('Sign Off')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed),
  );
}

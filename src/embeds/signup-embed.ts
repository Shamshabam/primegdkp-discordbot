import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { EventInstance, Signup } from '../types.js';
import { classDisplayOrder, findClass, findSpec, getCombatRole } from '../wow-classes.js';

export function buildSignupEmbed(instance: EventInstance, signups: Signup[]): EmbedBuilder {
  const mainSignups = signups.filter((s) => s.role !== 'Bench');
  const benchSignups = signups.filter((s) => s.role === 'Bench');

  // Assign global signup numbers based on signup order
  const ordered = [...mainSignups].sort((a, b) => a.signedUpAt.localeCompare(b.signedUpAt));
  const signupNumber = new Map<string, number>();
  ordered.forEach((s, i) => signupNumber.set(s.id, i + 1));

  // Combat role counts
  let tankCount = 0;
  let meleeCount = 0;
  let rangedCount = 0;
  let healerCount = 0;
  for (const s of mainSignups) {
    const cr = getCombatRole(s.className, s.spec);
    if (cr === 'tank') tankCount++;
    else if (cr === 'melee') meleeCount++;
    else if (cr === 'ranged') rangedCount++;
    else if (cr === 'healer') healerCount++;
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

  // Role summary: Tank · Melee · Ranged · Healers
  const totalDouses = mainSignups.reduce((sum, s) => sum + (s.douses ?? 0), 0);
  const douseSummary = totalDouses > 0 ? `  ·  🧪 **${totalDouses}** Douses` : '';
  embed.addFields({
    name: '​',
    value: `🛡️ **${tankCount}** Tank  ·  🔴 **${meleeCount}** Melee  ·  🟢 **${rangedCount}** Ranged  ·  💚 **${healerCount}** Healers${douseSummary}`,
    inline: false,
  });

  // Tank section first (cross-class)
  const tanks = mainSignups.filter((s) => s.role === 'Tank');
  if (tanks.length > 0) {
    const lines = tanks.map((s) => formatLine(s, signupNumber.get(s.id) ?? 0));
    embed.addFields({ name: `🛡️ Tank (${tanks.length})`, value: lines.join('\n'), inline: true });
  }

  // Class sections (non-tank, non-fill signups)
  const nonTankSignups = mainSignups.filter((s) => s.role !== 'Tank' && s.role !== 'Fill');
  const byClass = new Map<string, Signup[]>();
  for (const s of nonTankSignups) {
    const arr = byClass.get(s.className) ?? [];
    arr.push(s);
    byClass.set(s.className, arr);
  }

  for (const className of classDisplayOrder(instance.faction)) {
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

  // Fill
  const fillSignups = mainSignups.filter((s) => s.role === 'Fill');
  if (fillSignups.length > 0) {
    const lines = fillSignups.map((s) => {
      const noteStr = s.note ? ` *(${s.note})*` : '';
      return `🔄 \`${String(signupNumber.get(s.id) ?? 0).padStart(2, ' ')}\` **${s.characterName}**${noteStr}`;
    });
    embed.addFields({
      name: `🔄 Fill (${fillSignups.length})`,
      value: lines.join('\n'),
      inline: true,
    });
  }

  // Bench
  if (benchSignups.length > 0) {
    const lines = benchSignups.map((s) => {
      const cls = findClass(s.className);
      return `${cls?.emoji ?? '❓'} ${s.characterName} *(${s.spec})*`;
    });
    embed.addFields({
      name: `🪑 Bench (${benchSignups.length})`,
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

function formatLine(signup: Signup, num: number): string {
  const wowClass = findClass(signup.className);
  const spec = wowClass ? findSpec(wowClass, signup.spec) : undefined;
  const padded = String(num).padStart(2, ' ');
  const noteStr = signup.note ? ` 📝` : '';
  const douseStr = signup.douses && signup.douses > 0 ? ` 🧪${signup.douses}` : '';
  return `${spec?.emoji ?? '❓'} \`${padded}\` **${signup.characterName}**${douseStr}${noteStr}`;
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

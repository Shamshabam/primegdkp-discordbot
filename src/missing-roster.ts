import { WOW_CLASSES } from './wow-classes.js';

/** One position the raid is still short of. */
export interface MissingSlot {
  label: string;
  count: number;
  note?: string;
}

export interface MissingMessage {
  raidTitle: string;
  missingSlots: MissingSlot[];
  extraMessage?: string;
}

/**
 * Which icon stands for each position asked for.
 *
 * A class that raids as one thing gets its class icon. Where the position is a
 * particular job rather than a class, the spec says it better: a tank is a
 * protection warrior, a warrior asked for on a roster is a fury one, and a
 * paladin is being asked for to heal.
 */
const SPEC_FOR_LABEL: Record<string, { className: string; spec: string }> = {
  Tank: { className: 'Warrior', spec: 'Protection' },
  Warrior: { className: 'Warrior', spec: 'Fury' },
  Paladin: { className: 'Paladin', spec: 'Holy' },
};

/**
 * The emoji for a position, or a question mark for one nothing is known about.
 *
 * These are application emoji the bot has already uploaded, so they render in
 * any server it is in. The website used to build this message with unicode
 * stand-ins - a shield, a snowflake, a bear - because it has no way of knowing
 * what the bot's emoji are called.
 */
export function emojiForLabel(label: string): string {
  const wanted = SPEC_FOR_LABEL[label];
  const className = wanted?.className ?? label;
  const wowClass = WOW_CLASSES.find((c) => c.name === className);

  if (!wowClass) {
    return '❓';
  }

  if (!wanted) {
    return wowClass.emoji;
  }

  return wowClass.specs.find((s) => s.name === wanted.spec)?.emoji ?? wowClass.emoji;
}

/**
 * What still needs filling, as it reads in the channel.
 *
 * Built here rather than on the website because the icons are the bot's: it
 * knows what its emoji are called and the website does not.
 */
export function buildMissingMessage({ raidTitle, missingSlots, extraMessage }: MissingMessage): string {
  const wanted = missingSlots.filter((slot) => slot.count > 0);
  const total = wanted.reduce((sum, slot) => sum + slot.count, 0);

  // A full roster says so rather than announcing that it is short of nobody,
  // which is what counting an empty list came out as.
  const lines = [
    total > 0
      ? `@everyone\n**Roster for "${raidTitle}"**\nCurrently missing **${total}** people for the raid\n`
      : `@everyone\n**Roster for "${raidTitle}"**\nThe roster is full.\n`,
  ];

  for (const slot of wanted) {
    const note = slot.note ? ` (${slot.note})` : '';
    lines.push(`${emojiForLabel(slot.label)} **${slot.count}x** ${slot.label}${note}`);
  }

  const extra = (extraMessage ?? '').trim();

  if (extra !== '') {
    lines.push('');
    lines.push(extra);
  }

  return lines.join('\n');
}

import { WOW_CLASSES } from './wow-classes.js';
import { timingLines } from './raid-timings.js';

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
  /** When the raid pulls, which the invite and replacement times come off. */
  scheduledFor?: string;
  /** Which raid it is, which decides what people are told to bring. */
  raidType?: string | null;
}

/**
 * What raiders are told to bring.
 *
 * On every roster, because a rule nobody is reminded of is one somebody turns
 * up without - but not the same rule for every raid. Naxxramas wants frost
 * resistance and a bidding addon; a world tour wants what its own bosses need,
 * and telling that raid about frost resistance tells them nothing.
 */
const REQUIREMENTS: Record<string, string[]> = {
  naxxramas: [
    'Full worldbuffs + consumables required (Including flask)',
    'Bring a minimum frost resistance of 100 as Melee, and 150 as Caster.',
    'Install and update Gargul addon to be able to bid on items.',
  ],
  world_tour: [
    'Remember your AQ mounts, douses, ony cloaks and poison resistance elixirs!',
    'Install and update Gargul addon to be able to bid on items.',
    'Full worldbuffs + consumables required (Including flask for tank 1+2+3)',
  ],
};

/**
 * The lines for a raid.
 *
 * Anything the list does not name falls back to the Naxxramas one: a raid
 * nobody has taught this about is far more likely to be a Naxx run than to
 * want no requirements at all.
 */
export function requirementsFor(raidType?: string | null): string[] {
  return REQUIREMENTS[raidType ?? ''] ?? REQUIREMENTS.naxxramas;
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
 * The whole post that goes under a roster.
 *
 * Built here rather than on the website because the icons are the bot's: it
 * knows what its emoji are called and the website does not.
 *
 * Written in the order it is read: when to turn up, who is still needed, then
 * anything about this week, then the rules that hold for every week.
 */
export function buildMissingMessage({
  raidTitle,
  missingSlots,
  extraMessage,
  scheduledFor,
  raidType,
}: MissingMessage): string {
  const sections: string[] = [`@everyone\n**Roster for "${raidTitle}"**`];

  const timings = scheduledFor ? timingLines(scheduledFor) : '';

  if (timings !== '') {
    sections.push(timings);
  }

  const wanted = missingSlots.filter((slot) => slot.count > 0);

  if (wanted.length > 0) {
    const total = wanted.reduce((sum, slot) => sum + slot.count, 0);

    sections.push([
      `# Still missing ${total}`,
      ...wanted.map((slot) => {
        const note = slot.note ? ` (${slot.note})` : '';

        return `${emojiForLabel(slot.label)} **${slot.count}x** ${slot.label}${note}`;
      }),
    ].join('\n'));
  } else {
    // A full roster says so rather than announcing that it is short of nobody,
    // which is what counting an empty list came out as.
    sections.push('# The roster is full');
  }

  const extra = (extraMessage ?? '').trim();

  if (extra !== '') {
    sections.push(extra);
  }

  sections.push(requirementsFor(raidType).join('\n'));

  return sections.join('\n\n');
}

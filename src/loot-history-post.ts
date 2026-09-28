import { EmbedBuilder } from 'discord.js';

/** One sale: what dropped, who bought it, what they paid. */
export interface LootLine {
  item: string;
  buyer: string;
  gold: number;
  /**
   * The item's quality, as the game numbers them - 4 is epic.
   *
   * Absent for an item nothing is known about, which is drawn as an epic
   * rather than as poor: most of what sells in a GDKP is.
   */
  quality?: number;
  /** What the buyer raids as, for their name's colour. */
  className?: string;
}

export interface LootHistoryPost {
  raidName: string;
  /** Already written the way the raid is dated on the site. */
  date: string;
  totalPot: number;
  items: LootLine[];
}

/** Discord refuses an embed description longer than this. */
const DESCRIPTION_LIMIT = 4096;

/**
 * Gold the way the sheet writes it: 1.500g, thousands split by a full stop.
 *
 * The raid reads its gold this way everywhere else, and a run of four and five
 * figure numbers is unreadable without the separator.
 */
export function formatGold(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}g`;
}

/**
 * The loot from one raid, as it is posted to the channel.
 *
 * An embed rather than a plain message: forty sales run past the 2000
 * characters a message is allowed, and splitting the list across several posts
 * means several posts to keep up to date every time a price is corrected.
 */
export function buildLootHistoryEmbed({ raidName, date, totalPot, items }: LootHistoryPost): EmbedBuilder {
  const lines = items.map((line) => `${line.item} - ${line.buyer} - ${formatGold(line.gold)}`);

  return new EmbedBuilder()
    .setTitle(`${raidName} - ${date} - Total pot: ${formatGold(totalPot)}`)
    .setColor(0xc8aa6e)
    .setDescription(describe(lines));
}

/**
 * The lines, cut to what an embed will take.
 *
 * A raid long enough to overrun it would otherwise have its post refused
 * outright, which loses the whole list rather than the tail of it.
 */
function describe(lines: string[]): string {
  if (lines.length === 0) {
    return 'Nothing was sold.';
  }

  const whole = lines.join('\n');

  if (whole.length <= DESCRIPTION_LIMIT) {
    return whole;
  }

  const kept: string[] = [];
  let length = 0;

  for (const line of lines) {
    const note = `\n... and ${lines.length - kept.length} more on the website`;

    if (length + line.length + 1 + note.length > DESCRIPTION_LIMIT) {
      return `${kept.join('\n')}${note}`;
    }

    kept.push(line);
    length += line.length + 1;
  }

  return kept.join('\n');
}

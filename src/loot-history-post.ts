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

/**
 * Gold the way the sheet writes it: 1.500g, thousands split by a full stop.
 *
 * The raid reads its gold this way everywhere else, and a run of four and five
 * figure numbers is unreadable without the separator.
 */
export function formatGold(amount: number): string {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}g`;
}

/**
 * When to turn up, worked back from when the raid pulls.
 *
 * Every raid runs to the same clock, so it is worked out rather than typed in:
 * a 14:30 raid invites at 13:30 and replaces at 14:00. Written on the signup
 * because "what time are invites" is the question the channel asks every week,
 * and the answer has always been the same.
 */

/** Minutes before the pull that each thing happens. */
export const TIMINGS = [
  { label: 'Invites', minutesBefore: 60 },
  { label: 'Replacements', minutesBefore: 30 },
  { label: 'Pull', minutesBefore: 0 },
] as const;

export interface RaidTiming {
  label: string;
  /** Seconds since the epoch, for a Discord timestamp. */
  at: number;
}

/**
 * The three moments, as unix seconds.
 *
 * Given as timestamps rather than as written-out times so Discord shows each
 * viewer their own clock - the raid is on a European server and the people in
 * it are not all in Europe.
 *
 * An unreadable start date has no times to work back from, and inventing them
 * would be worse than leaving the line off.
 */
export function raidTimings(scheduledFor: string): RaidTiming[] {
  const pull = new Date(scheduledFor);

  if (Number.isNaN(pull.getTime())) {
    return [];
  }

  return TIMINGS.map(({ label, minutesBefore }) => ({
    label,
    at: Math.floor((pull.getTime() - minutesBefore * 60_000) / 1000),
  }));
}

/** The three lines as they read on the signup. */
export function timingLines(scheduledFor: string): string {
  return raidTimings(scheduledFor)
    .map(({ label, at }) => `**${label}** <t:${at}:t>`)
    .join('\n');
}

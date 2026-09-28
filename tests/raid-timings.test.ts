import { describe, expect, it } from 'vitest';
import { raidTimings, timingLines } from '../src/raid-timings.js';

/**
 * Every raid runs to the same clock, so the times are worked back from the pull
 * rather than typed in: a 14:30 raid invites at 13:30 and replaces at 14:00.
 */
describe('raid timings', () => {
    const pull = '2026-10-04T14:30:00.000Z';

    /** What a timing reads as in UTC, to check the arithmetic. */
    const clock = (at: number) =>
        new Date(at * 1000).toISOString().slice(11, 16);

    it('invites an hour before the pull', () => {
        expect(clock(raidTimings(pull)[0].at)).toBe('13:30');
    });

    it('replaces half an hour before the pull', () => {
        expect(clock(raidTimings(pull)[1].at)).toBe('14:00');
    });

    it('pulls at the time the raid is set for', () => {
        expect(clock(raidTimings(pull)[2].at)).toBe('14:30');
    });

    it('names them in the order they happen', () => {
        expect(raidTimings(pull).map((t) => t.label)).toEqual(['Invites', 'Replacements', 'Pull']);
    });

    it('crosses midnight rather than wrapping within the day', () => {
        // A 00:30 raid invites at 23:30 the evening before.
        const timings = raidTimings('2026-10-04T00:30:00.000Z');

        expect(new Date(timings[0].at * 1000).toISOString()).toBe('2026-10-03T23:30:00.000Z');
    });

    it('writes them as timestamps, so each viewer sees their own clock', () => {
        // The raid is on a European server and the people in it are not all in
        // Europe. A written-out time would be right for one of them.
        expect(timingLines(pull)).toMatch(/\*\*Invites\*\* <t:\d+:t>/);
    });

    it('says nothing at all when the start cannot be read', () => {
        // Inventing times is worse than leaving the line off.
        expect(raidTimings('not a date')).toEqual([]);
        expect(timingLines('not a date')).toBe('');
    });
});

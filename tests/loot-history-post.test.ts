import { describe, expect, it } from 'vitest';
import { formatGold } from '../src/loot-history-post.js';
import { renderLootHistory } from '../src/loot-history-image.js';

/**
 * A finalised raid's loot, as it is posted to the channel.
 *
 * Drawn rather than written: Discord will not colour text in a message, and
 * the one coloured code block it has offers eight colours - so an epic and a
 * rare come out the same blue, and a warrior and a rogue the same yellow.
 * Those colours are the point.
 */
describe('gold', () => {
    it('splits thousands the way the sheet writes them', () => {
        expect(formatGold(165100)).toBe('165.100g');
        expect(formatGold(900)).toBe('900g');
        expect(formatGold(1000000)).toBe('1.000.000g');
    });
});

describe('the drawn list', () => {
    const post = {
        raidName: 'Naxx Saturday',
        date: 'Sat 03 Oct 2026',
        totalPot: 165100,
        items: [
            { item: 'Ashkandi', buyer: 'Skipz', gold: 90000, quality: 4, className: 'Rogue' },
            { item: 'Kingsfall', buyer: 'Miaana', gold: 75100, quality: 3, className: 'Mage' },
        ],
    };

    /** PNG files start with these eight bytes, whatever is in them. */
    const isPng = (buffer: Buffer) =>
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    it('draws a picture', () => {
        expect(isPng(renderLootHistory(post))).toBe(true);
    });

    it('draws one for a raid that sold nothing rather than failing', () => {
        expect(isPng(renderLootHistory({ ...post, items: [] }))).toBe(true);
    });

    it('grows for a longer list', () => {
        // Forty sales do not get cut down to fit a fixed box.
        const many = Array.from({ length: 40 }, (_, i) => ({
            item: `Item ${i}`,
            buyer: `Buyer ${i}`,
            gold: 1000,
        }));

        expect(renderLootHistory({ ...post, items: many }).length)
            .toBeGreaterThan(renderLootHistory(post).length);
    });

    it('copes with an item nothing is known about', () => {
        // No quality and no class: drawn in the fallback colours rather than
        // throwing on a missing key.
        const unknown = { item: 'Something new', buyer: 'Nobody', gold: 100 };

        expect(isPng(renderLootHistory({ ...post, items: [unknown] }))).toBe(true);
    });
});

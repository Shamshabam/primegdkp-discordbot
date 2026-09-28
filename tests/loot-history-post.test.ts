import { describe, expect, it } from 'vitest';
import { formatGold } from '../src/loot-history-post.js';
import { renderLootHistory, sortedByPrice } from '../src/loot-history-image.js';
import { loadItemIcons } from '../src/item-icons.js';

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

    it('puts the dearest sale at the top', () => {
        // What a raid made is read down from the top. In the order they
        // happened to be entered, the drops anybody asks about are scattered
        // through forty rows of consumable-priced offhands.
        const sorted = sortedByPrice([
            { item: 'Cheap', buyer: 'A', gold: 400 },
            { item: 'Dear', buyer: 'B', gold: 40000 },
            { item: 'Middling', buyer: 'C', gold: 5000 },
        ]);

        expect(sorted.map((line) => line.item)).toEqual(['Dear', 'Middling', 'Cheap']);
    });

    it('sorts a copy, leaving the list it was given alone', () => {
        const given = [
            { item: 'Cheap', buyer: 'A', gold: 400 },
            { item: 'Dear', buyer: 'B', gold: 40000 },
        ];

        sortedByPrice(given);

        expect(given[0].item).toBe('Cheap');
    });

    it('draws a row whose icon could not be fetched', () => {
        // Left out rather than failing: a missing square is worth less than a
        // post that does not go out.
        const missing = { item: 'Something', buyer: 'Nobody', gold: 100, icon: 'inv_nothing' };

        expect(isPng(renderLootHistory({ ...post, items: [missing] }, new Map()))).toBe(true);
    });

    it('copes with an item nothing is known about', () => {
        // No quality and no class: drawn in the fallback colours rather than
        // throwing on a missing key.
        const unknown = { item: 'Something new', buyer: 'Nobody', gold: 100 };

        expect(isPng(renderLootHistory({ ...post, items: [unknown] }))).toBe(true);
    });
});

describe('item icons', () => {
    it('asks for nothing when no name is one Wowhead would use', async () => {
        // The name reaches the bot from a third party by way of the website,
        // and is about to become a file path and a URL.
        const icons = await loadItemIcons(['../../etc/passwd', 'http://elsewhere/x', 'a b']);

        expect(icons.has('../../etc/passwd')).toBe(false);
        expect(icons.has('a b')).toBe(false);
    });
});

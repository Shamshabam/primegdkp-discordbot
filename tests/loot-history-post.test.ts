import { describe, expect, it } from 'vitest';
import { buildLootHistoryEmbed, formatGold } from '../src/loot-history-post.js';

/**
 * A finalised raid's loot, as it is posted to the channel.
 *
 * An embed rather than a plain message: forty sales run past the 2000
 * characters a message is allowed, and splitting the list across several posts
 * means several posts to keep up to date every time a price is corrected.
 */
describe('gold', () => {
    it('splits thousands the way the sheet writes them', () => {
        expect(formatGold(165100)).toBe('165.100g');
        expect(formatGold(900)).toBe('900g');
        expect(formatGold(1000000)).toBe('1.000.000g');
    });
});

describe('the loot post', () => {
    const post = {
        raidName: 'Naxx Saturday',
        date: 'Sat 03 Oct 2026',
        totalPot: 165100,
        items: [
            { item: 'Ashkandi', buyer: 'Skipz', gold: 90000 },
            { item: 'Kingsfall', buyer: 'Miaana', gold: 75100 },
        ],
    };

    it('heads with the raid, the night and the pot', () => {
        expect(buildLootHistoryEmbed(post).data.title)
            .toBe('Naxx Saturday - Sat 03 Oct 2026 - Total pot: 165.100g');
    });

    it('lists each sale as item, buyer and price', () => {
        expect(buildLootHistoryEmbed(post).data.description)
            .toBe('Ashkandi - Skipz - 90.000g\nKingsfall - Miaana - 75.100g');
    });

    it('says so rather than showing an empty box', () => {
        expect(buildLootHistoryEmbed({ ...post, items: [] }).data.description)
            .toBe('Nothing was sold.');
    });

    it('keeps what it can when a raid sells more than an embed will hold', () => {
        // Overrunning would have the post refused outright, which loses the
        // whole list rather than the tail of it.
        const many = Array.from({ length: 300 }, (_, i) => ({
            item: `A rather long item name number ${i}`,
            buyer: `Somebodywithalongname${i}`,
            gold: 1234,
        }));

        const description = buildLootHistoryEmbed({ ...post, items: many }).data.description ?? '';

        expect(description.length).toBeLessThanOrEqual(4096);
        expect(description).toContain('more on the website');
    });
});

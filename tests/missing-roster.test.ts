import { describe, expect, it } from 'vitest';
import { buildMissingMessage, emojiForLabel } from '../src/missing-roster.js';

/**
 * The message asking for the people a roster is still short of.
 *
 * It was built on the website with unicode stand-ins - a shield for a tank, a
 * snowflake for a mage, a bear for a druid - because the website has no way of
 * knowing what the bot's uploaded emoji are called. The bot knows, so the bot
 * writes it.
 */
describe('which icon stands for a position', () => {
    it('uses the class icon for a class that raids as one thing', () => {
        expect(emojiForLabel('Mage')).toContain('c_mage');
        expect(emojiForLabel('Priest')).toContain('c_priest');
        expect(emojiForLabel('Druid')).toContain('c_druid');
    });

    it('asks for a warrior as a fury one', () => {
        expect(emojiForLabel('Warrior')).toContain('s_fury');
    });

    it('asks for a tank as a protection warrior', () => {
        expect(emojiForLabel('Tank')).toContain('s_prot_war');
    });

    it('asks for a paladin as a healer', () => {
        expect(emojiForLabel('Paladin')).toContain('s_holy_pal');
    });

    it('falls back to a question mark rather than breaking the message', () => {
        expect(emojiForLabel('Demon Hunter')).toBe('❓');
    });
});

describe('the message', () => {
    const slots = [
        { label: 'Warrior', count: 8, note: 'Pumper/Mix/Buyer' },
        { label: 'Mage', count: 3, note: '' },
    ];

    it('counts everybody it is short of', () => {
        expect(buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots }))
            .toContain('missing **11** people');
    });

    it('names each position with its icon and its note', () => {
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots });

        expect(said).toContain('**8x** Warrior (Pumper/Mix/Buyer)');
        expect(said).toContain('s_fury');
    });

    it('leaves out the positions that are filled', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: [...slots, { label: 'Rogue', count: 0, note: '' }],
        });

        expect(said).not.toContain('Rogue');
    });

    it('says a full roster is full rather than short of nobody', () => {
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: [] });

        expect(said).toContain('The roster is full.');
        expect(said).not.toContain('missing **0**');
    });

    it('puts the extra message underneath', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: slots,
            extraMessage: 'Token buyers are always welcome',
        });

        expect(said.trimEnd().endsWith('Token buyers are always welcome')).toBe(true);
    });

    it('does not leave a gap for an extra message that is only spaces', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: slots,
            extraMessage: '   \n ',
        });

        expect(said.trimEnd()).toBe(said);
    });
});

import { describe, expect, it } from 'vitest';
import { buildMissingMessage, emojiForLabel } from '../src/missing-roster.js';

/**
 * The post that goes under a roster: when to turn up, who is still needed,
 * anything about this week, then the rules that hold every week.
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

    const pull = '2026-10-04T14:30:00.000Z';

    it('opens by naming the raid to everybody', () => {
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots });

        expect(said.startsWith('@everyone\n**Roster for "Naxx"**')).toBe(true);
    });

    it('says when invites, replacements and the pull are', () => {
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots, scheduledFor: pull });

        expect(said).toContain('**Invites**');
        expect(said).toContain('**Replacements**');
        expect(said).toContain('**Pull**');
    });

    it('leaves the times out rather than guessing when it has no start', () => {
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots });

        expect(said).not.toContain('Invites');
    });

    it('counts everybody it is short of', () => {
        expect(buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots }))
            .toContain('# Still missing 11');
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

        expect(said).toContain('# The roster is full');
        expect(said).not.toContain('Still missing 0');
    });

    it('always ends with what every raider has to bring', () => {
        // True of every raid, and a rule nobody is reminded of is one somebody
        // turns up without.
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots });

        expect(said).toContain('Full worldbuffs + consumables required (Including flask)');
        expect(said).toContain('minimum frost resistance of 100 as Melee, and 150 as Caster');
        expect(said.trimEnd().endsWith('Install and update Gargul addon to be able to bid on items.')).toBe(true);
    });

    it('puts what was written this week above the standing rules', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: slots,
            extraMessage: 'Token buyers are always welcome',
        });

        expect(said.indexOf('Token buyers')).toBeLessThan(said.indexOf('Full worldbuffs'));
    });

    it('does not leave a gap for an extra message that is only spaces', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: slots,
            extraMessage: '   \n ',
        });

        expect(said).not.toContain('\n\n\n');
    });

    it('reads in the order it is meant to be read', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: slots,
            scheduledFor: pull,
            extraMessage: 'Invites are on time tonight',
        });

        const order = ['Roster for', '**Invites**', '# Still missing', 'on time tonight', 'Full worldbuffs'];

        expect(order.map((part) => said.indexOf(part))).toEqual(
            [...order.map((part) => said.indexOf(part))].sort((a, b) => a - b),
        );
    });
it('tells a world tour what a world tour needs', () => {
        const said = buildMissingMessage({
            raidTitle: 'World Tour',
            missingSlots: slots,
            raidType: 'world_tour',
        });

        expect(said).toContain('Remember your AQ mounts, douses, ony cloaks and poison resistance elixirs!');
        expect(said).toContain('Install and update Gargul addon to be able to bid on items.');
        // The flask line names the tanks it applies to, which the Naxx one does not.
        expect(said).toContain('Full worldbuffs + consumables required (Including flask for tank 1+2+3)');
        // Frost resistance is a Naxxramas rule and says nothing to this raid.
        expect(said).not.toContain('frost resistance');
    });

    it('tells Naxxramas what Naxxramas needs', () => {
        const said = buildMissingMessage({
            raidTitle: 'Naxx',
            missingSlots: slots,
            raidType: 'naxxramas',
        });

        expect(said).toContain('frost resistance');
        expect(said).not.toContain('AQ mounts');
    });

    it('falls back to the Naxxramas rules for a raid it has not been taught', () => {
        // Far more likely to be a Naxx run than to want no requirements at all.
        const said = buildMissingMessage({ raidTitle: 'Naxx', missingSlots: slots });

        expect(said).toContain('Full worldbuffs');
    });
});

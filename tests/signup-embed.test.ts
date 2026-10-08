import { describe, expect, it } from 'vitest';
import { buildSignupEmbed } from '../src/embeds/signup-embed.js';
import type { EventInstance, Signup } from '../src/types.js';

function instance(): EventInstance {
  return {
    id: 'inst-1',
    templateId: 'tmpl-1',
    guildId: 'g1',
    channelId: 'c1',
    messageId: 'm1',
    title: 'Mon Naxx',
    faction: 'alliance',
    roles: ['Tank', 'Healer', 'DPS'],
    scheduledFor: '2026-09-07T20:00:00.000Z',
    postedAt: '2026-09-05T20:00:00.000Z',
    status: 'posted',
  };
}

let counter = 0;

function signup(over: Partial<Signup>): Signup {
  counter += 1;
  return {
    id: `s${counter}`,
    eventInstanceId: 'inst-1',
    discordUserId: `u${counter}`,
    discordUsername: `user${counter}`,
    role: 'DPS',
    className: 'Mage',
    spec: 'Fire',
    characterName: `Char${counter}`,
    signedUpAt: `2026-09-05T20:0${counter}:00.000Z`,
    ...over,
  };
}

/** Every field, as "name" => "value", in the order the embed lists them. */
function fields(signups: Signup[]): { name: string; value: string }[] {
  const embed = buildSignupEmbed(instance(), signups);

  return (embed.data.fields ?? []).map((f) => ({ name: f.name, value: f.value }));
}

describe('signup embed', () => {
  it('shows each line as "Nickname - Character" using the server nickname', () => {
    const line = fields([
      signup({ characterName: 'Blamethetank', discordNickname: 'Sham', role: 'Tank', className: 'Warrior', spec: 'Protection' }),
    ])
      .map((f) => f.value)
      .join('\n');

    // The Discord name is what the list is answering, so it carries the weight.
    expect(line).toContain('**Sham** - Blamethetank');
  });

  it('falls back to the username when no nickname was captured', () => {
    const line = fields([
      signup({ characterName: 'Oldsignup', discordUsername: 'legacyuser', discordNickname: undefined }),
    ])
      .map((f) => f.value)
      .join('\n');

    expect(line).toContain('**legacyuser** - Oldsignup');
  });

  it('splits the roster into Tanks, Healers and DPS in that order', () => {
    const names = fields([
      signup({ role: 'DPS', className: 'Mage', spec: 'Fire' }),
      signup({ role: 'Healer', className: 'Priest', spec: 'Holy' }),
      signup({ role: 'Tank', className: 'Warrior', spec: 'Protection' }),
    ]).map((f) => f.name);

    const tanks = names.findIndex((n) => n.includes('TANKS'));
    const healers = names.findIndex((n) => n.includes('HEALERS'));
    const dps = names.findIndex((n) => n.includes('DPS'));

    expect(tanks).toBeGreaterThanOrEqual(0);
    expect(healers).toBeGreaterThan(tanks);
    expect(dps).toBeGreaterThan(healers);
  });

  it('drops a bucket that nobody signed for', () => {
    const names = fields([
      signup({ role: 'Tank', className: 'Warrior', spec: 'Protection' }),
    ]).map((f) => f.name);

    expect(names.some((n) => n.includes('TANKS'))).toBe(true);
    expect(names.some((n) => n.includes('HEALERS'))).toBe(false);
    expect(names.some((n) => n.includes('DPS'))).toBe(false);
  });

  it('splits a bucket by class - tanks of different classes each get their own sub-field', () => {
    const names = fields([
      signup({ role: 'Tank', className: 'Warrior', spec: 'Protection' }),
      signup({ role: 'Tank', className: 'Paladin', spec: 'Protection' }),
      signup({ role: 'Tank', className: 'Druid', spec: 'Feral' }),
    ]).map((f) => f.name);

    expect(names.some((n) => n.includes('Warrior (1)'))).toBe(true);
    expect(names.some((n) => n.includes('Paladin (1)'))).toBe(true);
    expect(names.some((n) => n.includes('Druid (1)'))).toBe(true);
  });

  it('counts Tanks/Healers/DPS in the overview and leaves Fill out of it', () => {
    const summary = fields([
      signup({ role: 'Tank', className: 'Warrior', spec: 'Protection' }),
      signup({ role: 'Healer', className: 'Priest', spec: 'Holy' }),
      signup({ role: 'DPS', className: 'Mage', spec: 'Fire' }),
      signup({ role: 'DPS', className: 'Rogue', spec: 'Combat' }),
      signup({ role: 'Fill', className: 'Hunter', spec: 'Survival' }),
    ])
      .map((f) => f.value)
      .find((v) => v.includes('Tanks') && v.includes('Healers'));

    expect(summary).toContain('**1** Tanks');
    expect(summary).toContain('**1** Healers');
    expect(summary).toContain('**2** DPS');
  });
});

describe('signup embed within Discord limits', () => {
  /** A class full of people with long server names - what a bench night looks like. */
  function crowd(count: number, over: Partial<Signup> = {}): Signup[] {
    return Array.from({ length: count }, (_, i) =>
      signup({
        discordNickname: `A rather long nickname ${i + 1}`,
        characterName: `Character${i + 1}`,
        note: 'Can pull',
        className: 'Warrior',
        spec: 'Fury',
        ...over,
      }));
  }

  it('splits a class with too many lines for one field instead of throwing', () => {
    // Twenty warriors used to put the Warrior field past 1024 characters,
    // the builder threw, and the person who had just signed up was told
    // something went wrong.
    const all = fields(crowd(20));

    expect(all.every((f) => f.value.length <= 1024)).toBe(true);

    const warriors = all.filter((f) => f.name.includes('Warrior') || f.name === '\u200b');
    const text = warriors.map((f) => f.value).join('\n');

    for (let i = 1; i <= 20; i++) {
      expect(text).toContain(`Character${i}`);
    }
  });

  it('names the first part of a split class and leaves the rest blank', () => {
    const all = fields(crowd(20));
    const warriorAt = all.findIndex((f) => f.name.startsWith('<:') && f.name.includes('Warrior (20)'));

    expect(warriorAt).toBeGreaterThan(-1);
    expect(all[warriorAt + 1].name).toBe('\u200b');
  });

  it('falls back to one list per bucket rather than exceeding 25 fields', () => {
    // Every Alliance class in every bucket, fourteen deep: two fields each
    // once split, which is well past the twenty-five an embed may carry.
    const everybody = [
      ...crowd(14, { role: 'Tank', className: 'Warrior', spec: 'Protection' }),
      ...crowd(14, { role: 'Tank', className: 'Druid', spec: 'Feral' }),
      ...crowd(14, { role: 'Tank', className: 'Paladin', spec: 'Protection' }),
      ...crowd(14, { role: 'Healer', className: 'Priest', spec: 'Holy' }),
      ...crowd(14, { role: 'Healer', className: 'Paladin', spec: 'Holy' }),
      ...crowd(14, { role: 'Healer', className: 'Druid', spec: 'Restoration' }),
      ...crowd(14, { role: 'DPS', className: 'Warrior', spec: 'Fury' }),
      ...crowd(14, { role: 'DPS', className: 'Rogue', spec: 'Combat' }),
      ...crowd(14, { role: 'DPS', className: 'Hunter', spec: 'Marksmanship' }),
      ...crowd(14, { role: 'DPS', className: 'Mage', spec: 'Fire' }),
      ...crowd(14, { role: 'DPS', className: 'Warlock', spec: 'Destruction' }),
      ...crowd(14, { role: 'DPS', className: 'Druid', spec: 'Balance' }),
      ...crowd(14, { role: 'DPS', className: 'Priest', spec: 'Shadow' }),
      ...crowd(5, { role: 'Fill', className: 'Hunter', spec: 'Marksmanship' }),
      ...crowd(5, { role: 'Absence', className: 'Hunter', spec: 'Marksmanship' }),
    ];

    const all = fields(everybody);

    expect(all.length).toBeLessThanOrEqual(25);
    expect(all.every((f) => f.value.length <= 1024)).toBe(true);

    // Every name is still on the message, and the class headings have moved
    // inside the bucket's own list.
    const tanks = all.find((f) => f.name.includes('TANKS'));
    expect(tanks?.value).toContain('Warrior (14)**');

    const text = all.map((f) => `${f.name}\n${f.value}`).join('\n');
    expect((text.match(/Character\d+/g) ?? []).length).toBe(everybody.length);
  });

  it('keeps one field per class when it all fits', () => {
    const all = fields([
      ...crowd(3, { className: 'Warrior', spec: 'Fury' }),
      ...crowd(3, { className: 'Mage', spec: 'Fire' }),
    ]);

    // The info bar above the list has blank names of its own; nothing under
    // the first bucket header should.
    const listStart = all.findIndex((f) => f.name.includes('DPS  \u2014'));
    expect(listStart).toBeGreaterThan(-1);
    expect(all.slice(listStart).filter((f) => f.name === '\u200b')).toHaveLength(0);
    expect(all.some((f) => f.name.includes('Warrior (3)'))).toBe(true);
    expect(all.some((f) => f.name.includes('Mage (3)'))).toBe(true);
  });
});

describe('signup embed lists people under a role their class can fill', () => {
  /** The name of the bucket header a signup is listed under. */
  function bucketFor(over: Partial<Signup>): string {
    const all = fields([signup(over)]);
    const header = all.find((f) => f.name.includes('—'));

    return header?.name ?? '';
  }

  it('lists a rogue who picked Healer under DPS', () => {
    expect(bucketFor({ role: 'Healer', className: 'Rogue', spec: 'Combat' })).toContain('DPS');
  });

  it('lists a warlock who picked Tank under DPS', () => {
    expect(bucketFor({ role: 'Tank', className: 'Warlock', spec: 'Destruction' })).toContain('DPS');
  });

  it('lists a warrior who picked Healer under DPS, whatever their spec', () => {
    expect(bucketFor({ role: 'Healer', className: 'Warrior', spec: 'Fury' })).toContain('DPS');
    expect(bucketFor({ role: 'Healer', className: 'Warrior', spec: 'Protection' })).toContain('DPS');
  });

  it('keeps a role the class can fill, even when the spec picked is another', () => {
    // A druid can heal, so a Feral who picked Healer is taken at their word.
    expect(bucketFor({ role: 'Healer', className: 'Druid', spec: 'Feral' })).toContain('HEALERS');
    expect(bucketFor({ role: 'Tank', className: 'Warrior', spec: 'Fury' })).toContain('TANKS');
  });

  it('counts them where they are listed', () => {
    const summary = fields([
      signup({ role: 'Healer', className: 'Rogue', spec: 'Combat' }),
      signup({ role: 'Healer', className: 'Priest', spec: 'Holy' }),
    ]).find((f) => f.value.includes('Tanks'));

    expect(summary?.value).toContain('**1** Healers');
    expect(summary?.value).toContain('**1** DPS');
  });
});

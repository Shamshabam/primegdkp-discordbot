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
  it('shows each line as "Character - Nickname" using the server nickname', () => {
    const line = fields([
      signup({ characterName: 'Blamethetank', discordNickname: 'Sham', role: 'Tank', className: 'Warrior', spec: 'Protection' }),
    ])
      .map((f) => f.value)
      .join('\n');

    expect(line).toContain('**Blamethetank** — Sham');
  });

  it('falls back to the username when no nickname was captured', () => {
    const line = fields([
      signup({ characterName: 'Oldsignup', discordUsername: 'legacyuser', discordNickname: undefined }),
    ])
      .map((f) => f.value)
      .join('\n');

    expect(line).toContain('**Oldsignup** — legacyuser');
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

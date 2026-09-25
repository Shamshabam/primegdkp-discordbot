import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drawRoster, key, rosterNames } from '../src/roster.js';
import { JsonFileStore } from '../src/store/json-file-store.js';
import type { RosterGroups } from '../src/types.js';

const groups: RosterGroups = [
  [{ characterName: 'Missclick', className: 'Warrior' }, { characterName: 'Oliviaa', className: 'Rogue' }, null, null, null],
  [{ characterName: 'Interpol', className: 'Hunter' }, null, null, null, null],
];

describe('key', () => {
  it('folds the accents the roster and the signup disagree about', () => {
    // The raid leader types Missclick and the player signed up as Missclick
    // with an accent. One roster row, one person.
    expect(key('Missclìck')).toBe(key('Missclick'));
    expect(key('Interpøl')).toBe('interpol');
    expect(key('Mettemælk')).toBe('mettemaelk');
    expect(key("Al'lom")).toBe(key('Al´lóm'));
  });

  it('keeps different people apart', () => {
    expect(key('Oliviaa')).not.toBe(key('Olivia'));
  });
});

describe('rosterNames', () => {
  it('lists everybody on the roster and no empty seats', () => {
    expect(rosterNames(groups)).toEqual(new Set(['missclick', 'oliviaa', 'interpol']));
  });
});

describe('drawRoster', () => {
  it('draws a png', () => {
    const png = drawRoster(groups);

    expect(png.length).toBeGreaterThan(1000);
    // PNG magic number, so a blank or half-written buffer fails here.
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('draws something different once somebody answers', () => {
    // The whole point of moving this into the bot: the picture changes when a
    // button is pressed. Identical bytes would mean the box never got drawn.
    const before = drawRoster(groups);
    const after = drawRoster(groups, { missclick: 'confirmed' });

    expect(after.equals(before)).toBe(false);
  });

  it('draws a tick and a cross differently', () => {
    const confirmed = drawRoster(groups, { missclick: 'confirmed' });
    const cancelled = drawRoster(groups, { missclick: 'cancelled' });

    expect(confirmed.equals(cancelled)).toBe(false);
  });
});

describe('roster storage', () => {
  let dir: string;
  let store: JsonFileStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'roster-'));
    store = new JsonFileStore(join(dir, 'data.json'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const roster = {
    instanceId: 'evt-1',
    channelId: 'chan-1',
    messageId: 'msg-1',
    groups,
    confirmations: {},
    postedAt: '2026-09-25T18:00:00.000Z',
  };

  it('keeps a roster and hands it back', async () => {
    await store.saveRoster(roster);

    expect((await store.getRoster('evt-1'))?.messageId).toBe('msg-1');
  });

  it('records an answer against the character', async () => {
    await store.saveRoster(roster);
    await store.setConfirmation('evt-1', 'missclick', 'confirmed');

    expect((await store.getRoster('evt-1'))?.confirmations).toEqual({ missclick: 'confirmed' });
  });

  it('keeps answers when the roster is pushed again', async () => {
    // Moving somebody between groups is the raid leader organising, not the
    // people who already confirmed changing their minds.
    await store.saveRoster(roster);
    await store.setConfirmation('evt-1', 'missclick', 'confirmed');

    await store.saveRoster({ ...roster, groups: [[{ characterName: 'Missclick', className: 'Warrior' }, null, null, null, null]] });

    const after = await store.getRoster('evt-1');

    expect(after?.confirmations).toEqual({ missclick: 'confirmed' });
    expect(after?.groups[0]).toHaveLength(5);
  });

  it('has nothing to say about a raid with no roster', async () => {
    expect(await store.getRoster('nothing-here')).toBeUndefined();
  });
});

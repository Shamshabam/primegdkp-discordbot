import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSignupEmbed } from '../src/embeds/signup-embed.js';
import { JsonFileStore } from '../src/store/json-file-store.js';
import type { EventInstance, Signup } from '../src/types.js';

/**
 * Who signed up first, second and so on.
 *
 * The time somebody signed up was reset on every save, so editing a signup,
 * signing off, or the bot filling in a nickname sent the person to the back
 * of the numbering.
 */

const instance = {
    id: 'evt-1',
    guildId: 'g1',
    channelId: 'c1',
    title: 'Naxxramas Saturday',
    faction: 'alliance',
    scheduledFor: '2026-10-03T12:30:00.000Z',
    status: 'posted',
    roles: [],
} as unknown as EventInstance;

async function store(): Promise<JsonFileStore> {
    return new JsonFileStore(join(await mkdtemp(join(tmpdir(), 'order-')), 'data.json'));
}

function signup(userId: string, characterName: string, overrides: Partial<Signup> = {}): Omit<Signup, 'id' | 'signedUpAt'> {
    return {
        eventInstanceId: 'evt-1',
        discordUserId: userId,
        discordUsername: userId,
        role: 'DPS',
        className: 'Warrior',
        spec: 'Fury',
        characterName,
        ...overrides,
    };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function signThree(s: JsonFileStore): Promise<void> {
    await s.upsertSignup(signup('u1', 'First'));
    await tick();
    await s.upsertSignup(signup('u2', 'Second'));
    await tick();
    await s.upsertSignup(signup('u3', 'Third'));
    await tick();
}

/** The names in the embed, in the order their numbers put them. */
function numbered(signups: Signup[]): string[] {
    const text = JSON.stringify(buildSignupEmbed(instance, signups).toJSON());

    return [...text.matchAll(/` ?(\d+)` [^-]*- (\w+)/g)]
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map((m) => m[2]);
}

describe('the signup order', () => {
    it('keeps somebody in place when they edit their signup', async () => {
        const s = await store();
        await signThree(s);

        await s.upsertSignup(signup('u1', 'First', { spec: 'Arms' }));

        expect(numbered(await s.listSignups('evt-1'))).toEqual(['First', 'Second', 'Third']);
    });

    it('keeps somebody in place when the bot fills in their nickname', async () => {
        const s = await store();
        await signThree(s);

        await s.upsertSignup(signup('u1', 'First', { discordNickname: 'Sham' }));

        const signups = await s.listSignups('evt-1');
        expect(signups.find((x) => x.discordUserId === 'u1')?.discordNickname).toBe('Sham');
        expect(numbered(signups)).toEqual(['First', 'Second', 'Third']);
    });

    it('gives somebody who signs off and comes back their first place', async () => {
        const s = await store();
        await signThree(s);

        await s.upsertSignup(signup('u1', 'First', { role: 'Absence' }));
        await tick();
        await s.upsertSignup(signup('u1', 'First'));

        expect(numbered(await s.listSignups('evt-1'))).toEqual(['First', 'Second', 'Third']);
    });
});

describe('the signup history', () => {
    it('records every sign-up, change and sign-off in order, and keeps it after a removal', async () => {
        const s = await store();
        await signThree(s);

        await s.upsertSignup(signup('u2', 'Second', { spec: 'Protection', role: 'Tank' }));
        await s.upsertSignup(signup('u3', 'Third', { role: 'Absence' }));
        await s.upsertSignup(signup('u3', 'Third'));
        await s.removeSignup('evt-1', 'u1');

        const log = await s.listSignupLog('evt-1');
        expect(log.map((e) => `${e.characterName} ${e.action}`)).toEqual([
            'First signed_up',
            'Second signed_up',
            'Third signed_up',
            'Second changed',
            'Third signed_off',
            'Third signed_up_again',
            'First removed',
        ]);
        expect(log.every((e) => typeof e.at === 'string' && e.at !== '')).toBe(true);
    });

    it('records nothing for a save that changes nothing about the signup', async () => {
        const s = await store();
        await s.upsertSignup(signup('u1', 'First'));

        await s.upsertSignup(signup('u1', 'First', { discordNickname: 'Sham' }));

        expect((await s.listSignupLog('evt-1')).length).toBe(1);
    });
});

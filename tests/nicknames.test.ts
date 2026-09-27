import { describe, expect, it, vi } from 'vitest';
import { backfillNicknames } from '../src/nicknames.js';
import type { Signup } from '../src/types.js';
import type { SignupStore } from '../src/store/signup-store.js';

/**
 * Signups taken before the server nickname was recorded still showed a raw
 * Discord username, which is not what anybody is called in the channel.
 */

function signup(overrides: Partial<Signup>): Signup {
    return {
        id: 's1',
        eventInstanceId: 'evt-1',
        discordUserId: 'u1',
        discordUsername: 'morpanos',
        role: 'DPS',
        className: 'Warrior',
        spec: 'Fury',
        characterName: 'Skipz',
        signedUpAt: '2026-09-01T00:00:00.000Z',
        ...overrides,
    };
}

function clientWith(members: Record<string, string>, onFetchGuild?: () => never) {
    return {
        guilds: {
            fetch: vi.fn(async () => {
                onFetchGuild?.();

                return {
                    members: {
                        fetch: vi.fn(async (id: string) => {
                            if (! members[id]) {
                                throw new Error('Unknown Member');
                            }

                            return { displayName: members[id] };
                        }),
                    },
                };
            }),
        },
    } as never;
}

function storeSpy() {
    const saved: Signup[] = [];

    return {
        store: { upsertSignup: async (s: Signup) => { saved.push(s); return s; } } as unknown as SignupStore,
        saved,
    };
}

describe('filling in server nicknames', () => {
    it('looks up the people who have none', async () => {
        const { store } = storeSpy();

        const filled = await backfillNicknames(
            clientWith({ u1: 'Skipz' }),
            store,
            'g1',
            [signup({})],
        );

        expect(filled[0].discordNickname).toBe('Skipz');
    });

    it('writes what it found back, so it is paid once', async () => {
        const { store, saved } = storeSpy();

        await backfillNicknames(clientWith({ u1: 'Skipz' }), store, 'g1', [signup({})]);

        expect(saved).toHaveLength(1);
        expect(saved[0].discordNickname).toBe('Skipz');
    });

    it('leaves a nickname that is already recorded alone', async () => {
        const { store, saved } = storeSpy();
        const client = clientWith({ u1: 'Something else' });

        const filled = await backfillNicknames(
            client,
            store,
            'g1',
            [signup({ discordNickname: 'Skipz' })],
        );

        expect(filled[0].discordNickname).toBe('Skipz');
        expect(saved).toHaveLength(0);
        expect(client.guilds.fetch).not.toHaveBeenCalled();
    });

    it('keeps the rest when one person cannot be looked up', async () => {
        // Somebody who has left the server must not cost everybody else theirs.
        const { store } = storeSpy();

        const filled = await backfillNicknames(
            clientWith({ u2: 'Miaana' }),
            store,
            'g1',
            [signup({ id: 's1', discordUserId: 'u1' }), signup({ id: 's2', discordUserId: 'u2' })],
        );

        expect(filled[0].discordNickname).toBeUndefined();
        expect(filled[1].discordNickname).toBe('Miaana');
    });

    it('hands the signups straight back when the guild cannot be read', async () => {
        const { store } = storeSpy();

        const filled = await backfillNicknames(
            clientWith({}, () => { throw new Error('Missing Access'); }),
            store,
            'g1',
            [signup({})],
        );

        expect(filled[0].discordUsername).toBe('morpanos');
    });

    it('asks for one person once, however many times they signed up', async () => {
        const { store } = storeSpy();
        const client = clientWith({ u1: 'Skipz' });

        await backfillNicknames(client, store, 'g1', [
            signup({ id: 's1' }),
            signup({ id: 's2' }),
        ]);

        expect(client.guilds.fetch).toHaveBeenCalledTimes(1);
    });
});

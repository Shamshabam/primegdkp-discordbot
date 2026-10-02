import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/signup-service.js', () => ({ refreshSignupMessage: vi.fn(async () => undefined) }));

import { handleModalSubmit } from '../src/handlers/modal-submit.js';
import { JsonFileStore } from '../src/store/json-file-store.js';
import type { EventInstance } from '../src/types.js';

/**
 * A world tour asks about douses after the character name. Anybody who
 * closed that question without answering used to not be signed up at all,
 * because the signup was only saved once they picked.
 */

async function storeWith(title: string): Promise<JsonFileStore> {
    const store = new JsonFileStore(join(await mkdtemp(join(tmpdir(), 'douse-')), 'data.json'));

    await store.createInstance({
        id: 'evt-1',
        guildId: 'g1',
        channelId: 'c1',
        title,
        faction: 'Alliance',
        scheduledFor: '2026-10-02T20:00:00.000Z',
        status: 'posted',
    } as unknown as EventInstance);

    return store;
}

function modal(characterName: string) {
    const reply = vi.fn(async () => undefined);

    return {
        reply,
        interaction: {
            customId: 'charname:evt-1:DPS:Warrior:Fury',
            user: { id: 'u1', username: 'morpanos' },
            member: null,
            client: {},
            fields: {
                getTextInputValue: (id: string) => (id === 'character_name' ? characterName : ''),
            },
            reply,
        } as never,
    };
}

describe('signing up for a world tour', () => {
    it('signs them up with no douses before the question is answered', async () => {
        const store = await storeWith('Friday World Tour');
        const { interaction, reply } = modal('Skipz');

        await handleModalSubmit(interaction, store);

        const [signup] = await store.listSignups('evt-1');
        expect(signup.characterName).toBe('Skipz');
        expect(signup.douses).toBe(0);

        // The question is still asked.
        expect(JSON.stringify(reply.mock.calls[0])).toContain('douse:evt-1');
    });

    it('records the answer without moving them down the signup order', async () => {
        const store = await storeWith('Friday World Tour');

        await handleModalSubmit(modal('Skipz').interaction, store);
        const [before] = await store.listSignups('evt-1');

        const after = await store.setDouses('evt-1', 'u1', 2);

        expect(after?.douses).toBe(2);
        expect(after?.signedUpAt).toBe(before.signedUpAt);
    });

    it('keeps an earlier answer when somebody edits their signup', async () => {
        const store = await storeWith('Friday World Tour');

        await handleModalSubmit(modal('Skipz').interaction, store);
        await store.setDouses('evt-1', 'u1', 2);
        await handleModalSubmit(modal('Skipzz').interaction, store);

        const [signup] = await store.listSignups('evt-1');
        expect(signup.characterName).toBe('Skipzz');
        expect(signup.douses).toBe(2);
    });

    it('has nothing to record for somebody who is not signed up', async () => {
        const store = await storeWith('Friday World Tour');

        expect(await store.setDouses('evt-1', 'nobody', 1)).toBeUndefined();
    });

    it('asks nothing about douses on any other raid', async () => {
        const store = await storeWith('Naxxramas Saturday');
        const { interaction, reply } = modal('Skipz');

        await handleModalSubmit(interaction, store);

        const [signup] = await store.listSignups('evt-1');
        expect(signup.douses).toBeUndefined();
        expect(JSON.stringify(reply.mock.calls[0])).not.toContain('douse:');
    });
});

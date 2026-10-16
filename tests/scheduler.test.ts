import { describe, expect, it } from 'vitest';
import { decide, postTimeOf } from '../src/scheduler.js';
import type { EventTemplate } from '../src/types.js';

const template = (overrides: Partial<EventTemplate> = {}): EventTemplate => ({
  id: 't1',
  guildId: 'g',
  channelId: 'c',
  title: 'Naxx GDKP',
  faction: 'horde',
  roles: ['Tank', 'Healer', 'DPS'],
  schedule: { dayOfWeek: 3, hour: 19, minute: 30, timezone: 'UTC' },
  // Wednesday 2026-03-11 19:30
  nextFireAt: '2026-03-11T19:30:00.000Z',
  createdBy: 'u',
  createdAt: '2026-03-01T00:00:00.000Z',
  ...overrides,
});

// Posted an hour after the previous week's raid, for the one after.
const WED_2030 = { dayOfWeek: 3, hour: 20, minute: 30 };

describe('postTimeOf', () => {
  it('is the raid time itself when no lead is set, the way older templates behaved', () => {
    expect(postTimeOf(template()).toISOString()).toBe('2026-03-11T19:30:00.000Z');
  });

  it('is the last time the post day and time come round before the raid', () => {
    expect(postTimeOf(template({ postAt: WED_2030 })).toISOString()).toBe('2026-03-04T20:30:00.000Z');
    // A post time two days ahead of the raid day.
    expect(postTimeOf(template({ postAt: { dayOfWeek: 1, hour: 12, minute: 0 } })).toISOString()).toBe('2026-03-09T12:00:00.000Z');
    // The raid's own day and time means the raid moment itself.
    expect(postTimeOf(template({ postAt: { dayOfWeek: 3, hour: 19, minute: 30 } })).toISOString()).toBe('2026-03-11T19:30:00.000Z');
  });
});

describe('decide', () => {
  it('waits while the post time is still ahead', () => {
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-04T20:29:00Z'), [])).toBe('wait');
  });

  it('posts once the post time has come and the raid is still ahead', () => {
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-04T20:30:00Z'), [])).toBe('post');
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-07T12:00:00Z'), [])).toBe('post');
  });

  it('posts at the raid time when there is no lead, the way older templates behaved', () => {
    expect(decide(template(), new Date('2026-03-11T19:29:00Z'), [])).toBe('wait');
    expect(decide(template(), new Date('2026-03-11T19:30:00Z'), [])).toBe('post');
    expect(decide(template(), new Date('2026-03-11T19:31:00Z'), [])).toBe('post');
  });

  it('gives up on a raid six hours after its start rather than posting for last night', () => {
    expect(decide(template(), new Date('2026-03-12T01:29:00Z'), [])).toBe('post');
    expect(decide(template(), new Date('2026-03-12T01:30:00Z'), [])).toBe('skip');
  });

  it('does not post the same raid twice', () => {
    const posted = [{ templateId: 't1', scheduledFor: '2026-03-11T19:30:00.000Z' }];
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-07T12:00:00Z'), posted)).toBe('wait');
  });

  it('skips a raid whose start has gone by, so the week rolls on without a stale post', () => {
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-12T12:00:00Z'), [])).toBe('skip');
  });

  it('does not post for a template that is switched off, but still rolls it past an old raid', () => {
    expect(decide(template({ postAt: WED_2030, enabled: false }), new Date('2026-03-07T12:00:00Z'), [])).toBe('wait');
    expect(decide(template({ postAt: WED_2030, enabled: false }), new Date('2026-03-12T12:00:00Z'), [])).toBe('skip');
  });
});

/**
 * The template moves on the moment its raid starts, so the following week's
 * signup can go up when it is meant to. Holding the old raid for six hours
 * held next week's post for six hours too.
 */
describe('rolling on to next week', () => {
  const posted = [{ templateId: 't1', scheduledFor: '2026-03-11T19:30:00.000Z' }];

  it('rolls past a raid the moment it starts, once its signup went up', () => {
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-11T19:29:00Z'), posted)).toBe('wait');
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-11T19:30:00Z'), posted)).toBe('skip');
  });

  it('keeps the six hour grace for a raid whose signup never went up', () => {
    // The bot may have been down at the one minute it could have posted, and
    // a late signup beats none.
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-11T19:30:00Z'), [])).toBe('post');
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-12T01:29:00Z'), [])).toBe('post');
    expect(decide(template({ postAt: WED_2030 }), new Date('2026-03-12T01:30:00Z'), [])).toBe('skip');
  });

  it('still posts a no-lead template at its raid time before rolling it', () => {
    // Post time and raid time are the same minute here. The post has to win
    // that tick, and the roll the one after.
    expect(decide(template(), new Date('2026-03-11T19:30:00Z'), [])).toBe('post');
    expect(decide(template(), new Date('2026-03-11T19:31:00Z'), posted)).toBe('skip');
  });

  it('rolls a switched-off template past its raid at the start too', () => {
    // Nothing will go up for it, so there is nothing to keep the old raid for.
    expect(decide(template({ postAt: WED_2030, enabled: false }), new Date('2026-03-11T19:30:00Z'), [])).toBe('skip');
  });

  it('lets next week go up at its own post time, which is what the six hours cost', () => {
    // Friday World Tour: raid 22:00, signup for the following week 23:00 the
    // same evening. Everything in UTC here; the shape is what matters.
    const worldTour = (nextFireAt: string) => template({
      schedule: { dayOfWeek: 5, hour: 22, minute: 0, timezone: 'UTC' },
      postAt: { dayOfWeek: 5, hour: 23, minute: 0 },
      nextFireAt,
    });
    const thisWeek = '2026-10-16T22:00:00.000Z';
    const nextWeek = '2026-10-23T22:00:00.000Z';
    const thisWeekPosted = [{ templateId: 't1', scheduledFor: thisWeek }];

    // 22:00 Friday: the raid starts and the template rolls.
    expect(decide(worldTour(thisWeek), new Date('2026-10-16T22:00:00Z'), thisWeekPosted)).toBe('skip');
    // 22:01: now pointing at next week, whose post time has not come yet.
    expect(decide(worldTour(nextWeek), new Date('2026-10-16T22:01:00Z'), thisWeekPosted)).toBe('wait');
    // 23:00: next week's signup goes up, Friday night, not four on Saturday morning.
    expect(decide(worldTour(nextWeek), new Date('2026-10-16T23:00:00Z'), thisWeekPosted)).toBe('post');
  });
});

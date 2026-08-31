import { describe, expect, it } from 'vitest';
import { nextOccurrence } from '../src/schedule/next-occurrence.js';

describe('nextOccurrence', () => {
  it('picks the same day later today if the time has not passed yet', () => {
    // Wednesday 2026-03-04 10:00 UTC
    const after = new Date('2026-03-04T10:00:00Z');
    const next = nextOccurrence({ dayOfWeek: 3, hour: 19, minute: 30, timezone: 'UTC' }, after);
    expect(next.toISOString()).toBe('2026-03-04T19:30:00.000Z');
  });

  it('rolls over to next week if the time already passed today', () => {
    const after = new Date('2026-03-04T20:00:00Z');
    const next = nextOccurrence({ dayOfWeek: 3, hour: 19, minute: 30, timezone: 'UTC' }, after);
    expect(next.toISOString()).toBe('2026-03-11T19:30:00.000Z');
  });

  it('finds the next matching weekday when it is not today', () => {
    // Wednesday -> next Friday
    const after = new Date('2026-03-04T10:00:00Z');
    const next = nextOccurrence({ dayOfWeek: 5, hour: 19, minute: 30, timezone: 'UTC' }, after);
    expect(next.toISOString()).toBe('2026-03-06T19:30:00.000Z');
  });

  it('accounts for a non-UTC timezone offset', () => {
    // 19:30 in Europe/Copenhagen (UTC+1 in March before DST) is 18:30 UTC
    const after = new Date('2026-03-04T10:00:00Z');
    const next = nextOccurrence({ dayOfWeek: 3, hour: 19, minute: 30, timezone: 'Europe/Copenhagen' }, after);
    expect(next.toISOString()).toBe('2026-03-04T18:30:00.000Z');
  });
});

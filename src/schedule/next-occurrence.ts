import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, isAfter } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { WeeklySchedule } from '../types.js';

/**
 * Computes the next time this weekly schedule should fire, strictly after `after`.
 * Does the day/hour math in the schedule's own timezone so DST shifts don't skew the wall-clock time.
 */
export function nextOccurrence(schedule: WeeklySchedule, after: Date = new Date()): Date {
  const zonedNow = toZonedTime(after, schedule.timezone);

  let candidate = setMilliseconds(
    setSeconds(setMinutes(setHours(zonedNow, schedule.hour), schedule.minute), 0),
    0,
  );

  const dayDiff = (schedule.dayOfWeek - candidate.getDay() + 7) % 7;
  candidate = addDays(candidate, dayDiff);

  if (!isAfter(candidate, zonedNow)) {
    candidate = addDays(candidate, 7);
  }

  return fromZonedTime(candidate, schedule.timezone);
}

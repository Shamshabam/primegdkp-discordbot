import { randomUUID } from 'node:crypto';
import { subDays } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ChannelType, type Client } from 'discord.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import { nextOccurrence } from './schedule/next-occurrence.js';
import { refreshSignupMessage } from './signup-service.js';
import type { SignupStore } from './store/signup-store.js';
import type { EventInstance, EventTemplate } from './types.js';

const CHECK_INTERVAL_MS = 60_000;
/**
 * How long after a raid's start its signup may still go up, if it never did. A
 * template with no lead posts at the raid's own time, so the start itself
 * cannot mean "too late"; a bot that was down for a day should not post for
 * last night either.
 *
 * Only for a raid whose signup is missing. One that went up moves on the
 * moment the raid starts - see decide().
 */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Polls every minute for templates whose signup is due and posts a fresh signup message for each. */
export function startScheduler(client: Client, store: SignupStore): NodeJS.Timeout {
  const tick = () => checkAndPost(client, store).catch((error) => console.error('Scheduler tick failed:', error));
  tick();
  return setInterval(tick, CHECK_INTERVAL_MS);
}

/**
 * When the signup for the template's next raid goes up: the last time the
 * post day and time come round in the week before the raid, up to and
 * including the raid's own moment. With no post time set it is the raid time.
 *
 * "The week before" is seven days on the raid's own clock, not seven times
 * twenty-four hours. The clocks went back on a Sunday between a Wednesday
 * raid and the Wednesday before it, so 19:00 one week was 20:00 the other
 * in Copenhagen: the search started exactly on the post minute, "strictly
 * after" pushed it a week on to the far side of the raid, and the scheduler
 * waited for a post time that came after the raid it was for - then rolled
 * past the raid without ever posting. Every template whose week spanned the
 * change did the same.
 */
export function postTimeOf(template: Pick<EventTemplate, 'nextFireAt' | 'postAt' | 'schedule'>): Date {
  const raidAt = new Date(template.nextFireAt);
  if (!template.postAt) return raidAt;

  const timezone = template.schedule.timezone;
  const aWeekBefore = fromZonedTime(subDays(toZonedTime(raidAt, timezone), 7), timezone);

  return nextOccurrence({ ...template.postAt, timezone }, aWeekBefore);
}

/**
 * What to do with a template on a tick: post the signup for its next raid,
 * roll past a raid that is already over, or leave it alone until it is due.
 *
 * A raid that has started is over as far as signups go. Its signup went up,
 * people came, and the template moves on to the week after - straight away,
 * because the following week's post cannot go up until it does. Holding the
 * old raid for six hours after it started held next week's signup for six
 * hours too: a Friday raid with its post at 23:00 Friday went up at four on
 * Saturday morning, every week, and read as never having gone up at all.
 *
 * A raid whose signup never went up keeps the grace: the bot may have been
 * down at the only minute it could have posted, and a late signup beats
 * none. Six hours on it is let go rather than posted for last night.
 *
 * One that is due is posted once: a second tick within the same window, or a
 * lead time shortened after the post went up, finds the instance already
 * there and does nothing.
 */
export function decide(
  template: EventTemplate,
  now: Date,
  posted: Pick<EventInstance, 'templateId' | 'scheduledFor'>[],
): 'wait' | 'post' | 'skip' {
  const raidAt = new Date(template.nextFireAt);
  const alreadyPosted = posted.some((i) => i.templateId === template.id && i.scheduledFor === template.nextFireAt);
  const nothingToPost = alreadyPosted || template.enabled === false;

  if (raidAt.getTime() <= now.getTime() && nothingToPost) return 'skip';
  if (raidAt.getTime() + STALE_AFTER_MS <= now.getTime()) return 'skip';
  if (postTimeOf(template).getTime() > now.getTime()) return 'wait';
  if (template.enabled === false) return 'wait';
  if (alreadyPosted) return 'wait';

  return 'post';
}

/**
 * Whether a signup's raid is over, as far as signing up goes.
 *
 * The same six hours the website gives a raid before it stops being "one you
 * are running": by then the raid has happened, and a Sign Up press is for the
 * week after - on the week after's post, not this one.
 */
export function isFinished(instance: Pick<EventInstance, 'scheduledFor'>, now: Date): boolean {
  return new Date(instance.scheduledFor).getTime() + STALE_AFTER_MS <= now.getTime();
}

/**
 * Close every signup whose raid is over, and grey out its buttons.
 *
 * Nothing ever closed one. Every signup post the bot had ever made kept its
 * buttons live, and a raider pressed Sign Up on last week's Saturday post,
 * got "Signed up as ..." back, and was on nobody's roster for this week.
 * The button handler has refused a closed signup all along; this is the
 * missing half that makes one closed.
 *
 * The post is redrawn so the buttons show disabled. A post that has since
 * been deleted is simply closed in the store - which is also what stops the
 * bot redrawing it on every restart.
 */
export async function closeFinishedSignups(client: Client, store: SignupStore, now: Date): Promise<number> {
  let closed = 0;

  for (const instance of await store.listOpenInstances()) {
    if (!isFinished(instance, now)) continue;

    await store.updateInstance(instance.id, { status: 'closed' });
    closed++;

    try {
      await refreshSignupMessage(client, store, instance.id);
    } catch (error) {
      console.error(`Closed signup ${instance.id} but could not redraw its post:`, error);
    }
  }

  return closed;
}

async function checkAndPost(client: Client, store: SignupStore): Promise<void> {
  const now = new Date();

  await closeFinishedSignups(client, store, now);

  const open = await store.listOpenInstances();

  for (const guild of client.guilds.cache.values()) {
    const templates = await store.listTemplates(guild.id);

    for (const template of templates) {
      const action = decide(template, now, open);

      if (action === 'post') {
        try {
          await postInstance(client, store, template);
        } catch (error) {
          console.error(`Failed to post recurring event ${template.id}:`, error);
        }
      } else if (action === 'skip') {
        // The raid is over; the next one is a week on, whether or not the
        // template is switched on. A template switched off keeps rolling so
        // switching it back on does not fire every missed week at once.
        const next = nextOccurrence(template.schedule, new Date(template.nextFireAt));
        await store.updateTemplate(template.id, { nextFireAt: next.toISOString() });
      }
    }
  }
}

/** Posts the signup for the template's next raid and records the instance. */
export async function postInstance(client: Client, store: SignupStore, template: EventTemplate): Promise<EventInstance> {
  const channel = await client.channels.fetch(template.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(`Channel ${template.channelId} is not a postable text channel`);
  }

  const instanceId = randomUUID();
  const draft: EventInstance = {
    id: instanceId,
    templateId: template.id,
    guildId: template.guildId,
    channelId: template.channelId,
    messageId: '',
    title: template.title,
    description: template.description,
    faction: template.faction,
    roles: template.roles,
    scheduledFor: template.nextFireAt,
    postedAt: new Date().toISOString(),
    status: 'posted' as const,
  };

  const message = await channel.send({
    embeds: [buildSignupEmbed(draft, [])],
    components: [buildSignupButtons(instanceId, false)],
  });

  return store.createInstance({ ...draft, messageId: message.id });
}

import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { AttachmentBuilder, ChannelType, Client, TextChannel } from 'discord.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import { buildMissingMessage } from './missing-roster.js';
import { MemberListUnavailable, membersWithRoles } from './role-members.js';
import { lootHistoryAttachment } from './loot-history-image.js';
import { refreshSignupMessage } from './signup-service.js';
import { buildRosterButtons, rosterAttachment } from './roster-service.js';
import { key } from './roster.js';
import type { SignupStore } from './store/signup-store.js';
import { nextOccurrence } from './schedule/next-occurrence.js';
import { postInstance } from './scheduler.js';
import type { EventInstance, EventTemplate } from './types.js';

const postSignupSchema = z.object({
  channelId: z.string(),
  title: z.string().max(256),
  faction: z.string(),
  scheduledFor: z.string(),
  roles: z.array(z.string()).optional(),
  description: z.string().optional(),
});

/**
 * What the website may change about a signup that is already posted: what it is
 * called and when it starts. Everything else about the post - who has signed
 * up, which channel it is in, which message it is - is not a correction, it is
 * a different post.
 */
const updateInstanceSchema = z.object({
  title: z.string().max(256).optional(),
  scheduledFor: z.string().optional(),
}).refine((v) => v.title !== undefined || v.scheduledFor !== undefined, {
  message: 'Nothing to change',
});

/**
 * What the roster is still short of. Sent as the positions rather than as a
 * finished sentence: the icons are class emoji this bot uploaded, and the
 * website has no way of knowing what they are called.
 */
const postMissingSchema = z.object({
  channelId: z.string(),
  // The message to correct. Absent the first time, and then kept by the
  // website, so re-pushing a roster edits what is already in the channel
  // instead of leaving another wrong copy of it above the new one.
  messageId: z.string().optional(),
  raidTitle: z.string().max(200),
  missingSlots: z.array(z.object({
    label: z.string().max(50),
    count: z.number().int().min(0).max(99),
    note: z.string().max(200).optional(),
  })),
  extraMessage: z.string().max(1500).optional(),
  // When the raid pulls. The invite and replacement times come off it.
  scheduledFor: z.string().optional(),
  // Which raid it is, which decides what people are told to bring.
  raidType: z.string().max(50).optional(),
  // Who to message about this roster, named at the bottom of the post.
  contacts: z.array(z.object({
    id: z.string().regex(/^\d{5,25}$/),
    name: z.string().max(100),
  })).max(10).optional(),
});

/**
 * A raid's loot, posted when its gold sheet is finalised. Sent as the sales
 * rather than as a finished block of text, so the bot decides how it reads.
 */
const postLootHistorySchema = z.object({
  channelId: z.string(),
  // The post to correct. Kept by the website, so finalising a sheet again
  // after fixing a price edits what is in the channel rather than posting a
  // second list beside the wrong one.
  messageId: z.string().optional(),
  raidName: z.string().max(200),
  date: z.string().max(60),
  totalPot: z.number().int().min(0),
  items: z.array(z.object({
    item: z.string().max(200),
    buyer: z.string().max(100),
    gold: z.number().int().min(0),
    quality: z.number().int().min(0).max(6).optional(),
    className: z.string().max(40).optional(),
    icon: z.string().max(64).optional(),
  })).max(500),
});

const postMessageSchema = z.object({
  channelId: z.string(),
  content: z.string().max(2000),
});

const postImageSchema = z.object({
  channelId: z.string(),
  imageBase64: z.string().max(15_000_000),
  filename: z.string().optional(),
  content: z.string().optional(),
});

const rosterPlayerSchema = z.object({
  characterName: z.string().min(1).max(32),
  className: z.string().max(32).default(''),
  spec: z.string().max(32).optional(),
});

const postRosterSchema = z.object({
  channelId: z.string(),
  /** The signup event, so the Sign up button reaches the same place the signup message does. */
  instanceId: z.string(),
  groups: z.array(z.array(rosterPlayerSchema.nullable())).max(8),
});

const updateMessageSchema = z.object({
  channelId: z.string(),
  messageId: z.string(),
  content: z.string().max(2000).optional(),
  imageBase64: z.string().max(15_000_000).optional(),
  filename: z.string().max(255).optional(),
});

const weeklyScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  timezone: z.string().max(64).optional(),
});

/** What the website may change about a recurring post. */
const templatePatchSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
  channelId: z.string().optional(),
  faction: z.enum(['horde', 'alliance']).optional(),
  roles: z.array(z.string().min(1).max(32)).min(1).max(10).optional(),
  raidType: z.string().max(64).optional(),
  postAt: weeklyScheduleSchema.omit({ timezone: true }).optional(),
  schedule: weeklyScheduleSchema.optional(),
});

/** A recurring post set up from the website rather than with /prime create. */
const templateCreateSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  title: z.string().min(1).max(256),
  description: z.string().max(2000).nullable().optional(),
  faction: z.enum(['horde', 'alliance']),
  roles: z.array(z.string().min(1).max(32)).min(1).max(10).optional(),
  raidType: z.string().max(64).optional(),
  postAt: weeklyScheduleSchema.omit({ timezone: true }).optional(),
  schedule: weeklyScheduleSchema,
  /** Put the signup for the next raid up right away, as /prime create does. */
  postNow: z.boolean().optional(),
  createdBy: z.string().max(64).optional(),
});

const ticketSchema = z.object({
  discordName: z.string().max(100),
  category: z.string().optional(),
  subject: z.string().max(200),
  message: z.string().max(1024),
  ticketId: z.string(),
  channelId: z.string(),
});

export function startApiServer(client: Client, store: SignupStore, config: Config): void {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(rateLimit({ windowMs: 60 * 1000, max: 60 }));
  app.use(cors({ origin: process.env.WEBSITE_URL || 'https://primegdkp.com' }));

  /**
   * Which build is answering, and since when.
   *
   * Registered before the key check on purpose: this exists to be asked from
   * an SSH session when something is wrong, and needing to dig the key out of
   * .env first is exactly the friction that stops it being asked. It says
   * nothing a caller does not already know - the routes are in a public
   * repository - and it only listens on 127.0.0.1.
   */
  app.get('/api/health', (_req, res) => {
    res.json({
      startedAt: startedAt.toISOString(),
      routes: listRoutes(app),
    });
  });

  app.use((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!config.apiKey || !key) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const keyBuf = Buffer.from(String(key));
      const expectedBuf = Buffer.from(config.apiKey);
      if (keyBuf.length !== expectedBuf.length || !timingSafeEqual(keyBuf, expectedBuf)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.get('/api/guilds', async (_req, res) => {
    try {
      const guilds = client.guilds.cache.map((g) => ({ id: g.id, name: g.name }));
      res.json({ guilds });
    } catch {
      res.status(500).json({ error: 'Failed to list guilds' });
    }
  });

  app.get('/api/channels/:guildId', async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      const channels = await guild.channels.fetch();
      const textChannels = channels
        .filter((ch) => ch !== null && ch.type === ChannelType.GuildText)
        .map((ch) => ({ id: ch!.id, name: ch!.name }));
      res.json({ channels: Array.from(textChannels.values()) });
    } catch {
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  });

  /**
   * Change a signup that is already up.
   *
   * The embed is drawn from the stored event every time it is edited, so
   * correcting the event and re-rendering is all it takes - the post keeps its
   * id, its buttons and everybody who has already signed up.
   */
  app.patch('/api/instances/:instanceId', async (req, res) => {
    const parsed = updateInstanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    try {
      const updated = await store.updateInstance(req.params.instanceId, parsed.data);

      if (!updated) {
        res.status(404).json({ error: 'No such event' });
        return;
      }

      await refreshSignupMessage(client, store, updated.id);

      res.json({ success: true, instance: updated });
    } catch (err) {
      console.error('Failed to update instance:', err);
      res.status(500).json({ error: 'Failed to update instance' });
    }
  });

  app.post('/api/post-signup', async (req, res) => {
    const parsed = postSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }
    const { channelId, title, faction, scheduledFor, roles, description } = parsed.data;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        res.status(400).json({ error: 'Invalid text channel' });
        return;
      }

      const textChannel = channel as TextChannel;
      const instanceId = randomUUID();
      const instance: EventInstance = {
        id: instanceId,
        templateId: '',
        guildId: textChannel.guildId,
        channelId,
        messageId: '',
        title,
        description,
        faction: (faction || 'alliance') as EventInstance['faction'],
        roles: roles || ['Tank', 'Healer', 'DPS', 'Fill'],
        scheduledFor,
        postedAt: new Date().toISOString(),
        status: 'posted',
      };

      const embed = buildSignupEmbed(instance, []);
      const buttons = buildSignupButtons(instanceId, false);
      const message = await textChannel.send({ embeds: [embed], components: [buttons] });

      instance.messageId = message.id;
      await store.createInstance(instance);

      res.json({ instanceId, messageId: message.id, channelId });
    } catch (err) {
      console.error('Failed to post signup:', err);
      res.status(500).json({ error: 'Failed to post signup' });
    }
  });

  app.post('/api/post-image', async (req, res) => {
    const parsed = postImageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }
    const { channelId, imageBase64, filename, content } = parsed.data;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid channel' });
        return;
      }

      const buffer = Buffer.from(imageBase64, 'base64');
      const attachment = new AttachmentBuilder(buffer, { name: filename || 'roster.png' });
      const message = await (channel as TextChannel).send({
        content: content || undefined,
        files: [attachment],
      });

      res.json({ messageId: message.id });
    } catch (err) {
      console.error('Failed to post image:', err);
      res.status(500).json({ error: 'Failed to post image' });
    }
  });

  /**
   * Post or update the raid roster.
   *
   * The website sends the roster itself rather than a picture of it, because
   * the picture has to be redrawn whenever somebody presses Confirm - and a
   * canvas in a browser nobody has open cannot be asked to do that.
   */
  app.post('/api/post-roster', async (req, res) => {
    const parsed = postRosterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { channelId, instanceId, groups } = parsed.data;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid channel' });
        return;
      }

      const existing = await store.getRoster(instanceId);
      const instance = await store.getInstance(instanceId);
      const roster = {
        instanceId,
        channelId,
        messageId: existing?.messageId ?? '',
        groups,
        // Answers already given survive a re-push: moving somebody between
        // groups is the raid leader organising, not that player un-confirming.
        confirmations: existing?.confirmations ?? {},
        postedAt: existing?.postedAt ?? new Date().toISOString(),
      };

      const components = [buildRosterButtons(instanceId, instance?.status === 'closed')];

      if (existing?.messageId) {
        const message = await (channel as TextChannel).messages.fetch(existing.messageId);
        await message.edit({ files: [rosterAttachment(roster)], components });
      } else {
        const message = await (channel as TextChannel).send({
          files: [rosterAttachment(roster)],
          components,
        });
        roster.messageId = message.id;
      }

      await store.saveRoster(roster);

      res.json({ messageId: roster.messageId });
    } catch (err) {
      console.error('Failed to post roster:', err);
      res.status(500).json({ error: 'Failed to post roster' });
    }
  });

  /**
   * Post or correct the "still missing" message under a roster.
   *
   * Edits where it can. A roster gets pushed again every time somebody is
   * moved, and each push used to leave another copy in the channel with the
   * older ones still asking for people who had since been found.
   */
  app.post('/api/post-missing', async (req, res) => {
    const parsed = postMissingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { channelId, messageId, raidTitle, missingSlots, extraMessage, scheduledFor, raidType, contacts } = parsed.data;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid text channel' });
        return;
      }

      const content = buildMissingMessage({ raidTitle, missingSlots, extraMessage, scheduledFor, raidType, contacts });

      // @everyone still calls the raid; the people named as contacts are
      // shown as tags to tap, not pinged every time a roster goes out.
      const allowedMentions = { parse: ['everyone' as const] };

      if (messageId) {
        try {
          const existing = await (channel as TextChannel).messages.fetch(messageId);
          await existing.edit({ content, allowedMentions });
          res.json({ messageId });

          return;
        } catch {
          // Deleted by hand, or old enough to be gone. Saying so would only
          // stop a roster being pushed, so it is posted afresh instead.
        }
      }

      const message = await (channel as TextChannel).send({ content, allowedMentions });
      res.json({ messageId: message.id });
    } catch (err) {
      console.error('Failed to post missing roster message:', err);
      res.status(500).json({ error: 'Failed to post missing roster message' });
    }
  });

  /**
   * Post or correct a raid's loot history.
   *
   * Edits where it can, for the same reason the missing-players message does:
   * a price gets corrected and the sheet finalised again, and two lists in the
   * channel disagreeing with each other is worse than none.
   */
  app.post('/api/post-loot-history', async (req, res) => {
    const parsed = postLootHistorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { channelId, messageId, ...post } = parsed.data;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid text channel' });
        return;
      }

      // Drawn rather than written. Discord will not colour text in a message,
      // and its one coloured code block has eight colours - so an epic and a
      // rare come out the same blue, and a warrior and a rogue the same
      // yellow. Those colours are the point: the quality is read before the
      // name.
      //
      // The picture alone. It went out with an embed of the same list
      // underneath it, for searching, and the only thing that achieved was
      // doubling the length of the post and pushing everything else in the
      // channel off the screen. The list is on the website to search.
      const files = [await lootHistoryAttachment(post)];

      if (messageId) {
        try {
          const existing = await (channel as TextChannel).messages.fetch(messageId);

          // Emptied as well as replaced: editing a message that already has an
          // embed leaves the old one there beside the new picture.
          await existing.edit({ embeds: [], files });
          res.json({ messageId });

          return;
        } catch {
          // Deleted by hand, or old enough to be gone. Posted afresh rather
          // than refusing, which would only stop a sheet being finalised.
        }
      }

      const message = await (channel as TextChannel).send({ files });
      res.json({ messageId: message.id });
    } catch (err) {
      console.error('Failed to post loot history:', err);
      res.status(500).json({ error: 'Failed to post loot history' });
    }
  });

  app.post('/api/post-message', async (req, res) => {
    const parsed = postMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }
    const { channelId, content } = parsed.data;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid channel' });
        return;
      }

      const message = await (channel as TextChannel).send({ content });
      res.json({ messageId: message.id });
    } catch (err) {
      console.error('Failed to post message:', err);
      res.status(500).json({ error: 'Failed to post message' });
    }
  });

  app.post('/api/update-message', async (req, res) => {
    const parsed = updateMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }
    const { channelId, messageId, content, imageBase64, filename } = parsed.data;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid channel' });
        return;
      }

      const message = await (channel as TextChannel).messages.fetch(messageId);
      const editData: { content?: string; files?: AttachmentBuilder[] } = {};
      if (content !== undefined) {
        editData.content = content;
      }
      if (imageBase64) {
        const buffer = Buffer.from(imageBase64, 'base64');
        editData.files = [new AttachmentBuilder(buffer, { name: filename || 'roster.png' })];
      }

      await message.edit(editData);
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to update message:', err);
      res.status(500).json({ error: 'Failed to update message' });
    }
  });

  /**
   * Everybody in the server holding one of the named roles, for the website to
   * pick roster contacts from. ?roles=Management,Host
   */
  app.get('/api/role-members/:guildId', async (req, res) => {
    const roleNames = String(req.query.roles ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
      .slice(0, 10);

    if (roleNames.length === 0) {
      res.status(400).json({ error: 'roles query parameter is required' });
      return;
    }

    try {
      res.json(await membersWithRoles(client, req.params.guildId, roleNames));
    } catch (err) {
      if (err instanceof MemberListUnavailable) {
        res.status(503).json({ error: err.message });
        return;
      }

      console.error('Failed to list role members:', err);
      res.status(500).json({ error: 'Failed to list role members' });
    }
  });

  /** Every sign-up, change and sign-off for an event, oldest first. */
  app.get('/api/signup-log/:instanceId', async (req, res) => {
    try {
      res.json({ log: await store.listSignupLog(req.params.instanceId) });
    } catch {
      res.status(500).json({ error: 'Failed to fetch signup log' });
    }
  });

  app.get('/api/signups/:instanceId', async (req, res) => {
    try {
      const signups = await store.listSignups(req.params.instanceId);
      // Cancel signup on the roster message does not touch the signup, so say
      // here who pressed it - the website crosses them out like a Sign Off.
      const roster = await store.getRoster(req.params.instanceId);
      const answers = roster?.confirmations ?? {};

      res.json({
        signups: signups.map((s) => ({ ...s, cancelled: answers[key(s.characterName)] === 'cancelled' })),
        // The answer is kept under the name on the roster, which is not
        // always the name they signed up with.
        cancelled: Object.keys(answers).filter((name) => answers[name] === 'cancelled'),
      });
    } catch {
      res.status(500).json({ error: 'Failed to fetch signups' });
    }
  });

  app.post('/api/tickets', async (req, res) => {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }
    const { discordName, category, subject, message, ticketId, channelId } = parsed.data;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        res.status(400).json({ error: 'Invalid channel' });
        return;
      }

      const categoryLabels: Record<string, string> = {
        general: 'General',
        deduction: 'Deduction Appeal',
        gold: 'Gold / Payout',
        bug: 'Bug Report',
        other: 'Other',
      };

      const embed = {
        title: `New Ticket #${ticketId}`,
        color: 0xef4444,
        fields: [
          { name: 'From', value: discordName, inline: true },
          { name: 'Category', value: (category && categoryLabels[category]) || category || 'General', inline: true },
          { name: 'Subject', value: subject || 'No subject', inline: false },
          { name: 'Message', value: message.length > 1024 ? message.substring(0, 1021) + '...' : message, inline: false },
        ],
        footer: { text: `View & reply at primegdkp.test/admin/tickets/${ticketId}` },
        timestamp: new Date().toISOString(),
      };

      await (channel as TextChannel).send({ embeds: [embed] });
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to send ticket notification:', err);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  app.delete('/api/instances/:instanceId', async (req, res) => {
    try {
      const instance = await store.deleteInstance(req.params.instanceId);
      if (!instance) {
        res.status(404).json({ error: 'Instance not found' });
        return;
      }

      if (instance.messageId && instance.channelId) {
        try {
          const channel = await client.channels.fetch(instance.channelId);
          if (channel && channel.isTextBased()) {
            const message = await (channel as TextChannel).messages.fetch(instance.messageId);
            await message.delete();
          }
        } catch {
          // Message may already be deleted - that's fine
        }
      }

      res.json({ success: true, deletedInstanceId: instance.id });
    } catch (err) {
      console.error('Failed to delete instance:', err);
      res.status(500).json({ error: 'Failed to delete instance' });
    }
  });

  app.get('/api/templates', async (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId || typeof guildId !== 'string') {
      res.status(400).json({ error: 'guildId query parameter is required' });
      return;
    }
    try {
      res.json({ templates: await store.listTemplates(guildId) });
    } catch (err) {
      console.error('Failed to list templates:', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  app.post('/api/templates', async (req, res) => {
    const parsed = templateCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { postNow, createdBy, schedule: wanted, description, ...rest } = parsed.data;
    const schedule = { ...wanted, timezone: wanted.timezone ?? config.defaultTimezone };

    let nextFireAt: Date;
    try {
      nextFireAt = nextOccurrence(schedule);
    } catch {
      res.status(400).json({ error: `"${schedule.timezone}" is not a recognized timezone name` });
      return;
    }

    try {
      const channel = await client.channels.fetch(rest.channelId);
      if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== rest.guildId) {
        res.status(400).json({ error: 'Invalid text channel' });
        return;
      }

      const template = await store.createTemplate({
        ...rest,
        // Blank from the website arrives as null or ''; the post shows nothing either way.
        description: description || undefined,
        roles: rest.roles ?? ['Tank', 'Healer', 'DPS', 'Fill', 'Bench'],
        schedule,
        nextFireAt: nextFireAt.toISOString(),
        createdBy: createdBy ?? 'website',
      });

      // The first post goes up now when asked, whatever the lead time says:
      // the person setting it up wants to see it, and the scheduler then
      // finds it already posted and waits for the week after.
      const instance = postNow ? await postInstance(client, store, template) : null;

      res.json({ template, instance });
    } catch (err) {
      console.error('Failed to create template:', err);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  app.patch('/api/templates/:templateId', async (req, res) => {
    const parsed = templatePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    try {
      const template = await store.getTemplate(req.params.templateId);
      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      const { schedule, channelId, description, ...rest } = parsed.data;
      const patch: Partial<EventTemplate> = { ...rest };

      if (description !== undefined) {
        patch.description = description || undefined;
      }

      if (channelId !== undefined) {
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== template.guildId) {
          res.status(400).json({ error: 'Invalid text channel' });
          return;
        }
        patch.channelId = channelId;
      }

      if (schedule) {
        // The stored timezone is the one the raid was scheduled in; a caller
        // that does not name one is talking about that same clock.
        patch.schedule = { ...schedule, timezone: schedule.timezone ?? template.schedule.timezone };
        patch.nextFireAt = nextOccurrence(patch.schedule).toISOString();
      }

      await store.updateTemplate(template.id, patch);
      res.json({ template: await store.getTemplate(template.id) });
    } catch (err) {
      console.error('Failed to update template:', err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  app.delete('/api/templates/:templateId', async (req, res) => {
    try {
      const deleted = await store.deleteTemplate(req.params.templateId);
      if (!deleted) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      // Signups already posted from it stay up: deleting the schedule stops
      // the next one, it does not call off the raid people signed up to.
      res.json({ success: true, deletedTemplateId: req.params.templateId });
    } catch (err) {
      console.error('Failed to delete template:', err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  app.get('/api/instances', async (req, res) => {
    const guildId = req.query.guildId;
    if (!guildId || typeof guildId !== 'string') {
      res.status(400).json({ error: 'guildId query parameter is required' });
      return;
    }
    try {
      // Through the store. This used to read data/store.json off disk by a
      // path of its own, behind the back of the thing that owns the file -
      // so it answered from whatever happened to be at that path, and an
      // empty or unreadable file came back as "no signups" rather than as an
      // error anybody would notice.
      const rows = await store.listInstancesWithCounts(guildId);

      res.json({
        instances: rows.map((row) => ({ ...row.instance, signupCount: row.signups })),
        // Kept for callers that count them themselves. The count above is the
        // one to trust: it is taken where the signups are.
        signups: (await Promise.all(
          rows.map((row) => store.listSignups(row.instance.id)),
        )).flat(),
      });
    } catch (err) {
      console.error('Failed to list instances:', err);
      res.status(500).json({ error: 'Failed to list instances' });
    }
  });

  const port = config.apiPort || 3001;

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`API server listening on 127.0.0.1:${port}`);
  });

  /**
   * Die rather than let an older process keep the port.
   *
   * Without this a restart that cannot bind - because the previous bot is
   * still holding the port - logged nothing anybody read and left the old
   * build serving. A deploy then looked like it had worked while the running
   * code was from before it, which is worse than being down.
   */
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already taken - another bot process is still running. Stop it and start again.`
        : `API server could not start: ${error.message}`,
    );

    process.exit(1);
  });
}

/** When this process came up, so /api/health can say how old the build is. */
const startedAt = new Date();

/**
 * The paths this build serves, so a deploy can be told apart from the one
 * before it without reading the source.
 */
function listRoutes(app: express.Express): string[] {
    const stack = (app as unknown as { router?: { stack?: unknown[] } }).router?.stack ?? [];

    return stack
        .map((layer) => (layer as { route?: { path?: string } }).route?.path)
        .filter((path): path is string => typeof path === 'string')
        .sort();
}

import express from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { AttachmentBuilder, ChannelType, Client, TextChannel } from 'discord.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import { buildSignupButtons, buildSignupEmbed } from './embeds/signup-embed.js';
import type { SignupStore } from './store/signup-store.js';
import { nextOccurrence } from './schedule/next-occurrence.js';
import type { EventInstance, EventTemplate } from './types.js';

const postSignupSchema = z.object({
  channelId: z.string(),
  title: z.string().max(256),
  faction: z.string(),
  scheduledFor: z.string(),
  roles: z.array(z.string()).optional(),
  description: z.string().optional(),
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

const updateMessageSchema = z.object({
  channelId: z.string(),
  messageId: z.string(),
  content: z.string().max(2000).optional(),
  imageBase64: z.string().max(15_000_000).optional(),
  filename: z.string().max(255).optional(),
});

/**
 * What the website may change about a recurring post. The channel, roles and
 * faction stay where they were set from Discord: those are decisions about the
 * server, not about when the signup goes up.
 */
const templatePatchSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
  schedule: z
    .object({
      dayOfWeek: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      timezone: z.string().max(64).optional(),
    })
    .optional(),
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

  app.get('/api/signups/:instanceId', async (req, res) => {
    try {
      const signups = await store.listSignups(req.params.instanceId);
      res.json({ signups });
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

      const { schedule, ...rest } = parsed.data;
      const patch: Partial<EventTemplate> = { ...rest };

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
      const storePath = await import('node:fs/promises');
      const { join } = await import('node:path');
      const raw = await storePath.readFile(join(process.cwd(), 'data', 'store.json'), 'utf-8');
      const data = JSON.parse(raw);
      const instances = (data.instances || []).filter((i: EventInstance) => i.guildId === guildId);
      const instanceIds = new Set(instances.map((i: EventInstance) => i.id));
      const signups = (data.signups || []).filter((s: { eventInstanceId: string }) => instanceIds.has(s.eventInstanceId));
      res.json({ instances, signups });
    } catch {
      res.json({ instances: [], signups: [] });
    }
  });

  const port = config.apiPort || 3001;
  app.listen(port, '127.0.0.1', () => {
    console.log(`API server listening on 127.0.0.1:${port}`);
  });
}

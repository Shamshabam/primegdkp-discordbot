import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadConfig } from './config.js';

dotenv.config();

const config = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async (c) => {
  const avatarPath = join(process.cwd(), 'icons', 'bot-avatar.png');
  const avatarData = await readFile(avatarPath);
  const base64 = `data:image/png;base64,${avatarData.toString('base64')}`;
  await c.user.setAvatar(base64);
  console.log(`Avatar updated for ${c.user.tag}`);
  process.exit(0);
});

client.login(config.discordBotToken);

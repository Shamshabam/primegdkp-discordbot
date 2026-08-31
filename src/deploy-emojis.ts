import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';

dotenv.config();

interface EmojiDef {
  name: string;
  file: string;
}

const EMOJIS: EmojiDef[] = [
  // Class icons
  { name: 'c_warrior', file: 'warrior.jpg' },
  { name: 'c_paladin', file: 'paladin.jpg' },
  { name: 'c_hunter', file: 'hunter.jpg' },
  { name: 'c_rogue', file: 'rogue.jpg' },
  { name: 'c_priest', file: 'priest.jpg' },
  { name: 'c_shaman', file: 'shaman.jpg' },
  { name: 'c_mage', file: 'mage.jpg' },
  { name: 'c_warlock', file: 'warlock.jpg' },
  { name: 'c_druid', file: 'druid.jpg' },
  // Spec icons
  { name: 's_arms', file: 'arms.jpg' },
  { name: 's_fury', file: 'fury.jpg' },
  { name: 's_prot_war', file: 'prot_warrior.jpg' },
  { name: 's_holy_pal', file: 'holy_paladin.jpg' },
  { name: 's_prot_pal', file: 'prot_paladin.jpg' },
  { name: 's_ret', file: 'retribution.jpg' },
  { name: 's_bm', file: 'beast_mastery.jpg' },
  { name: 's_marks', file: 'marksmanship.jpg' },
  { name: 's_surv', file: 'survival.jpg' },
  { name: 's_assn', file: 'assassination.jpg' },
  { name: 's_combat', file: 'combat.jpg' },
  { name: 's_sub', file: 'subtlety.jpg' },
  { name: 's_disc', file: 'discipline.jpg' },
  { name: 's_holy_pr', file: 'holy_priest.jpg' },
  { name: 's_shadow', file: 'shadow.jpg' },
  { name: 's_ele', file: 'elemental.jpg' },
  { name: 's_enh', file: 'enhancement.jpg' },
  { name: 's_resto_sh', file: 'resto_shaman.jpg' },
  { name: 's_arcane', file: 'arcane.jpg' },
  { name: 's_fire', file: 'fire.jpg' },
  { name: 's_frost', file: 'frost.jpg' },
  { name: 's_affli', file: 'affliction.jpg' },
  { name: 's_demo', file: 'demonology.jpg' },
  { name: 's_destro', file: 'destruction.jpg' },
  { name: 's_balance', file: 'balance.jpg' },
  { name: 's_feral', file: 'feral.jpg' },
  { name: 's_resto_dr', file: 'resto_druid.jpg' },
];

async function main(): Promise<void> {
  const config = loadConfig();
  const guildId = config.discordDevGuildId;
  if (!guildId) throw new Error('DISCORD_DEV_GUILD_ID must be set');

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(config.discordBotToken);
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));

  const guild = await client.guilds.fetch(guildId);
  const existingEmojis = await guild.emojis.fetch();
  const iconsDir = join(process.cwd(), 'icons');

  const results: Record<string, string> = {};

  for (const def of EMOJIS) {
    const existing = existingEmojis.find((e) => e.name === def.name);
    if (existing) {
      console.log(`  ✓ ${def.name} already exists: <:${existing.name}:${existing.id}>`);
      results[def.name] = existing.id!;
      continue;
    }

    try {
      const imageData = await readFile(join(iconsDir, def.file));
      const base64 = `data:image/jpeg;base64,${imageData.toString('base64')}`;
      const emoji = await guild.emojis.create({ attachment: base64, name: def.name });
      console.log(`  + ${def.name} uploaded: <:${emoji.name}:${emoji.id}>`);
      results[def.name] = emoji.id!;
    } catch (error) {
      console.error(`  ✗ ${def.name} failed:`, (error as Error).message);
    }
  }

  // Output a JSON map for use in wow-classes.ts
  console.log('\n=== Emoji ID map (paste into emoji-ids.json) ===');
  console.log(JSON.stringify(results, null, 2));

  client.destroy();
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});

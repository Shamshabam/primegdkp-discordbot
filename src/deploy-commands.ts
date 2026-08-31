import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { gdkpEventCommand } from './commands/gdkp-event.js';
import { loadConfig } from './config.js';

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.discordApplicationId) {
    throw new Error('DISCORD_APPLICATION_ID must be set in .env to deploy commands.');
  }

  const commands = [gdkpEventCommand.toJSON()];
  const rest = new REST().setToken(config.discordBotToken);

  const route = config.discordDevGuildId
    ? Routes.applicationGuildCommands(config.discordApplicationId, config.discordDevGuildId)
    : Routes.applicationCommands(config.discordApplicationId);

  const result = (await rest.put(route, { body: commands })) as unknown[];

  console.log(
    `Registered ${result.length} command(s)${
      config.discordDevGuildId ? ' to dev guild (instant)' : ' globally (can take up to an hour to appear)'
    }.`,
  );
}

main().catch((error) => {
  console.error('Failed to deploy commands:', error);
  process.exit(1);
});

import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { startApiServer } from './api-server.js';
import { gdkpEventCommand, handleGdkpEventCommand } from './commands/gdkp-event.js';
import { loadConfig } from './config.js';
import { handleButton } from './handlers/button.js';
import { handleModalSubmit } from './handlers/modal-submit.js';
import { handleSelectMenu } from './handlers/select-menu.js';
import { startScheduler } from './scheduler.js';
import { refreshOpenSignups } from './signup-service.js';
import { createStore } from './store/index.js';

dotenv.config();

const config = loadConfig();
const store = createStore(config);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === gdkpEventCommand.name) {
      await handleGdkpEventCommand(interaction, config, store);
    } else if (interaction.isButton()) {
      await handleButton(interaction, store);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, store);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, store);
    }
  } catch (error) {
    console.error('Unhandled interaction error:', error);
  }
});

client.once('ready', (c) => {
  console.log(`Bot online as ${c.user.tag}`);
  startScheduler(c, store);
  startApiServer(c, store, config);

  // Posts made before the current layout catch up here rather than waiting for
  // the next person to sign up.
  void refreshOpenSignups(c, store);
});

client.login(config.discordBotToken);

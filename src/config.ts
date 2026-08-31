export interface Config {
  discordBotToken: string;
  discordApplicationId?: string;
  discordDevGuildId?: string;
  defaultTimezone: string;
  storeDriver: 'json' | 'api';
  apiUrl?: string;
  apiKey?: string;
  apiPort: number;
}

export function loadConfig(): Config {
  const required = ['DISCORD_BOT_TOKEN'] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const storeDriver = (process.env.STORE_DRIVER ?? 'json') as Config['storeDriver'];

  if (storeDriver === 'api' && (!process.env.PRIME_GDKP_API_URL || !process.env.PRIME_GDKP_INTERNAL_API_KEY)) {
    throw new Error('STORE_DRIVER=api requires PRIME_GDKP_API_URL and PRIME_GDKP_INTERNAL_API_KEY');
  }

  return {
    discordBotToken: process.env.DISCORD_BOT_TOKEN!,
    discordApplicationId: process.env.DISCORD_APPLICATION_ID || undefined,
    discordDevGuildId: process.env.DISCORD_DEV_GUILD_ID || undefined,
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'UTC',
    storeDriver,
    apiUrl: process.env.PRIME_GDKP_API_URL?.replace(/\/+$/, ''),
    apiKey: process.env.PRIME_GDKP_INTERNAL_API_KEY,
    apiPort: parseInt(process.env.API_PORT || '3001', 10),
  };
}

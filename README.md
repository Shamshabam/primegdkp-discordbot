# Prime GDKP Discord Bot

Recurring raid signup posts for Discord, in the style of raid-helper.xyz.

## What it does today

- `/gdkp-event create` — configure a recurring weekly signup post (title, channel, day/time, timezone, roles)
- `/gdkp-event list` / `/gdkp-event delete` — manage recurring events
- Every minute, the bot checks whether any event is due and posts a fresh signup embed with **Sign Up** / **Withdraw** buttons
- Clicking **Sign Up** shows a role picker (Tank/Healer/DPS/Bench by default, configurable per event); the roster embed updates live

Data is stored in `data/store.json` behind a `SignupStore` interface (see `src/store/`). Once the website exists, we'll add an API-backed implementation of the same interface so the bot and website share one source of truth — no changes needed to commands, handlers, or the scheduler.

## Setup

1. Copy `.env.example` to `.env`.
2. Create a Discord application at https://discord.com/developers/applications, add a Bot, copy the token into `DISCORD_BOT_TOKEN`, and the Application ID into `DISCORD_APPLICATION_ID`.
3. Under OAuth2 > URL Generator, select scope `bot`, permissions `Send Messages`, `Embed Links`, `Read Message History`, `Manage Events` (for the slash command's default permission) — open the generated URL and invite the bot to your test server.
4. Right-click your test server in Discord (with Developer Mode enabled) to copy its ID into `DISCORD_DEV_GUILD_ID` — this registers slash commands instantly there instead of waiting up to an hour for global registration.
5. `npm install`
6. `npm run deploy-commands` — registers `/gdkp-event`
7. `npm run dev` (in one terminal, recompiles on save) and `npm start` (in another), or just `npm run build && npm start`

## Testing

`npm test` runs the scheduling math tests (the trickiest part — weekday rollover and timezone/DST handling).

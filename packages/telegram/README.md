# @cc-channels/telegram

Telegram channel plugin for Claude Code. Lets Claude Code receive and reply to Telegram messages via a bot.

## Prerequisites

- Node.js 20+
- A Telegram bot token (from [@BotFather](https://t.me/botfather))

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and start a chat with [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the prompts to choose a name and username.
3. BotFather will give you a token like `123456789:AAF...`. Save it.

### 2. Register with Claude Code

Register the channel at user scope so it is available from any project directory:

```bash
claude mcp add -s user cc-telegram \
  -e TELEGRAM_BOT_TOKEN="your-token-here" \
  -- npx tsx /absolute/path/to/packages/telegram/src/index.ts
```

Or, if you cloned this repo and want to use the local `.mcp.json`, set `TELEGRAM_BOT_TOKEN` in your environment and point Claude Code at the repo's `.mcp.json`.

### 3. Start Claude Code with the Channel

```bash
claude --dangerously-load-development-channels server:cc-telegram
```

## Pairing Flow

The bot only accepts messages from paired Telegram accounts (allowlist-based). To pair:

1. Ask Claude Code to run the `generate_pair_code` tool. It returns a short code (e.g. `A3X9`).
2. In Telegram, send `/pair A3X9` to your bot.
3. The bot confirms pairing. Your `chat_id` is now in the allowlist.

To generate a new code for an already-paired account, send `/newcode` to the bot.

## How it Works

- The MCP server uses **long polling** (via [grammy](https://grammy.dev)) — no webhook or public URL required.
- Incoming messages are queued and forwarded to Claude Code as MCP notifications.
- Claude Code can reply using the `reply_to_message` MCP tool, and set emoji reactions using `set_message_reaction`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Token from BotFather |
| `PROJECT_DIR` | No | Path for allowlist storage (defaults to CWD) |

## Emoji Reactions

Only a subset of emojis are allowed by Telegram for bot reactions. The following are used by this plugin:

- `👨‍💻` — message received, Claude is processing
- `💯` — reply sent successfully

Invalid emojis fail silently (Telegram returns 400, which is caught and logged to stderr).

## Troubleshooting

**Bot doesn't respond to messages**
- Check that `TELEGRAM_BOT_TOKEN` is set correctly.
- Ensure the Telegram account is paired (send `/pair <code>` first).

**"Custom channels require dangerously-load-development-channels"**
- Launch Claude Code with the `--dangerously-load-development-channels` flag as shown above.

**Messages are not delivered**
- Long polling requires outbound internet access. Check your network/firewall.

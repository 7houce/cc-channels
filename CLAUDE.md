# cc-channels

Channel plugins for Claude Code — connect messaging platforms (Telegram, Feishu/Lark) via MCP.

## Monorepo Structure

pnpm workspace with three packages:

- `packages/core` (`@cc-channels/core`) — shared types, `ChannelClient` / `ChannelToolProvider` interfaces, generic MCP server runner
- `packages/telegram` (`@cc-channels/telegram`) — Telegram bot via grammy (long polling)
- `packages/feishu` (`@cc-channels/feishu`) — Feishu/Lark bot via `@larksuiteoapi/node-sdk`

## Tech Stack

- TypeScript (ESM), Node.js 20+, pnpm workspaces
- Dev: `npx tsx packages/<channel>/src/index.ts` (no build needed)
- Build: `pnpm build` (runs `tsc` in each package)
- Test: `pnpm test` (vitest in each package)

## Key Gotchas

- stdout is MCP JSON-RPC only. ALL logging goes to stderr (each package has a `logger.ts`)
- Telegram `setMessageReaction` REPLACES all reactions — it does not append
- Telegram bot reactions: only whitelisted emojis work (👨‍💻, 👍, 💯, 🎉, etc.). ✅ is NOT valid — invalid emojis fail with a 400 that is caught and logged
- Feishu pairing: send `pair <code>` (no leading slash) in a direct message to the bot
- Custom channels require: `claude --dangerously-load-development-channels server:<channel-name>`
- Register at user scope: `claude mcp add -s user` for use from any directory

## Emoji Lifecycle (hardcoded in code, not LLM-dependent)

- Receive message → 👨‍💻 (set before forwarding to Claude)
- Reply success → 💯 replaces 👨‍💻

## Pairing

- `generate_pair_code` MCP tool — Claude generates codes on demand
- Telegram: `/pair <code>` | Feishu: `pair <code>` (no slash)
- Persisted in `allowlist.json` in `PROJECT_DIR` (gitignored)

## MCP Config
- `cwd` and `PROJECT_DIR` must both point to the user's project dir (not this repo)
- `PROJECT_DIR` is where `allowlist.json` gets written

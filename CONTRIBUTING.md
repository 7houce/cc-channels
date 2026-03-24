# Contributing to cc-channels

Thank you for your interest in contributing!

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 9 or later (`npm install -g pnpm`)

## Setup

```bash
git clone https://github.com/your-org/cc-channels.git
cd cc-channels
pnpm install
pnpm build
pnpm test
```

## Project Structure

```
cc-channels/
├── packages/
│   ├── core/          # @cc-channels/core — shared interfaces & MCP runner
│   ├── telegram/      # @cc-channels/telegram — Telegram channel
│   └── feishu/        # @cc-channels/feishu — Feishu/Lark channel
├── package.json       # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
└── tsconfig.base.json # Shared TypeScript config
```

Each package has its own `tsconfig.json`, `vitest.config.ts`, and `src/` directory.

## Adding a New Channel

1. **Create the package directory** under `packages/your-channel/` with a `package.json` that depends on `@cc-channels/core`.

2. **Implement `ChannelClient`** (from `@cc-channels/core`):
   - `connect()` / `disconnect()` — platform connectivity lifecycle
   - `sendMessage(chatId, text)` — send a reply
   - `setReaction(chatId, messageId, emoji)` — react to a message
   - `onMessage(handler)` — register an incoming message handler
   - `generatePairCode()` / `completePairing(chatId, code)` — pairing flow

3. **Implement `ChannelToolProvider`** (from `@cc-channels/core`):
   - `getTools()` — return MCP tool definitions
   - `handleToolCall(name, args)` — handle MCP tool invocations

4. **Wire up the entry point** in `src/index.ts` using the `createMcpServer` runner from `@cc-channels/core`.

5. **Add your package** to `pnpm-workspace.yaml` (it is usually picked up automatically via `packages/*`).

6. **Write tests** using vitest. Look at `packages/telegram/src/__tests__/` for examples.

7. **Add documentation**: create `packages/your-channel/README.md` with setup instructions.

## Running a Single Package

```bash
# Dev (no build)
cd packages/telegram && npx tsx src/index.ts

# Build
pnpm --filter @cc-channels/telegram build

# Test
pnpm --filter @cc-channels/telegram test
```

## PR Process

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-channel`.
3. Implement your changes with tests.
4. Ensure all tests pass: `pnpm test`.
5. Open a Pull Request against `main` with a clear description of what your channel does and how to test it.

Please keep PRs focused — one feature or fix per PR.

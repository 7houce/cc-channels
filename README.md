# cc-channels

Channel plugins for Claude Code — connect messaging platforms (Telegram, Feishu/Lark) via MCP.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![@cc-channels/telegram](https://img.shields.io/npm/v/@cc-channels/telegram?label=telegram)](https://www.npmjs.com/package/@cc-channels/telegram)
[![@cc-channels/feishu](https://img.shields.io/npm/v/@cc-channels/feishu?label=feishu)](https://www.npmjs.com/package/@cc-channels/feishu)

## What it does

`cc-channels` lets Claude Code receive and reply to messages from external chat platforms. Each channel is an MCP (Model Context Protocol) server that bridges a messaging platform to Claude Code over stdio. Claude can read incoming messages, reply to them, and react with emoji — all through a consistent set of MCP tools.

Supported channels:

- **Telegram** — via a Telegram bot (grammy)
- **Feishu / Lark** — via the Feishu Open Platform bot SDK

## Architecture

This is a pnpm monorepo with three packages:

- **`packages/core`** (`@cc-channels/core`) — shared types, interfaces (`ChannelClient`, `ChannelToolProvider`), and the generic MCP server runner. All channel packages depend on this.
- **`packages/telegram`** (`@cc-channels/telegram`) — Telegram channel implementation using long polling via grammy.
- **`packages/feishu`** (`@cc-channels/feishu`) — Feishu/Lark channel implementation using the official Lark Node SDK.

Each channel package exposes a standalone entry point (`src/index.ts`) that can be run directly with `tsx` — no build step required for development.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Claude Code](https://claude.ai/claude-code) CLI installed and logged in

## Installation

```bash
git clone https://github.com/tomzhou/cc-channels.git
cd cc-channels
pnpm install
```

## Quick Start: Telegram

### Step 1 — Create a Telegram Bot

1. Open Telegram and chat with [@BotFather](https://t.me/botfather)
2. Send `/newbot`, pick a name and username
3. Copy the bot token (e.g. `123456789:AAF...`)

### Step 2 — Register the MCP server

**Option A: Project-level** (only loads in a specific project directory)

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cc-telegram": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/cc-channels/packages/telegram/src/index.ts"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "your-token-here",
        "PROJECT_DIR": "/absolute/path/to/your-project"
      }
    }
  }
}
```

**Option B: User-level** (available from any directory)

```bash
claude mcp add -s user cc-telegram \
  -e TELEGRAM_BOT_TOKEN="your-token-here" \
  -- npx tsx /absolute/path/to/cc-channels/packages/telegram/src/index.ts
```

### Step 3 — Launch Claude Code

```bash
claude --dangerously-load-development-channels server:cc-telegram
```

### Step 4 — Pair your Telegram account

1. In Claude Code, say: **"generate a pairing code"**
2. Claude will return a 6-character code (e.g. `A3F7K2`)
3. In Telegram, send `/pair A3F7K2` to your bot
4. Bot replies "Paired successfully" — you're done!

### Step 5 — Start chatting

Send any message to your bot in Telegram. Claude Code will:
- React with 👨‍💻 (working on it)
- Process your message
- Reply in Telegram
- React with 💯 (done)

You can now communicate with Claude Code remotely from your phone.

See [packages/telegram/README.md](./packages/telegram/README.md) for environment variables, troubleshooting, and advanced usage.

---

## Quick Start: Feishu / Lark

### Step 1 — Create a Feishu App

1. Go to [Feishu Developer Console](https://open.feishu.cn/)
2. Create a new Custom App
3. Enable **Bot** capability under "App Capabilities"
4. Add permissions: `im:message`, `im:resource`, `im:message.reactions`
5. Publish the app (or use test mode)
6. Copy the App ID and App Secret

### Step 2 — Register the MCP server

**Option A: Project-level**

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cc-feishu": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/cc-channels/packages/feishu/src/index.ts"],
      "env": {
        "FEISHU_APP_ID": "your-app-id",
        "FEISHU_APP_SECRET": "your-app-secret",
        "PROJECT_DIR": "/absolute/path/to/your-project"
      }
    }
  }
}
```

**Option B: User-level**

```bash
claude mcp add -s user cc-feishu \
  -e FEISHU_APP_ID="your-app-id" \
  -e FEISHU_APP_SECRET="your-app-secret" \
  -- npx tsx /absolute/path/to/cc-channels/packages/feishu/src/index.ts
```

### Step 3 — Launch Claude Code

```bash
claude --dangerously-load-development-channels server:cc-feishu
```

### Step 4 — Pair your Feishu account

1. In Claude Code, say: **"generate a pairing code"**
2. Claude will return a 6-character code (e.g. `A3F7K2`)
3. In Feishu, send `pair A3F7K2` to your bot (no leading slash)
4. Bot replies "Paired successfully" — you're done!

### Step 5 — Start chatting

Same experience as Telegram. Send messages to your bot in Feishu, Claude processes and replies.

See [packages/feishu/README.md](./packages/feishu/README.md) for environment variables, troubleshooting, and advanced usage.

## Adding a New Channel

1. Create a new package under `packages/your-channel/`.
2. Implement the two interfaces from `@cc-channels/core`:
   - **`ChannelClient`** — handles platform connectivity (connect, disconnect, polling/webhooks, send message, set reaction).
   - **`ChannelToolProvider`** — defines the MCP tools exposed to Claude Code.
3. Wire them into the core `McpServer` runner in your `src/index.ts`.
4. Add an entry to `.mcp.json` and the workspace `pnpm-workspace.yaml`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for a detailed walkthrough.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions and the PR process.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Tom Zhou

---

## 简体中文

### cc-channels

为 Claude Code 提供消息渠道插件，通过 MCP 协议连接 Telegram、飞书（Lark）等即时通讯平台。

### 功能说明

安装后，Claude Code 可以通过对应渠道接收和回复用户消息，并对消息做出 emoji 反应。每个渠道是一个独立的 MCP Server，通过 stdio 与 Claude Code 通信。

### 架构

pnpm monorepo，包含三个包：

- `packages/core`：共享类型与接口（`ChannelClient`、`ChannelToolProvider`），以及通用 MCP Server 运行器。
- `packages/telegram`：Telegram 渠道实现（基于 grammy，长轮询方式）。
- `packages/feishu`：飞书/Lark 渠道实现（基于飞书官方 Node SDK）。

### 快速开始

**安装：**

```bash
git clone https://github.com/tomzhou/cc-channels.git
cd cc-channels
pnpm install
```

**Telegram 使用流程：**

1. 通过 [@BotFather](https://t.me/botfather) 创建 Bot，获取 token
2. 在你的项目目录创建 `.mcp.json`，或用 `claude mcp add -s user` 全局注册
3. 启动：`claude --dangerously-load-development-channels server:cc-telegram`
4. 配对：对 Claude 说"生成配对码"，然后在 Telegram 发送 `/pair <码>`
5. 开始使用：在 Telegram 给 Bot 发消息，Claude 会处理并回复

**飞书使用流程：**

1. 在[飞书开放平台](https://open.feishu.cn/)创建应用，启用机器人，添加权限
2. 同上注册 MCP server（env 换成 `FEISHU_APP_ID` + `FEISHU_APP_SECRET`）
3. 启动：`claude --dangerously-load-development-channels server:cc-feishu`
4. 配对：对 Claude 说"生成配对码"，然后在飞书发送 `pair <码>`（无斜杠）
5. 开始使用

### 贡献

欢迎 PR！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 开源协议

[MIT](./LICENSE)

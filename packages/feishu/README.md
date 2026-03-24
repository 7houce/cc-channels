# @cc-channels/feishu

Feishu/Lark channel plugin for Claude Code. Lets Claude Code receive and reply to Feishu messages via a bot.

## Prerequisites

- Node.js 20+
- A Feishu/Lark app with Bot capability enabled

## Setup

### 1. Create a Feishu App

1. Go to the [Feishu Developer Console](https://open.feishu.cn/app) and click **Create App**.
2. Choose **Custom App** and give it a name.

### 2. Enable Bot Capability

1. In your app settings, go to **Add Capabilities** → **Bot**.
2. Enable the Bot capability and save.

### 3. Set Permissions

In **Permissions & Scopes**, add the following:

| Permission | Purpose |
|---|---|
| `im:message` | Read and send messages |
| `im:resource` | Access message resources (files, images) |
| `im:message.reactions` | Add/remove emoji reactions |

Request the permissions and, if required by your org, submit for approval.

### 4. Get App ID and Secret

In **Credentials & Basic Info**, copy:
- **App ID** (e.g. `cli_abc123...`)
- **App Secret**

### 5. Register with Claude Code

```bash
claude mcp add -s user cc-feishu \
  -e FEISHU_APP_ID="your-app-id" \
  -e FEISHU_APP_SECRET="your-app-secret" \
  -- npx tsx /absolute/path/to/packages/feishu/src/index.ts
```

### 6. Start Claude Code with the Channel

```bash
claude --dangerously-load-development-channels server:cc-feishu
```

## Pairing Flow

The bot only accepts messages from paired Feishu accounts (allowlist-based). To pair:

1. Ask Claude Code to run the `generate_pair_code` tool. It returns a short code (e.g. `B7K2`).
2. In Feishu, open a **direct message** to your bot and send: `pair B7K2`

   Note: Feishu bots do not support slash commands like `/pair`. Send the plain text `pair <code>` without a leading slash.

3. The bot confirms pairing. Your `open_id` is now in the allowlist.

## How it Works

- The MCP server uses the **Feishu event subscription** model via the official [@larksuiteoapi/node-sdk](https://github.com/larksuite/oapi-sdk-nodejs).
- Incoming messages are queued and forwarded to Claude Code as MCP notifications.
- Claude Code can reply using the `reply_to_message` MCP tool, and set emoji reactions using `set_message_reaction`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FEISHU_APP_ID` | Yes | App ID from Feishu Developer Console |
| `FEISHU_APP_SECRET` | Yes | App Secret from Feishu Developer Console |
| `PROJECT_DIR` | No | Path for allowlist storage (defaults to CWD) |

## Troubleshooting

**Bot doesn't respond to messages**
- Verify `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are correct.
- Confirm the Bot capability is enabled and permissions are approved.
- Ensure the Feishu account is paired (send `pair <code>` first).

**Reactions fail silently**
- Confirm `im:message.reactions` permission is granted and approved.

**"Custom channels require dangerously-load-development-channels"**
- Launch Claude Code with the `--dangerously-load-development-channels` flag as shown above.

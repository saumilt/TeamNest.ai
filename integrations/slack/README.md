# Create the TeamNest Slack app from a manifest

Two ready-to-upload manifests are in this folder:
- `teamnest-slack-manifest.yaml`
- `teamnest-slack-manifest.json`

Either one produces the same app. Use whichever the Slack UI asks for.

## Steps (2 minutes)
1. Open **https://api.slack.com/apps**
2. Click **Create New App** → **From an app manifest**
3. Select the Slack **workspace** to install into → **Next**
4. Toggle **YAML** or **JSON**, paste the matching manifest file, → **Next** → **Create**
5. In the left sidebar open **Install App** (or **OAuth & Permissions**) → **Install to Workspace** → **Allow**
6. On **OAuth & Permissions**, copy the **Bot User OAuth Token** — it starts with `xoxb-`
7. Send that `xoxb-...` token to TeamNest (it will be stored as `SLACK_BOT_TOKEN` in the backend env). Posting into channels goes live immediately after.

## What the scopes are for
| Scope | Why |
|---|---|
| `chat:write` | Post messages as the TeamNest bot |
| `chat:write.public` | Post into public channels without inviting the bot first |
| `channels:read` | List public channels so you can choose a default channel |
| `groups:read` | List private channels the bot has been added to |

No event subscriptions / request URL are needed — TeamNest only *posts out* to Slack
(AI answers, ZIP insights, and AI-credit budget alerts). Nothing listens for inbound Slack events.

## Notes
- To post into a **private** channel, invite the TeamNest bot to it first (`/invite @TeamNest`).
- You can change the default target channel later in TeamNest → Connectors.
- Rotating/uninstalling the app invalidates the token; just re-copy a fresh one and resend it.

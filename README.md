# Boys trip planner

Proactive group-chat trip harness on **Flue 2.x + Cloudflare**.

One Durable Object conversation is one trip (`trip:boys-vegas-2026`). Artifacts live on Cloudflare Computer (SQLite-backed `/workspace`). Telegram is the first channel. A daily open-decisions signal nudges the same agent when the group goes quiet.

## Phase 1 decisions

- **Channel: Telegram.** Least friction in Flue 2.x docs: one bot token, one webhook secret, `POST /channels/telegram/webhook`. Discord needs an application, public key, command registration, and a 3s interaction deadline. WhatsApp needs a Meta business account.
- **Conversation id:** `trip:<slug>` (default `trip:boys-vegas-2026`). Telegram deliveries all dispatch to `TRIP_CONVERSATION_ID`. The group is *not* the conversation id — destination facts go in `initialData` (`chatId`, optional thread, title).
- **Model:** `cloudflare/@cf/moonshotai/kimi-k2.6` via the Workers AI binding. No provider API key. Traffic goes through AI Gateway by default.
- **Send ledger:** `/workspace/ledger/outbound.json` on the Computer workspace (same Durable Object SQLite as the filesystem). Pure `claimKey` / `markSent` checks run before the Telegram send. Agent `state` is not used for this.
- **Daily schedule:** `export const cloudflare = extend({ ... })` composes `workspaceHost` with Agents `scheduleEvery`. The callback `nudgeOpenDecisions` `dispatch`es a `kind: 'signal'` `type: 'schedule.open_decisions'` into the same trip id. Cadence is `NUDGE_EVERY_SECONDS` (default `86400`). Same payload is available at `POST /internal/nudge/:tripId` so you can fire it without waiting a day.

## How conversation id maps to the group

```
Telegram group  --webhook-->  /channels/telegram/webhook
                         dispatch(TripPlanner, { id: TRIP_CONVERSATION_ID })
                         Durable Object name = trip:boys-vegas-2026
                         initialData.chatId  = that group's chat id
```

This slice maps **one Telegram group → one trip** via `TRIP_CONVERSATION_ID`. A second message in the same group hits the same history because it uses the same id. HTTP `POST /agents/trip-planner/trip:boys-vegas-2026` is the same conversation.

## Setup

```sh
npm install
cp .dev.vars.example .dev.vars
# fill Telegram secrets locally if you will use the webhook
npm run dev
```

Workers AI needs no key. Telegram and `AGENT_HTTP_TOKEN` are optional for the local HTTP path. If `TELEGRAM_WEBHOOK_SECRET_TOKEN` is unset, the channel boots with a non-secret local placeholder so `vite dev` can start — inbound Telegram will not be trusted until you set a real secret.

### Required secrets (production)

| Name | Why |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Outbound Bot API (`wrangler secret put`) |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | Verifies inbound webhook |
| `AGENT_HTTP_TOKEN` | Bearer token for `/agents/*` and `/internal/*` (set this before you expose the Worker) |

Non-secret vars (already in `wrangler.jsonc`):

| Name | Default |
| --- | --- |
| `TRIP_CONVERSATION_ID` | `trip:boys-vegas-2026` |
| `ENABLE_BROWSER` | `false` |
| `NUDGE_EVERY_SECONDS` | `86400` |

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET_TOKEN
npx wrangler secret put AGENT_HTTP_TOKEN
```

Set the Telegram webhook to `https://<worker>/channels/telegram/webhook` with the same secret token (see [Flue Telegram](https://flueframework.com/docs/ecosystem/channels/telegram/)).

**Worker Loader** (`worker_loaders` / `LOADER`) is required for Cloudflare Computer's just-bash backend. It is beta-gated on the Cloudflare account.

## Local path: one message, one reply

```sh
npm run dev
```

Send into the trip id (202 = admitted):

```sh
curl -X POST 'http://localhost:5173/agents/trip-planner/trip:boys-vegas-2026' \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"We are thinking Vegas in October. What should we lock first?"}'
```

Read the same conversation (second message uses the same URL and therefore the same history):

```sh
curl 'http://localhost:5173/agents/trip-planner/trip:boys-vegas-2026'
curl -X POST 'http://localhost:5173/agents/trip-planner/trip:boys-vegas-2026' \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"Also check hotel options on the Strip."}'
```

If `AGENT_HTTP_TOKEN` is set, add `-H "Authorization: Bearer $AGENT_HTTP_TOKEN"`.

`npx flue run` does **not** emulate Cloudflare. Agent modules import `cloudflare:workers` — use `vite dev`.

## How the schedule would fire

After the Durable Object exists (first message), `onStart` registers `scheduleEvery`. When it fires, the agent receives:

```xml
<signal type="schedule.open_decisions" scheduledAt="..." cadence="daily">
The group has been quiet. Read /workspace/itinerary.md. ...
</signal>
```

Simulate without waiting:

```sh
curl -X POST 'http://localhost:5173/internal/nudge/trip:boys-vegas-2026'
```

Same-day repeats reuse the idempotency key `schedule.open_decisions:trip:boys-vegas-2026:<utc-day>` and should not start a second turn.

## Workspace artifacts

On first sandbox init the Computer workspace is seeded with:

- `/workspace/itinerary.md`
- `/workspace/ledger/outbound.json`

The model uses the standard file/shell tools (`read` / `write` / `edit` / `bash` / `grep` / `glob`) against that durable filesystem.

## Tools

- `research_web` — `fetch` + text extract. No browser.
- `post_to_channel` — Telegram send, destination bound from `initialData`, ledger claim first.
- `browse_page` — stub. Stays disabled while `ENABLE_BROWSER=false`.

## Scripts

```sh
npm run dev          # vite + workerd
npm run build        # deployable Worker under dist/
npm run deploy       # vite build && wrangler deploy  (production only)
npm run check:types
```

## Out of scope (this slice)

Clinic multi-provider fan-out, pi-extensible-workflows, always-on containers, `node --test` gates.

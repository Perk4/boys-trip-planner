# Boys trip planner

Proactive group-chat trip harness on **Flue 2.x + Cloudflare**, with **iMessage via Photon Spectrum**.

One Durable Object conversation is one trip (`trip:boys-vegas-2026`). Artifacts live on Cloudflare Computer (SQLite-backed `/workspace`). The iMessage Space is the human surface. Daily open-decision nudges and named research jobs (hotels for Madrid, etc.) run on the same Durable Object.

## Why iMessage is split in two processes

Photon’s own docs are the constraint, not a preference:

- Native Spectrum **webhooks** are signed JSON `POST`s. A Worker can verify HMAC and `dispatch` into Flue. That is inbound.
- **There is no public HTTP send-message API.** Replies require a long-lived Node/Bun `spectrum-ts` process calling `space.send(...)`. Cloud iMessage uses **gRPC** — “strict browser and worker isolates without Node APIs are not supported yet.”
- `@spectrum-ts/imessage-local` is the Mac Messages DB. It must not enter the Worker bundle.

So the Worker never imports `spectrum-ts`. Ingress is HMAC. Egress is an authenticated HTTP hop to `spectrum-sender/`.

```
iMessage Space (usable-core: DM Test Space)
    → Photon Spectrum Cloud
    → signed POST /channels/imessage/webhook     (this Worker: verify + dispatch)
         local: cloudflared HTTPS origin → vite dev :5173
    → TripPlanner DO  trip:<slug>
         Computer workspace: itinerary, sections, tasks, ledger
         scheduleEvery: open-decisions + research tick
    → post_to_channel claims /workspace/ledger/outbound.json
    → POST SPECTRUM_BRIDGE_URL/send
    → spectrum-sender  im.space.get(spaceId).send(...)
    → iMessage Space
```

Usable-core Bind is a **DM Test Space** on the project's shared-pool iMessage line (`spaceType` `dm`, `phone` omitted / `shared`). A live boys **group** needs a **Photon Business dedicated line** and is after this destination. Shared-pool lines do not create groups and do not subscribe to group-change events. `space.get(chatGuid)` works for an existing group; with two or more dedicated lines you must persist the webhook’s `space.phone` and pass it through.

`space.id` is opaque (DM like `any;-;+E.164`, groups = chat GUID). The Flue conversation id stays `trip:<slug>`. The Photon space is stored in `initialData` (`spaceId`, `spaceType`, `phone`), not encoded as the Durable Object name.

This slice maps **one iMessage space → one trip** via `TRIP_CONVERSATION_ID`.

## Phase 1 decisions

- **Channel: iMessage / Photon.** Worker verifies `X-Spectrum-Signature` (`HMAC-SHA256` over `v0:{timestamp}:{rawBody}`, 5-minute replay window). Idempotency is `imessage.message:<message.id>`.
- **Outbound:** Worker ledger, then sidecar `space.get`. Public `spectrum-ts` `space.send` does not take a caller `clientGuid`; the ledger + sidecar in-memory guid map are the dedup layers.
- **Conversation id:** `trip:<slug>` (default `trip:boys-vegas-2026`).
- **Model:** `cloudflare/@cf/moonshotai/kimi-k2.6` via the Workers AI binding.
- **Schedules:** Flue `extend` + Agents `scheduleEvery` on the same DO.
  - Open decisions: `NUDGE_EVERY_SECONDS` (default `86400`), key `schedule.open_decisions:<tripId>:<utc-day>`.
  - Research tick: `TASK_TICK_EVERY_SECONDS` (default `3600`). Payload attributes are derived from the interval **bucket** so same-period retries do not 409 with a different body.

## Persisted research jobs

A chat like “this week we want to find a hotel for the Madrid section” should become a **weekly** task, not a one-shot nudge.

| Path | Role |
| --- | --- |
| `/workspace/itinerary.md` | Roll-up: open decisions, legs, locks |
| `/workspace/sections/<slug>.md` | Facts for that city/leg (Madrid is seeded) |
| `/workspace/tasks/index.json` | Task ids |
| `/workspace/tasks/<id>.json` | `{ id, section, goal, cadence, status, lastPeriod }` |
| `/workspace/research/<taskId>/<period>.md` | What the agent wrote for that period |
| `/workspace/ledger/outbound.json` | Claim-then-send |

Cadence periods on the tick signal: `hourly` (`2026-09-14T03`), `daily` (`2026-09-14`), `weekly` (`2026-W37`). A task is due only when `status` is `active` and `lastPeriod` ≠ that period. After research + one `post_to_channel` (`schedule.research:<tripId>:<taskId>:<period>`), call `complete_scheduled_period`.

The hourly tick always `dispatch`es; the model must no-op when nothing is due.

## Setup

Do not HTTP-prime the Trip. Flue consults `initialData` only when the instance is created; later webhook Space fields are ignored. First contact that creates `trip:boys-vegas-2026` must be a Photon `messages` webhook via the tunnel.

```sh
npm install
npx wrangler login
cp .dev.vars.example .dev.vars
npm run sender:install
cp spectrum-sender/.env.example spectrum-sender/.env
```

`vite dev` uses the remote Workers AI binding. There is no model API key, but a Wrangler account session is required (`npx wrangler login`).

Fill names that already exist locally (do not commit values):

| Name | Where | Local usable-core |
| --- | --- | --- |
| `SPECTRUM_BRIDGE_URL` | `.dev.vars` | `http://127.0.0.1:8788` |
| `SPECTRUM_BRIDGE_TOKEN` | `.dev.vars` and `spectrum-sender/.env` (same value) | Required for `/send` |
| `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` | `spectrum-sender/.env` only | Sidecar `Spectrum()` |
| `SPECTRUM_WEBHOOK_SECRET` | `.dev.vars` | Photon’s one-time `signingSecret` after webhook registration (below). Not `standardSigningSecret` / `whsec_`. |
| `AGENT_HTTP_TOKEN` | `.dev.vars` | Leave unset so demo curls work without `Authorization` |

Use the inventoried **DM Test Space** (Photon DM GUID the sidecar can `space.get`). Do not use `local-dev-group`.

Non-secret vars (already in `wrangler.jsonc`):

| Name | Default |
| --- | --- |
| `TRIP_CONVERSATION_ID` | `trip:boys-vegas-2026` |
| `ENABLE_BROWSER` | `false` |
| `NUDGE_EVERY_SECONDS` | `86400` |
| `TASK_TICK_EVERY_SECONDS` | `3600` |

**Worker Loader** (`worker_loaders` / `LOADER`) is required for Cloudflare Computer’s just-bash backend. It is beta-gated on the Cloudflare account.

### Usable-core start order

Keep these processes running. Restart **only** `vite dev` after writing `SPECTRUM_WEBHOOK_SECRET`.

1. **Sidecar** (after filling `spectrum-sender/.env`):

```sh
npm run sender:dev
```

2. **Vite** (after filling `.dev.vars` except the webhook secret, which may still be empty):

```sh
npm run dev
```

An unset `SPECTRUM_WEBHOOK_SECRET` does not crash `vite dev`; `POST /channels/imessage/webhook` returns 500 until the secret is set and Vite is restarted.

3. **Tunnel** — [cloudflared Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) in front of local Vite. Photon will not POST to `127.0.0.1`.

```sh
cloudflared tunnel --url http://localhost:5173
```

Copy the printed `https://*.trycloudflare.com` origin. Keep this process up; a new origin is a new webhook URL.

4. **Register** the Photon webhook ([Managing webhooks](https://photon.codes/docs/webhooks/managing-webhooks)). Save `data.signingSecret` immediately — it is returned once.

```sh
curl -X POST "https://spectrum.photon.codes/projects/$SPECTRUM_PROJECT_ID/webhooks/" \
  -u "$SPECTRUM_PROJECT_ID:$SPECTRUM_PROJECT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://<cloudflared-host>/channels/imessage/webhook"}'
```

Put that `signingSecret` in `.dev.vars` as `SPECTRUM_WEBHOOK_SECRET`. Restart `vite dev`. Photon requires `https://` and a public address (Quick Tunnel satisfies both). If the tunnel origin changes, [list](https://photon.codes/docs/webhooks/managing-webhooks) / delete the old URL and register the new one (same body shape; new secret).

5. **Bind** — text the DM Test Space from iMessage. That signed `messages` POST creates the Trip. Do not `POST /agents/trip-planner/...` before this. `/internal/imessage-simulate` is an escape hatch, not the demo Bind path.

`npx flue run` does **not** emulate Cloudflare. Agent modules import `cloudflare:workers` — use `vite dev`.

### Proof commands (usable-core)

Minimum proof: webhook/curl transcripts for two inbound turns, one Nudge, one research tick, and one sidecar Outbound send, plus the ledger key and provider message id. Capture locally; do not commit secrets.

Two inbound turns on `trip:boys-vegas-2026` are iMessage texts to the DM Test Space (Photon → `POST /channels/imessage/webhook`). Save the Vite webhook lines (`200` / `ok`). Then read the same Trip:

```sh
curl -sS 'http://localhost:5173/agents/trip-planner/trip:boys-vegas-2026'
```

Nudge and research tick (do not wait for `scheduleEvery`):

```sh
curl -sS -D - -X POST 'http://localhost:5173/internal/nudge/trip:boys-vegas-2026'
curl -sS -D - -X POST 'http://localhost:5173/internal/research-tick/trip:boys-vegas-2026'
```

One sidecar Outbound send: save the `spectrum-sender` `POST /send` body (`providerMessageId`). Ledger key + provider message id from `/workspace/ledger/outbound.json` or that sidecar/tool response.

### HTTP turns after Bind (not first contact)

After the webhook has created the Trip, an HTTP user turn shares that history. **Do not** run this before Bind.

```sh
curl -X POST 'http://localhost:5173/agents/trip-planner/trip:boys-vegas-2026' \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"This week we want to find a hotel for the Madrid section of the trip."}'
```

### Simulate (escape hatch, not Bind)

Omit `spaceId` and the default is `local-dev-group`, which Photon cannot send to. Do not use this for the usable-core demo.

```sh
curl -X POST 'http://localhost:5173/internal/imessage-simulate/trip:boys-vegas-2026' \
  -H 'content-type: application/json' \
  -d '{"text":"Lock a Madrid hotel this week.","spaceId":"your-imessage-dm-guid","spaceType":"dm"}'
```

### Production secrets (deployed Worker)

Local `.dev.vars` is enough for `vite dev`. For a deployed Worker:

```sh
npx wrangler secret put SPECTRUM_WEBHOOK_SECRET
npx wrangler secret put SPECTRUM_BRIDGE_TOKEN
npx wrangler secret put AGENT_HTTP_TOKEN
```

`SPECTRUM_BRIDGE_URL` must be a URL the deployed Worker can reach. A production Worker cannot call `127.0.0.1` on your laptop. The sidecar must be a **Node or Bun** host.

## How the schedules fire

After the Durable Object exists (first message), `onStart` registers both timers.

Simulate without waiting:

```sh
curl -X POST 'http://localhost:5173/internal/nudge/trip:boys-vegas-2026'
curl -X POST 'http://localhost:5173/internal/research-tick/trip:boys-vegas-2026'
```

Same-period repeats reuse the idempotency key and return `{ deduplicated: true }`.

## Tools

- `research_web` — `fetch` + text extract. No browser.
- `post_to_channel` — sidecar send, destination bound from `initialData`, ledger claim first.
- `upsert_scheduled_task` / `complete_scheduled_period` — cadence jobs.
- `browse_page` — stub. Stays disabled while `ENABLE_BROWSER=false`.

## Scripts

```sh
npm run dev            # vite + workerd
npm run sender:dev     # spectrum-ts sidecar
npm run build          # deployable Worker under dist/
npm run deploy         # vite build && wrangler deploy  (production only)
npm run check:types
```

## Out of scope (this slice)

Clinic multi-provider fan-out, pi-extensible-workflows, always-on containers, `node --test` gates, Mac local iMessage (`@spectrum-ts/imessage-local`).

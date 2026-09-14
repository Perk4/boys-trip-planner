# Boys trip planner

Proactive group-chat trip harness on **Flue 2.x + Cloudflare**, with **iMessage via Photon Spectrum**.

One Durable Object conversation is one trip (`trip:boys-vegas-2026`). Artifacts live on Cloudflare Computer (SQLite-backed `/workspace`). The iMessage group is the human surface. Daily open-decision nudges and named research jobs (hotels for Madrid, etc.) run on the same Durable Object.

## Why iMessage is split in two processes

Photon’s own docs are the constraint, not a preference:

- Native Spectrum **webhooks** are signed JSON `POST`s. A Worker can verify HMAC and `dispatch` into Flue. That is inbound.
- **There is no public HTTP send-message API.** Replies require a long-lived Node/Bun `spectrum-ts` process calling `space.send(...)`. Cloud iMessage uses **gRPC** — “strict browser and worker isolates without Node APIs are not supported yet.”
- `@spectrum-ts/imessage-local` is the Mac Messages DB. It must not enter the Worker bundle.

So the Worker never imports `spectrum-ts`. Ingress is HMAC. Egress is an authenticated HTTP hop to `spectrum-sender/`.

```
iMessage group
    → Photon Spectrum Cloud
    → signed POST /channels/imessage/webhook     (this Worker: verify + dispatch)
    → TripPlanner DO  trip:<slug>
         Computer workspace: itinerary, sections, tasks, ledger
         scheduleEvery: open-decisions + research tick
    → post_to_channel claims /workspace/ledger/outbound.json
    → POST SPECTRUM_BRIDGE_URL/send
    → spectrum-sender  im.space.get(spaceId).send(...)
    → iMessage group
```

Boys-trip groups need a **Photon Business dedicated line**. Shared-pool lines do not create groups and do not subscribe to group-change events. `space.get(chatGuid)` works for an existing group; with two or more dedicated lines you must persist the webhook’s `space.phone` and pass it through.

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

```sh
npm install
cp .dev.vars.example .dev.vars
npm run sender:install
cp spectrum-sender/.env.example spectrum-sender/.env
npm run dev
```

In another terminal, after filling sidecar secrets:

```sh
npm run sender:dev
```

Workers AI needs no key. Photon secrets are optional for the local HTTP agent path. An unset `SPECTRUM_WEBHOOK_SECRET` does not crash `vite dev`; the webhook returns 500 until you set it.

### Required secrets (production)

| Name | Where | Why |
| --- | --- | --- |
| `SPECTRUM_WEBHOOK_SECRET` | Worker | HMAC for `/channels/imessage/webhook` (Photon’s `signingSecret` at registration) |
| `SPECTRUM_BRIDGE_URL` | Worker | Public base URL of `spectrum-sender` |
| `SPECTRUM_BRIDGE_TOKEN` | Worker + sidecar | Bearer for `/send` |
| `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` | Sidecar only | `Spectrum()` + `imessage.config()` auto-discovery |
| `AGENT_HTTP_TOKEN` | Worker | Bearer for `/agents/*` and `/internal/*` |

Non-secret vars (already in `wrangler.jsonc`):

| Name | Default |
| --- | --- |
| `TRIP_CONVERSATION_ID` | `trip:boys-vegas-2026` |
| `ENABLE_BROWSER` | `false` |
| `NUDGE_EVERY_SECONDS` | `86400` |
| `TASK_TICK_EVERY_SECONDS` | `3600` |

```sh
npx wrangler secret put SPECTRUM_WEBHOOK_SECRET
npx wrangler secret put SPECTRUM_BRIDGE_TOKEN
npx wrangler secret put AGENT_HTTP_TOKEN
```

Register the Photon webhook (save `signingSecret` once):

```sh
curl -X POST "https://spectrum.photon.codes/projects/$SPECTRUM_PROJECT_ID/webhooks/" \
  -u "$SPECTRUM_PROJECT_ID:$SPECTRUM_PROJECT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://<worker>/channels/imessage/webhook"}'
```

**Worker Loader** (`worker_loaders` / `LOADER`) is required for Cloudflare Computer’s just-bash backend. It is beta-gated on the Cloudflare account.

The sidecar must be a **Node or Bun** host the Worker can reach. A production Worker cannot call `127.0.0.1` on your laptop.

## Local path: one message, one reply

```sh
npm run dev
```

```sh
curl -X POST 'http://localhost:5173/agents/trip-planner/trip:boys-vegas-2026' \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"This week we want to find a hotel for the Madrid section of the trip."}'
```

That HTTP turn can write `/workspace/sections/madrid.md` and `upsert_scheduled_task`. It cannot text the group until a space is bound (real webhook or simulate **on the first dispatch** that creates the conversation) **and** the sidecar is up. `initialData` is how the Photon `space.id` is stored; do not HTTP-prime a trip if you still need to bind iMessage.

Bind a space without Photon:

```sh
curl -X POST 'http://localhost:5173/internal/imessage-simulate/trip:boys-vegas-2026' \
  -H 'content-type: application/json' \
  -d '{"text":"Lock a Madrid hotel this week.","spaceId":"your-imessage-group-guid","spaceType":"group","phone":"+15551234567"}'
```

`npx flue run` does **not** emulate Cloudflare. Agent modules import `cloudflare:workers` — use `vite dev`.

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

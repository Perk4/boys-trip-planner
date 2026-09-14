# Local usable-core path vs Flue 2.x and this repo

**Ticket:** [Does the documented local usable-core path match the code and Flue 2.x?](https://github.com/Perk4/boys-trip-planner/issues/4)
**Branch:** `research/local-usable-core-path`
**Question:** Against official Flue 2.x / Cloudflare Computer docs and this repo’s code + README, what would block a local usable-core demo (`vite dev`, same Trip history, artifacts, fetch research, Nudge, sidecar Outbound send)?

This note is facts and citations, not a rewrite. Domain terms: Trip, Trip id, Space, Test Space, Nudge, Research job, Outbound send (`CONTEXT.md`).

Pinned packages: `@flue/runtime` / `@flue/vite` / `@flue/cli` **2.0.5**, `@cloudflare/computer` **0.1.1**, `wrangler` **^4.113.0**.

`npx flue docs search` failed here (`Could not locate the bundled documentation`). Claims below go to https://flueframework.com/docs/, Cloudflare Developers, Photon, installed package types/source, and this repo.

---

## 1. `dispatch` + conversation `id` vs the README

### What the README claims

- One Durable Object conversation is one Trip. The Flue conversation id is `trip:<slug>` (default `trip:boys-vegas-2026`). The Photon `space.id` is **not** the Durable Object name; it is stored in `initialData`.
- HTTP `POST /agents/trip-planner/trip:boys-vegas-2026` with `{ "kind": "user", "body": "..." }` is one turn on that Trip.
- Webhook and `/internal/imessage-simulate/:tripId` `dispatch` into the same Trip id. `initialData` is how the Space is bound. Do not HTTP-prime a Trip if you still need to bind iMessage.
- Same-period Nudge / Research-job ticks reuse an `idempotencyKey` and return `{ deduplicated: true }`.

Sources: `README.md` (conversation id, local path, schedules, Phase 1).

### What Flue 2.x owns

- The agent function is addressable by `dispatch(agent, { id, message, ... })` and by `createAgentRouter(agent)` at `POST /:id`. The `:id` segment **is** the conversation id — the same `id` `dispatch()` / `init()` / `flue run --id` use. The instance is created on first contact. HTTP `POST` and `dispatch()` share one accepted order on that instance.
  - [Agents](https://flueframework.com/docs/guide/building-agents/): “It’s up to you what the ID means… Each agent instance is persisted by ID.”
  - [Routing](https://flueframework.com/docs/guide/routing/): `POST /:id` delivers one message (`202` on admission). “Mounting and dispatching also compose… both feed the same per-conversation queue.”
  - [Agent API](https://flueframework.com/docs/reference/agent-api/): `props.id` is “the `:id` segment of the agent’s conversation URL, the `id` of a `dispatch()`/`init()` call.” `dispatch()` request fields: `id`, `message`, `initialData?`, `uid?`.
- `initialData` is consulted **only** when the send **creates** the instance; later sends ignore it. Pair with `uid: null` to error instead of silently ignoring.
  - Same Agent API page; [Channels](https://flueframework.com/docs/guide/channels/) (“Creation data”).
- Direct HTTP body is a `DeliveredMessage`, optionally with top-level `initialData` / `uid` siblings (`202` with `streamUrl` / `offset` / `submissionId`). There is no wait-for-reply mode on `POST`.
  - [Routing — Sending a message](https://flueframework.com/docs/guide/routing/).
- `flue run` is Node-local and does **not** emulate Cloudflare. A module that imports `cloudflare:*` fails with a pointer at `vite dev`.
  - [Deploy to Cloudflare §6](https://flueframework.com/docs/ecosystem/deploy/cloudflare/); [flue run](https://flueframework.com/docs/cli/run/).
- Idempotent delivery: a caller `idempotencyKey` names the delivery. Same key + same payload converges (`deduplicated: true`); same key + different payload is `409` `submission_conflict`. Keys are scoped to `(agent, id)`.
  - Documented on [Channels](https://flueframework.com/docs/guide/channels/) (“Deliveries can repeat”).
  - Implemented on `AgentDispatchRequest` in `@flue/runtime` 2.0.5 (`node_modules/@flue/runtime/dist/types-CVx9SjIx.d.mts`) and in `dispatch-sA5fL0Q1.mjs` / `errors-CsDcT_C4.mjs` (`deriveKeyedSubmissionId`).
  - The published Agent API HTML for `dispatch()` **omits** `idempotencyKey` and `deduplicated` on the receipt. That page is stale relative to 2.0.5 types and the Channels guide. The runtime owns the behavior the README uses.

### What this repo does

| Surface | Conversation `id` | `initialData` | `idempotencyKey` |
| --- | --- | --- | --- |
| `createAgentRouter(TripPlanner)` at `/agents/trip-planner` | Path `:id` (README curl uses `trip:boys-vegas-2026`) | Only if the HTTP body includes it. README curl does **not**. | Only if the HTTP body includes it. README curl does **not**. |
| `POST /channels/imessage/webhook` | `resolveTripConversationId(process.env.TRIP_CONVERSATION_ID)` → default `trip:boys-vegas-2026` | Photon Space (`spaceId`, `spaceType`, `phone`, …) | `imessage.message:<message.id>` |
| `POST /internal/imessage-simulate/:tripId` | Path, normalized by `tripConversationId` | Same Space shape; defaults `spaceId` to `local-dev-group` if omitted | `imessage.message:<messageId>` |
| `POST /internal/nudge/:tripId` | Path | None | `schedule.open_decisions:<tripId>:<utc-day>` |
| `POST /internal/research-tick/:tripId` | Path | None | `schedule.research_tick:<tripId>:<bucket>` |
| `scheduleEvery` callbacks on the DO | `this.name` (Agents SDK instance name) | None | Same keys as the internal routes |

Sources: `src/app.ts`, `src/channels/imessage.ts`, `src/agents/trip-planner.ts`, `src/lib/trip-id.ts`, `src/lib/imessage-event.ts`, `src/lib/nudge-signal.ts`, `src/lib/research-tick-signal.ts`.

`tripConversationId` accepts `trip:boys-vegas-2026` or `boys-vegas-2026` and rejects anything that is not `trip:[a-z0-9]+(-[a-z0-9]+)*`. Colon in the URL path is an ordinary segment; Hono / Flue treat it as the id.

Webhook and HTTP/simulate can diverge: the webhook **always** uses `TRIP_CONVERSATION_ID`, while the mounted router and `/internal/*` use the path. Usable-core stays on one Trip only if every turn uses the same Trip id (the README default).

`admitDispatch` maps a `409` to `{ deduplicated: true }` (`src/lib/dispatch-conflict.ts`). Same-key / same-body retries should instead return a receipt that already has `deduplicated: true` (Flue Channels + runtime). The `409` handler is the “different body, same key” path. Research-tick attributes are derived from the interval **bucket** so same-period retries keep the same payload (`README.md` Phase 1; `src/lib/research-tick-signal.ts`).

**Verdict:** `dispatch` + conversation `id` behave as the README claims. HTTP `POST` and `dispatch()` on `trip:boys-vegas-2026` are the same Trip. The README’s warning about HTTP-priming is not style — it is Flue’s `initialData`-on-create rule.

---

## 2. Computer seed / ledger / schedule vs `extend` + `scheduleEvery`

### Documented Flue / Computer pattern

- Files that must survive are **not** implied by conversation SQLite. The default virtual sandbox is in-memory. Durable files need a workspace or container.
  - [Deploy to Cloudflare — Conversation persistence](https://flueframework.com/docs/ecosystem/deploy/cloudflare/): “Filesystem durability remains a separate decision.”
- Cloudflare Computer wraps `@cloudflare/computer` `Workspace`: SQLite-backed virtual FS **in the agent’s own Durable Object**. Worker-shell (just-bash) runs in a Dynamic Worker via Worker Loader. Preview only, not production.
  - [Cloudflare Computer](https://flueframework.com/docs/ecosystem/sandboxes/cloudflare-computer/)
  - [Preview: @cloudflare/computer](https://developers.cloudflare.com/changelog/post/2026-08-03-cloudflare-computer/)
  - Package README (`node_modules/@cloudflare/computer/README.md`): “PREVIEW ONLY… NOT suitable for production”; ~10 GB, shares DO SQLite.
- Official Computer **agent** wiring: `useSandbox(getComputerSandbox({ loader: env.LOADER }))` and `export { workspaceHost as cloudflare } from '.../cloudflare-computer'`.
- Official **schedule** wiring on Cloudflare for a timer that belongs to **one conversation**: per-module `extend()` + Agents SDK `onStart` / `scheduleEvery`. Cron Triggers are the other tool (Worker-level, outside any conversation).
  - [Deploy to Cloudflare — Extending generated Cloudflare Durable Objects](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)
  - [Schedules — Scheduling on Cloudflare](https://flueframework.com/docs/guide/schedules/)
- Flue applies one `cloudflare` export per agent module (`base` then generated subclass). Do not override `fetch` / `onRequest` / `onFiberRecovered` / `alarm`.
- `scheduleEvery` is idempotent on `(callback, interval, payload)` and is safe in `onStart` (runs on every DO wake). A **changed** interval creates a **second** schedule.
  - [agents scheduling](https://github.com/cloudflare/agents) via `node_modules/agents/docs/scheduling.md`
- `this.name` is the Agent **instance** name (the `idFromName` / `getAgentByName` name).
  - `node_modules/agents/docs/http-websockets.md`, `agent-class.md`

### What this repo does

**Host + schedule are one composed `cloudflare` export**, not the Computer one-liner:

```ts
// src/agents/trip-planner.ts
const Hosted = hostedBase(Base); // workspaceHost.base
return class extends Hosted {
  async onStart() {
    await this.scheduleEvery(nudgeIntervalSeconds(this), 'nudgeOpenDecisions');
    await this.scheduleEvery(taskTickIntervalSeconds(this), 'tickResearchTasks');
  }
  // callbacks dispatch(TripPlanner, { id: this.name, idempotencyKey, message })
};
```

That matches Flue’s single-`extend` rule. The Computer page’s `export { workspaceHost as cloudflare }` cannot also attach `scheduleEvery`; composing `workspaceHost.base` is the way to host both. Callbacks no-op unless `this.name` is a Trip id (`isTripConversationId`).

**Seed / ledger** wrap `getComputerSandbox` and write only if missing (`src/lib/trip-workspace.ts`):

| Path | Role |
| --- | --- |
| `/workspace/itinerary.md` | Seeded roll-up (Madrid hotel still listed). Trip id interpolated. |
| `/workspace/sections/madrid.md` | Seeded section |
| `/workspace/tasks/index.json` | Empty task index |
| `/workspace/ledger/outbound.json` | Empty ledger |
| `/workspace/sections/.keep` | Directory keep |

Ledger path matches the map note: `/workspace/ledger/outbound.json`. `post_to_channel` claims that file before the sidecar POST (`src/tools/post-to-channel.ts`, `src/lib/outbound-ledger.ts`).

Seed uses `sandbox.writeFile` (Workspace `fs`), not `runtime.exec`. Worker-shell `loader.get(...)` runs on first **exec** (`@cloudflare/computer/dist/backends/worker-shell/index.js` `#resolveFetcher`). Artifact seed can succeed even if a later `bash` exec fails. Flue’s standard `bash`/`grep`/`glob` tools still expect `exec()`.

Intervals come from Worker `env` (`NUDGE_EVERY_SECONDS`, `TASK_TICK_EVERY_SECONDS`) with the same defaults as `wrangler.jsonc` (86400 / 3600), minimum 60 seconds (`src/lib/env-interval.ts`). Changing those vars after a Trip already woke would register a second `scheduleEvery` (Agents SDK). Demo simulation does not need to wait: `/internal/nudge/:tripId` and `/internal/research-tick/:tripId`.

SQLite class migration `new_sqlite_classes: ["FlueTripPlannerAgent"]` matches Flue’s generated name for `TripPlanner` (`wrangler.jsonc`; [Deploy to Cloudflare §4](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)).

**Verdict:** Computer seed, ledger path, and schedules match the documented `extend` + `scheduleEvery` pattern. The agent composes Computer host + timers in one `cloudflare` export, which Flue requires.

---

## 3. Worker Loader / `experimental` / `WorkspaceServiceProxy` vs `vite dev`

### Requirements the Computer adapter owns

Flue Computer + `@cloudflare/computer` worker-shell require:

1. `"worker_loaders": [{ "binding": "LOADER" }]`
2. `"compatibility_flags": ["nodejs_compat", "experimental"]`
3. Entry-module export of `WorkspaceServiceProxy` (loopback: `ctx.exports.WorkspaceServiceProxy`)
4. Agent DO hosts the workspace (`workspaceHost` / composed `cloudflare`)

This repo has all four: `wrangler.jsonc`, `src/cloudflare.ts` (`export { WorkspaceServiceProxy } from '@cloudflare/computer'`), composed host in `src/agents/trip-planner.ts`.

Flue: named exports from `src/cloudflare.ts` become top-level Worker exports; do not export `fetch` from that file ([Deploy to Cloudflare — Extending the Worker](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)). Worker-shell sets `env: { HOST: ctx.exports.WorkspaceServiceProxy({ props: workspace }) }` (`@cloudflare/computer/dist/backends/worker-shell/index.js`).

Dynamic Worker load options: parent may set `allowExperimental` only if the **caller** has compatibility flag `"experimental"`. “Experimental flags cannot be enabled in production.”
Source: [Dynamic Workers API](https://developers.cloudflare.com/dynamic-workers/api-reference/).

This package’s default Dynamic Worker flags are `["nodejs_compat"]` only — it does **not** pass `allowExperimental` or `experimental` into `loader.get` (`DEFAULT_COMPAT_FLAGS` in worker-shell). The **parent** Worker still lists `experimental` because Computer / Flue say the shell backend needs it.

### Local `vite dev`

- Flue Cloudflare local path is `vite` + `@cloudflare/vite-plugin` + `flue()`. `vite.config.ts` matches the documented plugin order (`flue()` then `cloudflare({ config: flueWorkerConfig() })`).
  - [Deploy to Cloudflare](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)
- Local workerd simulates bindings by default, except AI (always remote).
  - [Local development](https://developers.cloudflare.com/workers/local-development/)
  - [Supported bindings per development mode](https://developers.cloudflare.com/workers/local-development/bindings-per-env/) — **Worker Loader is not in that table** (table last updated 2026-06-25; Dynamic Workers pages are newer).
- Wrangler 4.113.0 classifies `worker_loader` as **`local-only`** (cannot be `remote: true`) and prints Worker Loader bindings as `isSimulatedLocally: true`.
  - `node_modules/wrangler/wrangler-dist/cli.js` (`BINDING_LOCAL_SUPPORT.worker_loader`, bindings printer).

So: official **docs table** is incomplete; **Wrangler** treats Loader as a local simulation, same class as Durable Objects. First-party evidence says `vite dev` should mint `env.LOADER`. Whether this Cloudflare **account** is beta-gated is a **production / dashboard** question. Flue Computer still says Loader is “currently beta-gated”; [Dynamic Workers getting started](https://developers.cloudflare.com/dynamic-workers/getting-started/) does not. The map already lists that as unspecified until someone actually runs.

`worker-configuration.d.ts` (generated) types `LOADER: WorkerLoader` with `experimental,nodejs_compat` for workerd `1.20260911.1`.

### Workers AI on `vite dev`

`useModel('cloudflare/@cf/moonshotai/kimi-k2.6')` + `wrangler.jsonc` `"ai": { "binding": "AI" }`. Flue: Workers AI specifiers skip provider API keys ([Getting Started](https://flueframework.com/docs/), [Deploy to Cloudflare §5](https://flueframework.com/docs/ecosystem/deploy/cloudflare/)).

Cloudflare: AI has **no local simulator**. `wrangler dev` / `vite dev` call the account remotely and **incur usage**. Login is required.
Source: [bindings-per-env](https://developers.cloudflare.com/workers/local-development/bindings-per-env/); [Workers AI + Wrangler](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/) (“You will be prompted to log in”).

README “Workers AI needs no key” is true for an API key and incomplete for **account login**.

---

## 4. Gaps, stale README steps, undocumented secrets

### Secrets and env (documented vs required for the demo)

| Name | Where | README | Needed for usable-core on `vite dev`? |
| --- | --- | --- | --- |
| `SPECTRUM_WEBHOOK_SECRET` | Worker `.dev.vars` | Required in production; unset does not crash `vite dev`; webhook returns 500 | **No** for HTTP + `/internal/imessage-simulate` |
| `SPECTRUM_BRIDGE_URL` | Worker | Default in `.dev.vars.example`: `http://127.0.0.1:8788` | **Yes** for Outbound send |
| `SPECTRUM_BRIDGE_TOKEN` | Worker + sidecar | Required to send | **Yes** for Outbound send (empty → tool `ok: false`) |
| `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET` | Sidecar only | Documented | **Yes** for a real sidecar send (`spectrum-sender/src/server.ts`) |
| `AGENT_HTTP_TOKEN` | Worker | Optional; when set, `/agents/*` and `/internal/*` need `Authorization: Bearer` | **Only if set.** README curls omit the header |
| Workers AI | Account | “Needs no key” | **`wrangler` login** (undocumented in README) |
| Computer / Loader | Wrangler | “No API keys” (Flue Computer) | Binding + `experimental`; no extra secret |

`.dev.vars.example` and `.env.example` agree. `.gitignore` keeps `.dev.vars` / `.env` out of git.

Photon HMAC (`v0:{timestamp}:{rawBody}`, 5-minute window) matches [Verifying signatures](https://photon.codes/docs/webhooks/verifying-signatures) (`src/lib/spectrum-webhook.ts`).

### Stale or incomplete README steps

1. **Order of first contact.** “Local path: one message, one reply” HTTP-creates the Trip **without** Space `initialData`. Flue then ignores later simulate/webhook `initialData`. `post_to_channel` returns “No iMessage space is bound”. README says this; the **first** snippet is still the HTTP curl. For usable-core (one real Outbound send), first create must be simulate or webhook with a real Test Space id.
2. **Simulate default Space.** Omitted `spaceId` becomes `local-dev-group` (`src/app.ts`). README example passes a GUID. A default fake id would bind a Space Photon cannot send to; the ledger can still claim.
3. **No history read.** Destination is two inbound turns on the **same** history. Flue: `GET /agents/trip-planner/:id` (optional `?view=history`). README never shows a read. `POST` is fire-and-forget `202`.
4. **Nudge cadence vs demo.** `scheduleEvery(86400)` will not fire during a short session. `/internal/nudge/...` is the documented simulate path and is enough.
5. **Madrid seed on a Vegas Trip id.** Seed content is Madrid (`src/lib/itinerary-seed.ts`). Routing/id are `trip:boys-vegas-2026`. Map already lists replacing the seed as not-yet-specified. Not a wiring mismatch.
6. **`flue docs search`.** `@flue/cli` 2.0.5 `package.json` lists a `docs/` directory; this install has no bundled docs. Process gap only.
7. **Published Agent API** omits `idempotencyKey` (see §1). Runtime + Channels match the README.

### Photon / sidecar (Outbound send)

README split (Worker HMAC in, Node `spectrum-ts` out) matches Photon:

- No public HTTP send-message API. Reply with `spectrum-ts` `space.send(...)`.
  - [Webhook quickstart](https://photon.codes/docs/webhooks/quickstart), [Events](https://photon.codes/docs/webhooks/events)
- Cloud iMessage is gRPC; “strict browser and worker isolates without Node APIs are not supported yet.”
  - [spectrum-ts iMessage](https://photon.codes/docs/spectrum-ts/providers/imessage)
- `space.get(chatGuid)` looks up an existing Space. Two or more dedicated lines require `params.phone`.
  - [Connection and routing](https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing)
- Shared-pool: no **group create** / group-change events. Existing groups can still be referenced with `space.get`. Business dedicated line is for group **workflows** / creating groups — map already parks a live boys group as not-yet-specified.

Sidecar (`spectrum-sender/`) implements `space.get` + `send`, in-memory `clientGuid` dedup, Bearer token. It never enters the Worker bundle (Vite `watch.ignored`, README, `AGENTS.md`).

A production Worker cannot call `127.0.0.1` (README). Local usable-core **can**.

Flue channels are ingress-only; outbound is an application tool against the provider SDK ([Channels — Use provider SDKs](https://flueframework.com/docs/guide/channels/)). `post_to_channel` matches that split.

---

## 5. Blockers / non-blockers for the usable-core demo

Usable-core (map #1): on `vite dev`, Trip `trip:boys-vegas-2026` takes two inbound turns on the same history, persists artifacts, runs fetch research, accepts a Nudge, and completes one real Outbound send through the sidecar to a Test Space.

### Blockers (path / docs / secrets — would stop that demo)

1. **HTTP-prime then bind Space.** If the first contact is the README HTTP curl, Flue records empty `initialData` and never stores the Test Space. Outbound send cannot succeed on that Trip. First create must be `/internal/imessage-simulate/...` (or a real webhook) with a real `spaceId`.
2. **Sidecar secrets + reachable Test Space.** Outbound send needs `SPECTRUM_BRIDGE_URL`, matching `SPECTRUM_BRIDGE_TOKEN` on Worker and sidecar, `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET`, `npm run sender:dev`, and a Photon-resolvable Test Space id (`space.get`). Empty token/URL fail in-process (`src/lib/spectrum-bridge.ts`). Fake `local-dev-group` fails at Photon after a ledger claim.
3. **Workers AI account session.** `vite dev` uses the remote AI binding. No model key, but `wrangler` login (and usage) is required. README does not say so. Without it, no turns / research / Nudge / tool calls run.

### Non-blockers (documented path matches code + Flue 2.x)

1. **`dispatch` + Trip id.** Mounted `POST /agents/trip-planner/:id` and `dispatch(TripPlanner, { id })` are the same conversation. Two turns on `trip:boys-vegas-2026` share history.
2. **`flue run`.** Correctly rejected; `vite dev` is the local Cloudflare path.
3. **Computer seed + ledger path.** First sandbox create writes itinerary / Madrid section / tasks index / `/workspace/ledger/outbound.json` on the Trip DO’s SQLite Workspace.
4. **`extend` + `scheduleEvery`.** Composed Computer host + `onStart` timers + `dispatch` back into the same Trip id. `/internal/nudge` and `/internal/research-tick` exercise Nudge / Research-job ticks without waiting 86400s / 3600s.
5. **Worker Loader / `experimental` / `WorkspaceServiceProxy` on local `vite dev`.** Authoring matches Flue Computer + `@cloudflare/computer`. Wrangler simulates `worker_loader` locally. Account beta-gating is a **deploy** unknown (map #1), not a documented local-config miss. Seed/ledger `writeFile` does not wait on `loader.get`.
6. **`SPECTRUM_WEBHOOK_SECRET`.** Not required for HTTP or simulate.
7. **`AGENT_HTTP_TOKEN` unset.** Middleware is a no-op; README curls work.
8. **Fetch research tool.** `research_web` is `fetch` + extract; no extra secret. (`browse_page` stays stubbed at `ENABLE_BROWSER=false`.)
9. **Photon Business dedicated line.** Not required to `space.get` an **existing** Test Space. Required later for creating / managing a live boys group (out of this ticket).
10. **Madrid seed vs Vegas Trip id.** Content leftover, not a routing bug.
11. **Published Agent API missing `idempotencyKey`.** Stale HTML; 2.0.5 runtime + Channels match this repo.

### Not claimed (must be observed at runtime)

- Whether Loader / Computer preview throws on **this** account in production (map “Not yet specified”).
- Whether the model actually calls `upsert_scheduled_task` / `research_web` / `post_to_channel` on a given prompt.
- Whether `this.name` in a local DO alarm is always the Trip id (Agents SDK documents that it is).

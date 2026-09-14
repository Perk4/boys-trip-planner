# AGENTS.md

Flue 2.x Cloudflare project. Agents are TypeScript functions with `'use agent'`.

## Layout

- `src/agents/trip-planner.ts` — `TripPlanner` + composed `cloudflare` extend (Computer host, daily nudge, research tick)
- `src/app.ts` — agent router, iMessage webhook, internal nudge / research-tick / imessage-simulate
- `src/cloudflare.ts` — `WorkspaceServiceProxy` export for Computer
- `src/sandboxes/cloudflare-computer.ts` — official Computer adapter
- `src/channels/imessage.ts` — Photon HMAC webhook → `dispatch` to `trip:*`
- `src/tools/` — research, outbound post, scheduled tasks, browser stub
- `src/lib/` — trip id, ledger, Spectrum verify, task/section helpers, tick payloads
- `spectrum-sender/` — Node `spectrum-ts` process. **Do not import it from `src/`.**
- `wrangler.jsonc` — AI binding, Worker Loader, `FlueTripPlannerAgent` migration

## Commands

- `npm run dev` — local workerd via Vite
- `npm run sender:dev` — sidecar (separate package)
- `npm run check:types`
- `npx flue docs search <query>`
- Do not use `npx flue run` for this agent (Cloudflare-only imports)
- Do not use `npx wrangler deploy` except for production
- Do not add `@spectrum-ts/imessage-local` to either package

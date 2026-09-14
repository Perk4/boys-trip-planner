# AGENTS.md

Flue 2.x Cloudflare project. Agents are TypeScript functions with `'use agent'`.

## Layout

- `src/agents/trip-planner.ts` — `TripPlanner` + composed `cloudflare` extend (Computer host + daily nudge)
- `src/app.ts` — route map: agent, Telegram channel, internal nudge
- `src/cloudflare.ts` — `WorkspaceServiceProxy` export for Computer
- `src/sandboxes/cloudflare-computer.ts` — official Computer adapter (`flue add sandbox cloudflare-computer`)
- `src/channels/telegram.ts` — verified webhook → `dispatch` to `trip:*`
- `src/tools/` — research, outbound post, browser stub
- `src/lib/` — trip id, ledger, extract, nudge message (pure functions)
- `wrangler.jsonc` — AI binding, Worker Loader, `FlueTripPlannerAgent` migration

## Commands

- `npm run dev` — local workerd via Vite
- `npm run check:types`
- `npx flue docs search <query>`
- Do not use `npx flue run` for this agent (Cloudflare-only imports)
- Do not use `npx wrangler deploy` except for production

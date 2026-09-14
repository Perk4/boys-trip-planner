import { dispatch } from '@flue/runtime';
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import * as v from 'valibot';
import { TripPlanner } from './agents/trip-planner.ts';
import { imessageChannel } from './channels/imessage.ts';
import { isSubmissionConflict } from './lib/dispatch-conflict.ts';
import { bearerMatches } from './lib/http-auth.ts';
import { inboundToInitialData } from './lib/imessage-event.ts';
import {
	openDecisionsIdempotencyKey,
	openDecisionsMessage,
	utcDayIso,
} from './lib/nudge-signal.ts';
import {
	researchTickClock,
	researchTickIdempotencyKey,
	researchTickMessage,
} from './lib/research-tick-signal.ts';
import { envIntervalSeconds } from './lib/env-interval.ts';
import { spaceTypeSchema } from './lib/trip-schemas.ts';
import { tripConversationId } from './lib/trip-id.ts';

const DEFAULT_TASK_TICK_EVERY_SECONDS = 3_600;
const MIN_SCHEDULE_SECONDS = 60;

const simulateInbound = v.object({
	text: v.pipe(v.string(), v.minLength(1)),
	spaceId: v.optional(v.string()),
	spaceType: v.optional(spaceTypeSchema),
	phone: v.optional(v.string()),
	senderId: v.optional(v.string()),
	messageId: v.optional(v.string()),
});

const app = new Hono();

app.use('/agents/*', async (c, next) => {
	const token = process.env.AGENT_HTTP_TOKEN;
	if (token && !bearerMatches(c.req.header('Authorization'), token)) {
		return c.text('Unauthorized', 401);
	}
	await next();
});

app.use('/internal/*', async (c, next) => {
	const token = process.env.AGENT_HTTP_TOKEN;
	if (token && !bearerMatches(c.req.header('Authorization'), token)) {
		return c.text('Unauthorized', 401);
	}
	await next();
});

app.get('/api/ping', (c) => c.json({ ok: true }));

app.route('/agents/trip-planner', createAgentRouter(TripPlanner));
app.route('/channels/imessage', imessageChannel);

app.post('/internal/nudge/:tripId', async (c) => {
	const parsedId = parseTripParam(c.req.param('tripId'));
	if (!parsedId.ok) return c.json({ error: parsedId.error }, 400);
	const dayIso = utcDayIso();
	return admitDispatch(() =>
		dispatch(TripPlanner, {
			id: parsedId.tripId,
			idempotencyKey: openDecisionsIdempotencyKey(parsedId.tripId, dayIso),
			message: openDecisionsMessage(dayIso),
		}),
	);
});

app.post('/internal/research-tick/:tripId', async (c) => {
	const parsedId = parseTripParam(c.req.param('tripId'));
	if (!parsedId.ok) return c.json({ error: parsedId.error }, 400);
	const interval = envIntervalSeconds(
		process.env.TASK_TICK_EVERY_SECONDS,
		DEFAULT_TASK_TICK_EVERY_SECONDS,
		MIN_SCHEDULE_SECONDS,
	);
	const clock = researchTickClock(new Date(), interval);
	return admitDispatch(() =>
		dispatch(TripPlanner, {
			id: parsedId.tripId,
			idempotencyKey: researchTickIdempotencyKey(parsedId.tripId, clock.period),
			message: researchTickMessage(clock),
		}),
	);
});

app.post('/internal/imessage-simulate/:tripId', async (c) => {
	const parsedId = parseTripParam(c.req.param('tripId'));
	if (!parsedId.ok) return c.json({ error: parsedId.error }, 400);

	const body = await c.req.json().catch(() => null);
	const parsed = v.safeParse(simulateInbound, body);
	if (!parsed.success) {
		return c.json({ error: 'Expected { text } and optional space fields' }, 400);
	}

	const inbound = {
		messageId: parsed.output.messageId ?? `local-sim-${crypto.randomUUID()}`,
		spaceId: parsed.output.spaceId ?? 'local-dev-group',
		spaceType: parsed.output.spaceType ?? 'group',
		phone: parsed.output.phone ?? 'shared',
		...(parsed.output.senderId === undefined ? {} : { senderId: parsed.output.senderId }),
		body: parsed.output.text,
	};

	return admitDispatch(() =>
		dispatch(TripPlanner, {
			id: parsedId.tripId,
			idempotencyKey: `imessage.message:${inbound.messageId}`,
			initialData: inboundToInitialData(inbound),
			message: {
				kind: 'signal',
				type: 'imessage.message',
				body: inbound.body,
				attributes: {
					messageId: inbound.messageId,
					spaceId: inbound.spaceId,
					spaceType: inbound.spaceType,
					phone: inbound.phone,
					simulated: 'true',
				},
			},
		}),
	);
});

function parseTripParam(raw: string): { ok: true; tripId: string } | { ok: false; error: string } {
	try {
		return { ok: true, tripId: tripConversationId(raw) };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : 'Invalid trip id' };
	}
}

async function admitDispatch(run: () => Promise<unknown>) {
	try {
		const receipt = await run();
		return Response.json(receipt, { status: 202 });
	} catch (error) {
		if (isSubmissionConflict(error)) {
			return Response.json(
				{ deduplicated: true, submissionId: error.submissionId ?? null },
				{ status: 202 },
			);
		}
		throw error;
	}
}

export default app;

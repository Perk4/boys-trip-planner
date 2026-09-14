import { dispatch } from '@flue/runtime';
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { TripPlanner } from './agents/trip-planner.ts';
import { channel as telegram } from './channels/telegram.ts';
import { bearerMatches } from './lib/http-auth.ts';
import { openDecisionsIdempotencyKey, openDecisionsMessage, utcDayIso } from './lib/nudge-signal.ts';
import { tripConversationId } from './lib/trip-id.ts';

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
app.route('/channels/telegram', telegram.route());

app.post('/internal/nudge/:tripId', async (c) => {
	let tripId: string;
	try {
		tripId = tripConversationId(c.req.param('tripId'));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid trip id';
		return c.json({ error: message }, 400);
	}
	const dayIso = utcDayIso();
	try {
		const receipt = await dispatch(TripPlanner, {
			id: tripId,
			idempotencyKey: openDecisionsIdempotencyKey(tripId, dayIso),
			message: openDecisionsMessage(dayIso),
		});
		return c.json(receipt, 202);
	} catch (error) {
		if (isSubmissionConflict(error)) {
			return c.json(
				{ deduplicated: true, submissionId: error.submissionId ?? null },
				202,
			);
		}
		throw error;
	}
});

function isSubmissionConflict(
	error: unknown,
): error is { status: number; submissionId?: string } {
	return (
		typeof error === 'object' &&
		error !== null &&
		'status' in error &&
		(error as { status: unknown }).status === 409
	);
}

export default app;

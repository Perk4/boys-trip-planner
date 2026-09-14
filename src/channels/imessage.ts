import { dispatch } from '@flue/runtime';
import { Hono } from 'hono';
import { TripPlanner } from '../agents/trip-planner.ts';
import { inboundToInitialData, parseIMessageMessagesEvent } from '../lib/imessage-event.ts';
import { resolveTripConversationId } from '../lib/trip-id.ts';
import { verifySpectrumWebhook } from '../lib/spectrum-webhook.ts';

export const imessageChannel = new Hono();

imessageChannel.post('/webhook', async (c) => {
	const secret = process.env.SPECTRUM_WEBHOOK_SECRET;
	if (!secret) {
		return c.text('webhook secret not configured', 500);
	}

	const rawBody = await c.req.text();
	const verified = await verifySpectrumWebhook({
		rawBody,
		secret,
		timestamp: c.req.header('X-Spectrum-Timestamp'),
		signature: c.req.header('X-Spectrum-Signature'),
		nowSeconds: Math.floor(Date.now() / 1000),
	});
	if (!verified.ok) {
		return c.text(verified.reason, verified.status);
	}

	const eventName = c.req.header('X-Spectrum-Event');
	if (eventName !== 'messages') {
		return c.text('ok', 200);
	}

	const inbound = parseIMessageMessagesEvent(rawBody);
	if (!inbound) {
		return c.text('invalid payload', 400);
	}

	const tripId = resolveTripConversationId(process.env.TRIP_CONVERSATION_ID);
	await dispatch(TripPlanner, {
		id: tripId,
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
				...(inbound.senderId === undefined ? {} : { senderId: inbound.senderId }),
			},
		},
	});

	return c.text('ok', 200);
});

import type { DeliveredMessage } from '@flue/runtime';

export const OPEN_DECISIONS_SIGNAL_TYPE = 'schedule.open_decisions';

export function openDecisionsMessage(dayIso: string): DeliveredMessage {
	return {
		kind: 'signal',
		type: OPEN_DECISIONS_SIGNAL_TYPE,
		body:
			'The group has been quiet. Read /workspace/itinerary.md. ' +
			'If unchecked open decisions remain, post one short nudge listing only those. ' +
			'If everything is decided, say so and do not nag.',
		attributes: { scheduledAt: dayIso, cadence: 'daily' },
	};
}

export function openDecisionsIdempotencyKey(tripId: string, dayIso: string): string {
	return `${OPEN_DECISIONS_SIGNAL_TYPE}:${tripId}:${dayIso}`;
}

export function utcDayIso(at: Date = new Date()): string {
	return at.toISOString().slice(0, 10);
}

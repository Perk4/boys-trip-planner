import type { DeliveredMessage } from '@flue/runtime';
import {
	dateFromIntervalBucket,
	intervalBucket,
	utcDayIso,
	utcHourIso,
	utcIsoWeek,
} from './utc-periods.ts';

export const RESEARCH_TICK_SIGNAL_TYPE = 'schedule.research_tick';

export interface ResearchTickClock {
	period: string;
	hourly: string;
	daily: string;
	weekly: string;
}

export function researchTickClock(at: Date, intervalSeconds: number): ResearchTickClock {
	const bucket = intervalBucket(at, intervalSeconds);
	const bucketDate = dateFromIntervalBucket(bucket, intervalSeconds);
	return {
		period: String(bucket),
		hourly: utcHourIso(bucketDate),
		daily: utcDayIso(bucketDate),
		weekly: utcIsoWeek(bucketDate),
	};
}

export function researchTickMessage(clock: ResearchTickClock): DeliveredMessage {
	return {
		kind: 'signal',
		type: RESEARCH_TICK_SIGNAL_TYPE,
		body:
			'Read /workspace/tasks/index.json and each /workspace/tasks/<id>.json. ' +
			'A task is due only when status is active and lastPeriod is not the period for its cadence ' +
			'(hourly / daily / weekly attributes on this signal). ' +
			'For each due task: read /workspace/itinerary.md and /workspace/sections/<section>.md, ' +
			'research_web, write findings to the section file and /workspace/research/<taskId>/<period>.md, ' +
			'post_to_channel once with idempotencyKey schedule.research:<tripId>:<taskId>:<period>, ' +
			'then complete_scheduled_period. If nothing is due, do not post.',
		attributes: {
			tickPeriod: clock.period,
			hourly: clock.hourly,
			daily: clock.daily,
			weekly: clock.weekly,
		},
	};
}

export function researchTickIdempotencyKey(tripId: string, period: string): string {
	return `${RESEARCH_TICK_SIGNAL_TYPE}:${tripId}:${period}`;
}

export function researchPostIdempotencyKey(
	tripId: string,
	taskId: string,
	period: string,
): string {
	return `schedule.research:${tripId}:${taskId}:${period}`;
}
